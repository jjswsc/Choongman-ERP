import 'server-only'

import { posBusinessDateYmdToUtcRange } from '@/lib/pos-business-day'
import {
  resolvePosBusinessHoursFromContext,
  type PosBusinessDaySettingsContext,
} from '@/lib/pos-business-day-server'
import { expandSalesStoreCodesForFilterAsync } from '@/lib/pos-sales-store-filter'
import { supabaseRpc } from '@/lib/supabase-server'

export type PosSalesPeriodSummary = {
  completedCount: number
  completedTotal: number
  completedCash: number
  pendingCount: number
}

type RpcSummaryRow = {
  completed_count?: number | string | null
  completed_total?: number | string | null
  completed_cash?: number | string | null
  pending_count?: number | string | null
}

export function normalizePosSalesPeriodSummaryRow(
  row: RpcSummaryRow | null | undefined
): PosSalesPeriodSummary {
  return {
    completedCount: Math.max(0, Math.trunc(Number(row?.completed_count ?? 0) || 0)),
    completedTotal: Number(row?.completed_total ?? 0) || 0,
    completedCash: Number(row?.completed_cash ?? 0) || 0,
    pendingCount: Math.max(0, Math.trunc(Number(row?.pending_count ?? 0) || 0)),
  }
}

/**
 * getPosTodaySales 단일 매장·단일 영업일 RPC 경로.
 * 복수 매장은 tryFetchPosSalesPeriodSummaryByStores (매장별 영업시간 병렬).
 */
export function canUsePosSalesPeriodSummaryRpc(params: {
  startStr: string
  endStr: string
  storeCode: string
}): boolean {
  const start = params.startStr.trim().slice(0, 10)
  const end = params.endStr.trim().slice(0, 10)
  const store = params.storeCode.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start !== end) return false
  if (!store || store.toLowerCase() === 'all') return false
  return true
}

/** 해당 매장 영업시간 기준 UTC 봉투 — fetch 후 영업일 필터와 동일 창에 맞춤 */
export function posSalesPeriodSummaryUtcEnvelopeForStore(
  bizCtx: PosBusinessDaySettingsContext,
  businessYmd: string,
  storeCode: string
): { startISO: string; endISOExclusive: string } {
  const hours = resolvePosBusinessHoursFromContext(bizCtx, storeCode)
  return posBusinessDateYmdToUtcRange(businessYmd.slice(0, 10), hours)
}

/**
 * RPC `get_pos_sales_period_summary` — 실패·빈 응답 시 null (호출측에서 기존 select fallback).
 */
export async function tryFetchPosSalesPeriodSummaryRpc(params: {
  startISO: string
  endISOExclusive: string
  storeCode: string
}): Promise<PosSalesPeriodSummary | null> {
  const storeCodes = await expandSalesStoreCodesForFilterAsync([params.storeCode])
  try {
    const rows = (await supabaseRpc<RpcSummaryRow[]>('get_pos_sales_period_summary', {
      p_start_utc: params.startISO,
      p_end_utc_exclusive: params.endISOExclusive,
      p_store_codes: storeCodes.length > 0 ? storeCodes : null,
    })) as RpcSummaryRow[] | null
    if (!Array.isArray(rows) || rows.length === 0) return null
    return normalizePosSalesPeriodSummaryRow(rows[0])
  } catch (e) {
    console.warn('tryFetchPosSalesPeriodSummaryRpc:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * 복수 매장 당일 요약 — 매장별 영업시간 봉투로 RPC를 병렬 호출.
 * 하나라도 실패하면 null (호출측에서 주문 전량 fetch 폴백).
 */
export async function tryFetchPosSalesPeriodSummaryByStores(params: {
  bizCtx: PosBusinessDaySettingsContext
  businessYmd: string
  storeCodes: string[]
}): Promise<Record<string, PosSalesPeriodSummary> | null> {
  const unique = [
    ...new Set(params.storeCodes.map((c) => String(c || '').trim()).filter(Boolean)),
  ]
  if (unique.length === 0) return null
  const ymd = params.businessYmd.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null

  const settled = await Promise.all(
    unique.map(async (storeCode) => {
      const { startISO, endISOExclusive } = posSalesPeriodSummaryUtcEnvelopeForStore(
        params.bizCtx,
        ymd,
        storeCode
      )
      const summary = await tryFetchPosSalesPeriodSummaryRpc({
        startISO,
        endISOExclusive,
        storeCode,
      })
      return { storeCode, summary }
    })
  )
  if (settled.some((r) => r.summary == null)) return null
  const byStore: Record<string, PosSalesPeriodSummary> = {}
  for (const row of settled) {
    byStore[row.storeCode] = row.summary!
  }
  return byStore
}
