import 'server-only'

import { NextResponse } from 'next/server'
import type { PosOrderTypeValue } from '@/lib/pos-sales-order-type-filter'
import { loadPosBusinessDaySettingsContext, type PosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'
import { diffDaysInclusiveBangkok } from '@/lib/attendance-utils'
import { mapWithConcurrency } from '@/lib/map-with-concurrency'
import { posSalesBusinessDateRangeUtcEnvelope } from '@/lib/pos-sales-business-day-range'
import {
  mergePosSalesAnalyticsAggRows,
  POS_SALES_ANALYTICS_RPC_CHUNK_DAYS,
  POS_SALES_ANALYTICS_RPC_MIN_CHUNK_DAYS,
  splitPosSalesAnalyticsYmdChunks,
} from '@/lib/pos-sales-analytics-rpc-chunk'
import { normStoreKey } from '@/lib/store-list-keys'
import { expandSalesStoreCodesForFilterAsync } from '@/lib/pos-sales-store-filter'
import { supabaseRpc } from '@/lib/supabase-server'
import { isSupabaseStatementTimeoutError } from '@/lib/supabase-statement-timeout'
import type { PeriodAggRow } from '@/lib/pos-sales-period-aggregate'

/** RPC 57014 — 주문 전량 fetch 폴백 금지(그게 Vercel 60s 타임아웃의 원인). */
export class PosSalesAnalyticsRpcTimeoutError extends Error {
  readonly code = 'POS_SALES_ANALYTICS_RPC_TIMEOUT'
  constructor(cause?: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause ?? 'statement timeout')
    super(msg)
    this.name = 'PosSalesAnalyticsRpcTimeoutError'
  }
}

export function isPosSalesAnalyticsRpcTimeoutError(err: unknown): boolean {
  return err instanceof PosSalesAnalyticsRpcTimeoutError || isSupabaseStatementTimeoutError(err)
}

export function respondPosSalesAnalyticsTimeout(headers: Headers) {
  headers.set('X-Pos-Sales-Source', 'rpc-timeout')
  return NextResponse.json(
    {
      success: false,
      error: 'TIMEOUT',
      message: '매출 집계가 시간 초과되었습니다. 조회 기간을 줄여 다시 시도해 주세요.',
    },
    { status: 504, headers }
  )
}

export type PosSalesAnalyticsAggMode =
  | 'store'
  | 'store_channel'
  /** 매장×배달앱 (bucket_key=store, bucket_key2=platform) */
  | 'store_delivery_platform'
  | 'period'
  | 'period_by_store'
  | 'channel'
  | 'payment'
  | 'delivery_platform'
  | 'delivery_payment'
  /** channel + delivery_platform 한 스캔 (bucket_key2=channel|platform) */
  | 'delivery_app'
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
  cash_sales?: number | string | null
  credit_sales?: number | string | null
  qr_sales?: number | string | null
  other_sales?: number | string | null
  delivery_app_sales?: number | string | null
  crypto_sales?: number | string | null
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
  /** Omni JWT tenant — 없으면 request/storeCodes 로 resolve */
  tenantScope?: import('@/lib/saas-tenant-scope').SaasTenantScope
  request?: import('next/server').NextRequest
}): Promise<PosSalesAnalyticsAggRow[]> {
  const startStr = params.startStr.trim().slice(0, 10)
  const endStr = params.endStr.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
    return []
  }

  const {
    isSaasTenantQueryBlocked,
    resolveSaasTenantScope,
  } = await import('@/lib/saas-tenant-scope')

  let tenantScope = params.tenantScope
  if (!tenantScope && params.request) {
    const { getVerifiedAuth } = await import('@/lib/verify-auth')
    const auth = await getVerifiedAuth(params.request, { skipSaasGate: true })
    tenantScope = await resolveSaasTenantScope({
      auth,
      storeCode: params.storeCodes?.[0] ?? null,
    })
  }
  if (tenantScope && isSaasTenantQueryBlocked(tenantScope, 'pos_orders')) {
    return []
  }

  const bizCtx = params.bizCtx ?? (await loadPosBusinessDaySettingsContext(tenantScope?.tenantId))
  const expanded =
    params.storeCodes && params.storeCodes.length > 0
      ? await expandSalesStoreCodesForFilterAsync(params.storeCodes)
      : null

  const pTenantId =
    tenantScope?.enforce && tenantScope.tenantId ? tenantScope.tenantId : null

  const rpcArgs = {
    bizCtx,
    expanded,
    orderTypes: params.orderTypes,
    aggMode: params.aggMode,
    periodGroup: params.periodGroup,
    menuSearchTokens: params.menuSearchTokens,
    menuSearchAnd: params.menuSearchAnd,
    pTenantId,
  }

  return queryPosSalesAnalyticsAggChunked(
    { ...rpcArgs, startStr, endStr },
    POS_SALES_ANALYTICS_RPC_CHUNK_DAYS
  )
}

