/**
 * 매출 필터 옵션 (매장 목록). pos_orders 기준.
 * startStr~endStr: POS 영업일 라벨 구간에 맞춘 UTC 봉투(posSalesBusinessDateRangeUtcEnvelope)와 동일.
 *
 * 우선 RPC `get_pos_sales_filter_store_codes`: DB에서 DISTINCT만 반환해 PostgREST·Node 메모리 부담을 줄임.
 * RPC 미배포 시 기존 select + filterRowsByPosSalesBusinessDateRange 폴백(영업일 라벨 2차 필터 유지).
 * 기간 내 주문이 없어도 erp_stores 활성 매장은 목록에 포함(매장 선택 불가 방지).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { filterRowsByPosSalesBusinessDateRange, posSalesBusinessDateRangeUtcEnvelope } from '@/lib/pos-sales-business-day-range'
import { loadPosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { dedupeStoreCodesForPicker } from '@/lib/erp-store-list-grab-enrich'
import { filterPosSalesStoreOptionsForManagement, scopePosSalesStoreCodesToTenant } from '@/lib/pos-sales-test-office'
import { fetchErpStoresMaster, fetchErpStoresMasterForTenant, type ErpStoreMasterRow } from '@/lib/erp-store-master'
import { isLegacyChoongmanErpSupabase } from '@/lib/erp-legacy-supabase'
import { shouldEnforceSaasForAuth } from '@/lib/saas/saas-enforce'
import type { JwtPayload } from '@/lib/jwt-auth'

const POS_SALES_FILTER_OPTIONS_SCAN_MAX_ROWS = 1_000_000

async function mergeErpStoreCodesIntoSet(posSet: Set<string>, masters: ErpStoreMasterRow[]): Promise<void> {
  for (const row of masters || []) {
    const code = String(row.store_code ?? '').trim()
    if (code) posSet.add(code)
  }
}

async function finalizePosOptions(posSet: Set<string>, masters: ErpStoreMasterRow[]): Promise<string[]> {
  const deduped = dedupeStoreCodesForPicker(Array.from(posSet), masters)
  return filterPosSalesStoreOptionsForManagement(deduped).sort()
}

/** Omni는 로그인 회사 매장만. 충만은 기존처럼 전체. */
async function salesStoreMastersForAuth(auth: JwtPayload | null): Promise<{
  masters: ErpStoreMasterRow[]
  tenantCodes: string[] | null
}> {
  const tenantId = String(auth?.tenantId || '').trim()
  if (!tenantId || isLegacyChoongmanErpSupabase() || !shouldEnforceSaasForAuth(tenantId)) {
    try {
      return { masters: await fetchErpStoresMaster(), tenantCodes: null }
    } catch {
      return { masters: [], tenantCodes: null }
    }
  }
  const masters = await fetchErpStoresMasterForTenant(tenantId, String(auth?.company || ''))
  return {
    masters,
    tenantCodes: masters.map((row) => String(row.store_code || '').trim()).filter(Boolean),
  }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()

    if (!startStr || !endStr) {
      return NextResponse.json({ posOptions: [] }, { headers })
    }

    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const { masters, tenantCodes } = await salesStoreMastersForAuth(auth)
    if (tenantCodes) headers.set('Cache-Control', 'private, no-store')
    const bizCtx = await loadPosBusinessDaySettingsContext(auth?.tenantId)
    const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(bizCtx, startStr, endStr)

    try {
      const rpcRows = (await supabaseRpc<{ store_code?: string | null }[]>('get_pos_sales_filter_store_codes', {
        p_start_utc: startISO,
        p_end_utc_exclusive: endISOExclusive,
      })) as { store_code?: string | null }[] | null
      const posSet = new Set<string>()
      for (const r of rpcRows || []) {
        const p = String(r.store_code ?? '').trim()
        if (p) posSet.add(p)
      }
      await mergeErpStoreCodesIntoSet(posSet, masters)
      const scoped = scopePosSalesStoreCodesToTenant(Array.from(posSet), tenantCodes)
      const posOptions = await finalizePosOptions(new Set(scoped), masters)
      return NextResponse.json({ posOptions, source: 'rpc' as const }, { headers })
    } catch (_rpcErr) {
      const filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
      const rowsRaw = (await supabaseSelectFilterAllPages('pos_orders', filter, {
        pageSize: 8000,
        maxRows: POS_SALES_FILTER_OPTIONS_SCAN_MAX_ROWS,
        select: 'store_code,created_at',
      })) as { store_code?: string; created_at?: string }[]

      const rows = filterRowsByPosSalesBusinessDateRange(rowsRaw, bizCtx, startStr, endStr)

      const posSet = new Set<string>()
      for (const r of rows) {
        const p = String(r.store_code ?? '').trim()
        if (p) posSet.add(p)
      }
      await mergeErpStoreCodesIntoSet(posSet, masters)
      const scoped = scopePosSalesStoreCodesToTenant(Array.from(posSet), tenantCodes)
      const posOptions = await finalizePosOptions(new Set(scoped), masters)
      if (rowsRaw.length >= POS_SALES_FILTER_OPTIONS_SCAN_MAX_ROWS) headers.set('X-Sales-Truncated', '1')

      return NextResponse.json({ posOptions, source: 'select' as const }, { headers })
    }
  } catch (e) {
    console.error('posSalesFilterOptions:', e)
    return NextResponse.json({ posOptions: [] }, { headers })
  }
}
