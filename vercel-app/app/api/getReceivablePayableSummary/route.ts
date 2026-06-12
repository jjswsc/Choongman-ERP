/**
 * 미수금/미지급금 잔액 요약
 * - type: receivable | payable
 * - DB RPC로 집계 (limit 없음, store/vendor별 1행만 반환)
 * - receivable: store_name으로 vendors 매칭(gps_name/name) → vendorCode, vendorName 포함
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc, supabaseSelectFilter, supabaseSelect, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  aggregatePayableBalancesByVendor,
  buildPayableAttributionMaps,
  filterPayableRowsByStore,
  isPayableStoreFilterActive,
  type PayableTransactionRow,
} from '@/lib/payable-attributed-store'
import {
  normalizeReceivableStoreKey,
  pickReceivableDisplayStoreName,
  receivableStoreGroupKey,
} from '@/lib/receivable-store-key'

type ReceivableVendorEntry = { code: string; name: string }
type ReceivableVendorMaps = {
  storeToVendor: Map<string, ReceivableVendorEntry>
  vendorCodeToStores: Map<string, Set<string>>
}

function isAllFilterToken(v: string): boolean {
  const n = normalizeReceivableStoreKey(v)
  return !n || n === 'all'
}

function normalizeVendorCode(v: string): string {
  return String(v || '').trim().toLowerCase()
}

function matchesReceivableStoreNorm(storeName: string | null | undefined, storeFilter: string): boolean {
  const filterNorm = normalizeReceivableStoreKey(storeFilter)
  if (isAllFilterToken(filterNorm)) return true
  const storeNorm = normalizeReceivableStoreKey(storeName || '')
  if (!storeNorm) return false
  return storeNorm === filterNorm
}

function addVendorStoreAlias(
  storeToVendor: Map<string, ReceivableVendorEntry>,
  vendorCodeToStores: Map<string, Set<string>>,
  aliasRaw: string,
  entry: ReceivableVendorEntry
): void {
  const alias = normalizeReceivableStoreKey(aliasRaw)
  if (!alias) return
  storeToVendor.set(alias, entry)
  const byCode = vendorCodeToStores.get(entry.code) || new Set<string>()
  byCode.add(alias)
  vendorCodeToStores.set(entry.code, byCode)
}

function matchesReceivableStoreByVendorLink(
  storeName: string | null | undefined,
  vendorCodeFilter: string,
  maps: ReceivableVendorMaps
): boolean {
  const vendorCode = normalizeVendorCode(vendorCodeFilter)
  if (isAllFilterToken(vendorCode)) return true
  const storeNorm = normalizeReceivableStoreKey(storeName || '')
  if (!storeNorm) return false

  const aliasesByCode = maps.vendorCodeToStores.get(vendorCode)
  if (!aliasesByCode || aliasesByCode.size === 0) return false
  return aliasesByCode.has(storeNorm)
}

async function getReceivableVendorMaps(): Promise<ReceivableVendorMaps> {
  const vendors = (await supabaseSelect('vendors', {
    select: 'code,name,gps_name,sales_outlet',
    limit: 10000,
  })) as { code?: string; name?: string; gps_name?: string; sales_outlet?: string }[] | null
  const storeToVendor = new Map<string, ReceivableVendorEntry>()
  const vendorCodeToStores = new Map<string, Set<string>>()
  for (const v of vendors || []) {
    const code = String(v.code || '').trim().toLowerCase()
    const name = String(v.name || '').trim() || String(v.code || '').trim()
    const gpsName = String(v.gps_name || '').trim()
    const salesOutlet = String(v.sales_outlet || '').trim()
    if (!code) continue
    const entry = { code, name }
    if (salesOutlet) addVendorStoreAlias(storeToVendor, vendorCodeToStores, salesOutlet, entry)
    if (gpsName) addVendorStoreAlias(storeToVendor, vendorCodeToStores, gpsName, entry)
    if (name) addVendorStoreAlias(storeToVendor, vendorCodeToStores, name, entry)
    if (salesOutlet && salesOutlet.startsWith('CM ')) {
      addVendorStoreAlias(storeToVendor, vendorCodeToStores, salesOutlet.slice(3).trim(), entry)
    }
    if (salesOutlet && !salesOutlet.startsWith('CM ')) {
      addVendorStoreAlias(storeToVendor, vendorCodeToStores, `CM ${salesOutlet}`, entry)
    }
    if (gpsName && gpsName.startsWith('CM ')) {
      addVendorStoreAlias(storeToVendor, vendorCodeToStores, gpsName.slice(3).trim(), entry)
    }
    if (gpsName && !gpsName.startsWith('CM ')) {
      addVendorStoreAlias(storeToVendor, vendorCodeToStores, `CM ${gpsName}`, entry)
    }
  }
  return { storeToVendor, vendorCodeToStores }
}

function mergeReceivableSummaryRows(
  rows: { store_name?: string; balance?: number; item_count?: number }[]
): { storeName: string; balance: number; count: number }[] {
  const merged = new Map<string, { storeName: string; balance: number; count: number }>()
  for (const r of rows || []) {
    const storeName = String(r.store_name ?? '').trim()
    if (!storeName) continue
    const groupKey = receivableStoreGroupKey(storeName)
    const prev = merged.get(groupKey)
    const balance = Number(r.balance ?? 0)
    const count = Number(r.item_count ?? 0)
    if (prev) {
      prev.storeName = pickReceivableDisplayStoreName(prev.storeName, storeName)
      prev.balance += balance
      prev.count += count
    } else {
      merged.set(groupKey, { storeName, balance, count })
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.balance - a.balance)
}

async function getPayableSummaryWithStoreFilter(params: {
  vendorFilter: string
  endStr: string
  storeFilter: string
}): Promise<{ list: { vendorCode: string; balance: number; count: number }[]; totalAmount: number }> {
  const { vendorFilter, endStr, storeFilter } = params
  const parts: string[] = []
  if (vendorFilter) parts.push(`vendor_code=ilike.${encodeURIComponent(vendorFilter)}`)
  if (endStr) parts.push(`trans_date=lte.${endStr}`)
  const filter = parts.length ? parts.join('&') : 'id=gt.0'
  const rows = (await supabaseSelectFilterAllPages('payable_transactions', filter, {
    select: 'vendor_code,amount,ref_type,ref_id,bank_transaction_id,expense_accrual_id,petty_cash_transaction_id',
    pageSize: 8000,
    maxRows: 2_000_000,
  })) as PayableTransactionRow[]
  const attributionMaps = await buildPayableAttributionMaps(rows)
  const filtered = filterPayableRowsByStore(rows, storeFilter, attributionMaps)
  const list = aggregatePayableBalancesByVendor(filtered)
  const totalAmount = list.reduce((sum, i) => sum + (i.balance ?? 0), 0)
  return { list, totalAmount }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const type = String(searchParams.get('type') || 'receivable').trim().toLowerCase()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim().slice(0, 10)
  const requestedStoreFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const vendorFilter = String(searchParams.get('vendorFilter') || searchParams.get('vendor') || '').trim()
  const payableStoreFilterActive =
    type === 'payable' && isPayableStoreFilterActive(requestedStoreFilter)
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)

  const canSelectStores = isOfficeRole(userRole) || isAccountingRole(userRole)
  const isManager = (userRole.includes('manager') || userRole.includes('franchisee')) && !canSelectStores
  if (type === 'payable' && isManager) {
    return NextResponse.json({ type: 'payable', list: [] }, { headers })
  }

  try {
    if (type === 'payable') {
      if (payableStoreFilterActive) {
        const scoped = await getPayableSummaryWithStoreFilter({
          vendorFilter,
          endStr,
          storeFilter: requestedStoreFilter,
        })
        return NextResponse.json({ type: 'payable', list: scoped.list, totalAmount: scoped.totalAmount }, { headers })
      }

      const rows = (await supabaseRpc<{ vendor_code: string; balance: number; item_count: number }[]>(
        'get_payable_summary',
        {
          p_vendor_filter: vendorFilter || null,
          p_end_str: endStr || null,
        }
      )) as { vendor_code?: string; balance?: number; item_count?: number }[] | null

      const list = (rows || [])
        .map((r) => ({
          vendorCode: String(r.vendor_code ?? '').trim(),
          balance: Number(r.balance ?? 0),
          count: Number(r.item_count ?? 0),
        }))
        .filter((x) => x.vendorCode)
        .sort((a, b) => b.balance - a.balance)
      const totalAmount = list.reduce((sum, i) => sum + (i.balance ?? 0), 0)
      return NextResponse.json({ type: 'payable', list, totalAmount }, { headers })
    }

    // receivable
    const receivableVendorMaps = await getReceivableVendorMaps()
    let storeFilterVal = requestedStoreFilter
    if (!canSelectStores) {
      if (!requestedStoreFilter || requestedStoreFilter === 'All' || requestedStoreFilter === '전체') {
        storeFilterVal = String(allowedStores[0] || '').trim()
      } else {
        const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, requestedStoreFilter))
        if (!allowed) {
          return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
        }
      }
    }
    let rows = (await supabaseRpc<{ store_name: string; balance: number; item_count: number }[]>(
      'get_receivable_summary',
      {
        p_store_filter: null,
        p_end_str: endStr || null,
      }
    )) as { store_name?: string; balance?: number; item_count?: number }[] | null
    if (storeFilterVal) {
      rows = (rows || []).filter((r) =>
        canSelectStores
          ? matchesReceivableStoreByVendorLink(r.store_name, storeFilterVal, receivableVendorMaps)
          : matchesReceivableStoreNorm(r.store_name, storeFilterVal)
      )
    }

    const merged = mergeReceivableSummaryRows(rows || [])
    const list = merged
      .map((r) => {
        const vendor = receivableVendorMaps.storeToVendor.get(normalizeReceivableStoreKey(r.storeName))
        return {
          storeName: r.storeName,
          vendorCode: vendor?.code,
          vendorName: vendor?.name,
          balance: r.balance,
          count: r.count,
        }
      })
      .filter((x) => x.storeName)
    const totalAmount = list.reduce((sum, i) => sum + (i.balance ?? 0), 0)
    return NextResponse.json({ type: 'receivable', list, totalAmount }, { headers })
  } catch (_rpcErr) {
    try {
      // RPC 미배포 시 fallback: 기존 select + JS 집계
      const pParts: string[] = []
      if (vendorFilter) pParts.push(`vendor_code=ilike.${encodeURIComponent(vendorFilter)}`)
      if (endStr) pParts.push(`trans_date=lte.${endStr}`)
      const pFilter = pParts.length ? pParts.join('&') : 'id=gt.0'

      const rParts: string[] = []
      const receivableVendorMaps = await getReceivableVendorMaps()
      let fallbackStoreFilter = requestedStoreFilter
      if (!canSelectStores) {
        fallbackStoreFilter = (!requestedStoreFilter || requestedStoreFilter === 'All' || requestedStoreFilter === '전체')
          ? String(allowedStores[0] || '').trim()
          : requestedStoreFilter
      }
      if (endStr) rParts.push(`trans_date=lte.${endStr}`)
      const rFilter = rParts.length ? rParts.join('&') : 'id=gt.0'

      const rows =
        type === 'payable'
          ? ((await supabaseSelectFilter('payable_transactions', pFilter, {
              order: 'trans_date.desc',
              limit: 20000,
            })) as { vendor_code?: string; amount?: number }[])
          : ((await supabaseSelectFilter('receivable_transactions', rFilter, {
              order: 'trans_date.desc',
              limit: 20000,
            })) as { store_name?: string; amount?: number }[])

      if (type === 'payable') {
        let payableRows = (rows || []) as PayableTransactionRow[]
        if (payableStoreFilterActive) {
          const attributionMaps = await buildPayableAttributionMaps(payableRows)
          payableRows = filterPayableRowsByStore(payableRows, requestedStoreFilter, attributionMaps)
        }
        const list = aggregatePayableBalancesByVendor(payableRows)
        const totalAmount = list.reduce((sum, i) => sum + (i.balance ?? 0), 0)
        return NextResponse.json({ type: 'payable', list, totalAmount }, { headers })
      }

      const byStore: Record<string, { displayName: string; balance: number; count: number }> = {}
      let receivableRows = (rows || []) as { store_name?: string; amount?: number }[]
      if (fallbackStoreFilter) {
        receivableRows = receivableRows.filter((r) =>
          canSelectStores
            ? matchesReceivableStoreByVendorLink(r.store_name, fallbackStoreFilter, receivableVendorMaps)
            : matchesReceivableStoreNorm(r.store_name, fallbackStoreFilter)
        )
      }
      for (const r of receivableRows) {
        const sn = String(r.store_name || '').trim()
        if (!sn) continue
        const groupKey = receivableStoreGroupKey(sn)
        if (!byStore[groupKey]) byStore[groupKey] = { displayName: sn, balance: 0, count: 0 }
        byStore[groupKey].displayName = pickReceivableDisplayStoreName(byStore[groupKey].displayName, sn)
        byStore[groupKey].balance += Number(r.amount ?? 0)
        byStore[groupKey].count += 1
      }
      const list = Object.entries(byStore)
        .map(([, v]) => {
          const storeName = v.displayName
          const vendor = receivableVendorMaps.storeToVendor.get(normalizeReceivableStoreKey(storeName))
          return {
            storeName,
            vendorCode: vendor?.code,
            vendorName: vendor?.name,
            balance: v.balance,
            count: v.count,
          }
        })
        .sort((a, b) => b.balance - a.balance)
      const totalAmount = list.reduce((sum, i) => sum + (i.balance ?? 0), 0)
      return NextResponse.json({ type: 'receivable', list, totalAmount }, { headers })
    } catch (e) {
      console.error('getReceivablePayableSummary:', e)
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed' },
        { status: 500, headers }
      )
    }
  }
}
