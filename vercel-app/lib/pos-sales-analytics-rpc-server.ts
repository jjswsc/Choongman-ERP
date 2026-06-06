import 'server-only'

import type { PosOrderTypeValue } from '@/lib/pos-sales-order-type-filter'
import { loadPosBusinessDaySettingsContext, type PosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'
import { posSalesBusinessDateRangeUtcEnvelope } from '@/lib/pos-sales-business-day-range'
import { normStoreKey } from '@/lib/store-list-keys'
import { expandSalesStoreCodesForFilterAsync } from '@/lib/pos-sales-store-filter'
import { supabaseRpc } from '@/lib/supabase-server'
import type { PeriodAggRow } from '@/lib/pos-sales-period-aggregate'

export type PosSalesAnalyticsAggMode =
  | 'store'
  | 'store_channel'
  | 'period'
  | 'period_by_store'
  | 'channel'
  | 'payment'
  | 'delivery_platform'
  | 'menu'

export type PosSalesAnalyticsAggRow = {
  bucket_key?: string | null
  bucket_key2?: string | null
  order_count?: number | string | null
  subtotal?: number | string | null
  vat?: number | string | null
  discount?: number | string | null
  service_amt?: number | string | null
  total?: number | string | null
  guest_sum?: number | string | null
  dine_in_order_count?: number | string | null
  dine_in_total?: number | string | null
  dine_in_guest_sum?: number | string | null
  menu_qty?: number | string | null
  payment_key?: string | null
}

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function int(v: unknown): number {
  return Math.max(0, Math.trunc(num(v)))
}

export function buildPosSalesBizHoursRpcPayload(ctx: PosBusinessDaySettingsContext): Record<string, unknown> {
  const stores: Record<string, unknown> = {}
  for (const [k, h] of ctx.byNormKey.entries()) {
    stores[k] = {
      startHour: h.start.hour,
      startMinute: h.start.minute,
      endHour: h.end.hour,
      endMinute: h.end.minute,
    }
  }
  return {
    global: {
      startHour: ctx.globalDefault.start.hour,
      startMinute: ctx.globalDefault.start.minute,
      endHour: ctx.globalDefault.end.hour,
      endMinute: ctx.globalDefault.end.minute,
    },
    stores,
  }
}

export async function fetchPosSalesAnalyticsAgg(params: {
  startStr: string
  endStr: string
  storeCodes?: string[]
  orderTypes?: PosOrderTypeValue[] | null
  aggMode: PosSalesAnalyticsAggMode
  periodGroup?: string
  menuSearchTokens?: string[]
  menuSearchAnd?: boolean
  bizCtx?: PosBusinessDaySettingsContext
}): Promise<PosSalesAnalyticsAggRow[]> {
  const startStr = params.startStr.trim().slice(0, 10)
  const endStr = params.endStr.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
    return []
  }

  const bizCtx = params.bizCtx ?? (await loadPosBusinessDaySettingsContext())
  const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(bizCtx, startStr, endStr)
  const expanded =
    params.storeCodes && params.storeCodes.length > 0
      ? await expandSalesStoreCodesForFilterAsync(params.storeCodes)
      : null

  const rows = (await supabaseRpc<PosSalesAnalyticsAggRow[]>('get_pos_sales_analytics_agg', {
    p_start_utc: startISO,
    p_end_utc_exclusive: endISOExclusive,
    p_start_ymd: startStr,
    p_end_ymd: endStr,
    p_store_codes: expanded && expanded.length > 0 ? expanded : null,
    p_order_types: params.orderTypes?.length ? params.orderTypes : null,
    p_agg_mode: params.aggMode,
    p_period_group: params.periodGroup ?? 'day',
    p_biz_hours: buildPosSalesBizHoursRpcPayload(bizCtx),
    p_menu_search_tokens:
      params.menuSearchTokens && params.menuSearchTokens.length > 0 ? params.menuSearchTokens : null,
    p_menu_search_and: params.menuSearchAnd === true,
  })) as PosSalesAnalyticsAggRow[] | null

  return Array.isArray(rows) ? rows : []
}

export async function tryFetchPosSalesAnalyticsAgg(
  params: Parameters<typeof fetchPosSalesAnalyticsAgg>[0]
): Promise<PosSalesAnalyticsAggRow[] | null> {
  try {
    return await fetchPosSalesAnalyticsAgg(params)
  } catch (e) {
    console.warn('tryFetchPosSalesAnalyticsAgg:', e instanceof Error ? e.message : e)
    return null
  }
}

export function mapAnalyticsAggRowToPeriodRow(r: PosSalesAnalyticsAggRow): PeriodAggRow {
  const count = int(r.order_count)
  const total = num(r.total)
  const dineInOrderCount = int(r.dine_in_order_count)
  const dineInTotal = num(r.dine_in_total)
  const dineInGuestSum = int(r.dine_in_guest_sum)
  const key = String(r.bucket_key ?? '').trim()
  return {
    label: key,
    key,
    sales: total,
    count,
    subtotal: num(r.subtotal),
    vat: num(r.vat),
    discount: num(r.discount),
    service: num(r.service_amt),
    total,
    guestSum: int(r.guest_sum),
    dineInOrderCount,
    dineInTotal,
    dineInGuestSum,
    salesPerDineInOrder:
      dineInOrderCount > 0 ? Math.round((dineInTotal / dineInOrderCount) * 100) / 100 : 0,
    salesPerGuest:
      dineInGuestSum > 0 ? Math.round((dineInTotal / dineInGuestSum) * 100) / 100 : 0,
    salesPerOrder: count > 0 ? Math.round((total / count) * 100) / 100 : 0,
  }
}

export function sortPeriodAggRows(rows: PeriodAggRow[], groupBy: string): PeriodAggRow[] {
  const g = String(groupBy || 'day').toLowerCase()
  if (g === 'dow') {
    return [...rows].sort((a, b) => Number(a.key) - Number(b.key))
  }
  if (g === 'hour') {
    return Array.from({ length: 24 }, (_, h) => {
      const hk = String(h).padStart(2, '0')
      const hit = rows.find((r) => r.key === hk)
      return hit ?? mapAnalyticsAggRowToPeriodRow({ bucket_key: hk, order_count: 0, total: 0 })
    })
  }
  return [...rows].sort((a, b) => a.key.localeCompare(b.key))
}

export function buildPeriodSeriesFromAnalyticsAggRows(
  rows: PosSalesAnalyticsAggRow[],
  groupBy: string
): Record<string, PeriodAggRow[]> {
  const series: Record<string, PeriodAggRow[]> = {}
  for (const r of rows) {
    const store = String(r.bucket_key2 ?? '').trim()
    if (!store) continue
    const periodRow = mapAnalyticsAggRowToPeriodRow({ ...r, bucket_key: r.bucket_key })
    if (!series[store]) series[store] = []
    series[store].push(periodRow)
  }
  for (const k of Object.keys(series)) {
    series[k] = sortPeriodAggRows(series[k]!, groupBy)
  }
  return series
}

export function normStoreKeyForRpcLookup(raw: string): string {
  return normStoreKey(raw)
}