type PosSalesAnalyticsAggRpcArgs = {
  bizCtx: PosBusinessDaySettingsContext
  startStr: string
  endStr: string
  expanded: string[] | null
  orderTypes?: PosOrderTypeValue[] | null
  aggMode: PosSalesAnalyticsAggMode
  periodGroup?: string
  menuSearchTokens?: string[]
  menuSearchAnd?: boolean
  pTenantId: string | null
}

async function queryPosSalesAnalyticsAggOnce(
  args: PosSalesAnalyticsAggRpcArgs
): Promise<PosSalesAnalyticsAggRow[]> {
  const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(
    args.bizCtx,
    args.startStr,
    args.endStr
  )
  const rows = (await supabaseRpc<PosSalesAnalyticsAggRow[]>('get_pos_sales_analytics_agg', {
    p_start_utc: startISO,
    p_end_utc_exclusive: endISOExclusive,
    p_start_ymd: args.startStr,
    p_end_ymd: args.endStr,
    p_store_codes: args.expanded && args.expanded.length > 0 ? args.expanded : null,
    p_order_types: args.orderTypes?.length ? args.orderTypes : null,
    p_agg_mode: args.aggMode,
    p_period_group: args.periodGroup ?? 'day',
    p_biz_hours: buildPosSalesBizHoursRpcPayload(args.bizCtx),
    p_menu_search_tokens:
      args.menuSearchTokens && args.menuSearchTokens.length > 0 ? args.menuSearchTokens : null,
    p_menu_search_and: args.menuSearchAnd === true,
    p_tenant_id: args.pTenantId,
  })) as PosSalesAnalyticsAggRow[] | null
  return Array.isArray(rows) ? rows : []
}

/**
 * 31일을 넘는 구간은 나눠 집계한다.
 * 한 번에 5개월을 스캔하면 statement timeout 이 나고, 화면은 실패를 매출 0으로 보여 준다.
 * 시간 초과가 난 조각만 더 짧게 다시 나눈다.
 */
async function queryPosSalesAnalyticsAggChunked(
  args: PosSalesAnalyticsAggRpcArgs,
  chunkDays: number
): Promise<PosSalesAnalyticsAggRow[]> {
  const span = diffDaysInclusiveBangkok(args.startStr, args.endStr)
  if (span <= chunkDays) {
    try {
      return await queryPosSalesAnalyticsAggOnce(args)
    } catch (e) {
      if (!isSupabaseStatementTimeoutError(e) || span <= POS_SALES_ANALYTICS_RPC_MIN_CHUNK_DAYS) {
        throw e
      }
      return queryPosSalesAnalyticsAggChunked(
        args,
        Math.max(POS_SALES_ANALYTICS_RPC_MIN_CHUNK_DAYS, Math.floor(span / 2))
      )
    }
  }
  const chunks = splitPosSalesAnalyticsYmdChunks(args.startStr, args.endStr, chunkDays)
  const parts = await mapWithConcurrency(chunks, 3, (chunk) =>
    queryPosSalesAnalyticsAggChunked(
      { ...args, startStr: chunk.startStr, endStr: chunk.endStr },
      chunkDays
    )
  )
  return mergePosSalesAnalyticsAggRows(parts.flat())
}

export async function tryFetchPosSalesAnalyticsAgg(
  params: Parameters<typeof fetchPosSalesAnalyticsAgg>[0]
): Promise<PosSalesAnalyticsAggRow[] | null> {
  try {
    return await fetchPosSalesAnalyticsAgg(params)
  } catch (e) {
    console.warn('tryFetchPosSalesAnalyticsAgg:', e instanceof Error ? e.message : e)
    if (isSupabaseStatementTimeoutError(e)) {
      throw new PosSalesAnalyticsRpcTimeoutError(e)
    }
    return null
  }
}

/** 손익·AI 등: 타임아웃이어도 페이지 전체를 500으로 만들지 않음 */
export async function tryFetchPosSalesAnalyticsAggIgnoreTimeout(
  params: Parameters<typeof fetchPosSalesAnalyticsAgg>[0]
): Promise<PosSalesAnalyticsAggRow[] | null> {
  try {
    return await tryFetchPosSalesAnalyticsAgg(params)
  } catch (e) {
    if (isPosSalesAnalyticsRpcTimeoutError(e)) return null
    throw e
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
    cashSales: num(r.cash_sales),
    creditSales: num(r.credit_sales),
    qrSales: num(r.qr_sales),
    otherSales: num(r.other_sales),
    deliveryAppSales: num(r.delivery_app_sales),
    cryptoSales: num(r.crypto_sales),
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
