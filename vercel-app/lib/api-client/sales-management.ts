/**
 * 매출 관리 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray, jsonAsPlainObject, jsonAsStringArray } from '../safe-api-json'

/** 실시간 매출 등 — CDN·브라우저 캐시 우회 */
function appendPosSalesFreshParam(q: URLSearchParams, fresh?: boolean) {
  if (fresh) q.set('fresh', '1')
}

/** 매출 집계 API — 장시간 hang 방지 (12매장·수개월 풀스캔 폴백 등) */
const POS_SALES_CLIENT_TIMEOUT_MS = 45_000

async function posSalesApiFetch(pathWithQuery: string, fresh?: boolean): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), POS_SALES_CLIENT_TIMEOUT_MS)
  try {
    return await apiFetchWithOffline(pathWithQuery, {
      signal: ctrl.signal,
      ...(fresh ? { cache: 'no-store' as RequestCache } : {}),
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function getPosSalesByStore(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  /** dine_in / takeout / delivery — 복수 시 합산(OR) */
  orderTypes?: string[]
  /** true면 Cache-Control no-store (실시간 매출「검색」) */
  fresh?: boolean
}) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  appendPosSalesFreshParam(q, params.fresh)
  const res = await posSalesApiFetch(`/api/posSalesByStore?${q}`, params.fresh)
  return res.json() as Promise<
    {
      storeName: string
      count: number
      subtotal: number
      vat: number
      discount: number
      service: number
      total: number
      guestSum: number
      dineInOrderCount: number
      dineInTotal: number
      dineInGuestSum: number
      /** 홀(dine_in) 매출 ÷ 홀 건수 — 테이블(건)당 */
      salesPerDineInOrder: number
      /** 홀 매출 ÷ 홀 손님 수 — 1인당 */
      salesPerGuest: number
      /** 조회에 포함된 전체 주문: 매출 ÷ 건수 */
      salesPerOrder: number
    }[]
  >
}

export async function getPosCancelReasonSummary(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  orderTypes?: string[]
}): Promise<{
  lineRows: { reason: string; count: number; amount: number }[]
  orderRows: { reason: string; count: number; amount: number }[]
  lineTotalCount: number
  lineTotalAmount: number
  orderTotalCount: number
  orderTotalAmount: number
  truncated?: boolean
}> {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  const res = await apiFetchWithOffline(`/api/posCancelReasonSummary?${q}`)
  const json = (await res.json()) as {
    lineRows?: { reason?: string; count?: number; amount?: number }[]
    orderRows?: { reason?: string; count?: number; amount?: number }[]
    rows?: { reason?: string; count?: number; amount?: number }[]
    lineTotalCount?: number
    lineTotalAmount?: number
    orderTotalCount?: number
    orderTotalAmount?: number
    totalCount?: number
    totalAmount?: number
    truncated?: boolean
  }
  const mapRow = (r: { reason?: string; count?: number; amount?: number }) => ({
    reason: String(r.reason ?? '').trim(),
    count: Math.max(0, Number(r.count ?? 0) || 0),
    amount: Math.max(0, Number(r.amount ?? 0) || 0),
  })
  const lineRows = Array.isArray(json.lineRows)
    ? json.lineRows.map(mapRow)
    : Array.isArray(json.rows)
      ? json.rows.map(mapRow)
      : []
  const orderRows = Array.isArray(json.orderRows) ? json.orderRows.map(mapRow) : []
  const lineTotalCount = Math.max(0, Number(json.lineTotalCount ?? 0) || 0)
  const lineTotalAmount = Math.max(0, Number(json.lineTotalAmount ?? 0) || 0)
  const orderTotalCount = Math.max(0, Number(json.orderTotalCount ?? 0) || 0)
  const orderTotalAmount = Math.max(0, Number(json.orderTotalAmount ?? 0) || 0)
  return {
    lineRows,
    orderRows,
    lineTotalCount: lineTotalCount || lineRows.reduce((s, r) => s + r.count, 0),
    lineTotalAmount: lineTotalAmount || lineRows.reduce((s, r) => s + r.amount, 0),
    orderTotalCount: orderTotalCount || orderRows.reduce((s, r) => s + r.count, 0),
    orderTotalAmount: orderTotalAmount || orderRows.reduce((s, r) => s + r.amount, 0),
    truncated: json.truncated === true,
  }
}

export async function getPosSalesFilterOptions(params: { startStr: string; endStr: string }) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  const res = await apiFetchWithOffline(`/api/posSalesFilterOptions?${q}`)
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return { posOptions: jsonAsStringArray(o.posOptions) }
}

export type PosSalesPeriodRow = {
  label: string
  key: string
  sales: number
  count: number
  subtotal: number
  vat: number
  discount: number
  service: number
  total: number
  guestSum: number
  dineInOrderCount: number
  dineInTotal: number
  dineInGuestSum: number
  salesPerDineInOrder: number
  salesPerGuest: number
  salesPerOrder: number
  cashSales: number
  creditSales: number
  qrSales: number
  otherSales: number
  deliveryAppSales: number
}

export type PosSalesByPeriodResult =
  | { kind: 'aggregate'; rows: PosSalesPeriodRow[]; truncated: boolean }
  | { kind: 'split'; series: Record<string, PosSalesPeriodRow[]>; truncated: boolean }

export async function getPosSalesByPeriod(params: {
  startStr: string
  endStr: string
  groupBy: 'year' | 'month' | 'week' | 'day' | 'dow' | 'hour'
  pos?: string
  stores?: string[]
  orderTypes?: string[]
  /** 0=일 … 6=토. 없으면 전체 */
  daysOfWeek?: number[]
  splitByStore?: boolean
  fresh?: boolean
}): Promise<PosSalesByPeriodResult> {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
    groupBy: params.groupBy,
  })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  if (params.daysOfWeek?.length) q.set('dows', params.daysOfWeek.join(','))
  if (params.splitByStore) q.set('splitByStore', '1')
  appendPosSalesFreshParam(q, params.fresh)
  const res = await posSalesApiFetch(`/api/posSalesByPeriod?${q}`, params.fresh)
  const truncated = res.headers.get('X-Sales-Truncated') === '1'
  const json: unknown = await res.json()
  if (
    json &&
    typeof json === 'object' &&
    'split' in json &&
    (json as { split?: unknown }).split === true &&
    'series' in json &&
    typeof (json as { series?: unknown }).series === 'object' &&
    (json as { series: Record<string, PosSalesPeriodRow[]> }).series !== null
  ) {
    const series = (json as { series: Record<string, PosSalesPeriodRow[]>; truncated?: boolean }).series
    const bodyTrunc = !!(json as { truncated?: boolean }).truncated
    return { kind: 'split', series, truncated: truncated || bodyTrunc }
  }
  return { kind: 'aggregate', rows: Array.isArray(json) ? (json as PosSalesPeriodRow[]) : [], truncated }
}

export async function getPosSalesByDeliveryApp(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  orderTypes?: string[]
  fresh?: boolean
}) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  appendPosSalesFreshParam(q, params.fresh)
  const res = await posSalesApiFetch(`/api/posSalesByDeliveryApp?${q}`, params.fresh)
  return res.json() as Promise<{
    items: {
      channelKey: string
      sales: number
      pct: number
      platforms?: { code: string; sales: number; pct: number }[]
    }[]
    total: number
  }>
}

export async function getPosSalesByStoreChannel(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  orderTypes?: string[]
  fresh?: boolean
}) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  appendPosSalesFreshParam(q, params.fresh)
  const res = await posSalesApiFetch(`/api/posSalesByStoreChannel?${q}`, params.fresh)
  return res.json() as Promise<
    { storeName: string; dineIn: number; takeout: number; delivery: number }[]
  >
}

export async function getPosSalesByChannel(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  orderTypes?: string[]
  fresh?: boolean
}) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  appendPosSalesFreshParam(q, params.fresh)
  const res = await posSalesApiFetch(`/api/posSalesByChannel?${q}`, params.fresh)
  return jsonAsArray<{ channelKey: string; sales: number }>(await res.json())
}

export async function getPosSalesByMenu(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  search?: string
  /** or: 쉼표 토큰 중 하나라도 일치(기본). and: 모두 일치 */
  searchMode?: 'or' | 'and'
  orderTypes?: string[]
}) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.search) q.set('search', params.search)
  if (params.searchMode === 'and') q.set('searchMode', 'and')
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  const res = await apiFetchWithOffline(`/api/posSalesByMenu?${q}`)
  return jsonAsArray<{ name: string; qty: number; sales: number }>(await res.json())
}

export type PosSalesPromoRow = {
  key: string
  promoId: string
  promoCode: string
  name: string
  kind: 'set' | 'campaign' | 'platform' | 'other'
  qty: number
  saleAmount: number
  regularAmount: number
  bundleDiscount: number
  discountPct: number
  discountPctOfGross: number
  saleSharePctOfGross: number
  bundleDiscountSharePct: number
  estimatedLineQty: number
  unresolvedLineQty: number
}

export type PosSalesPromoAggregateTotals = {
  qty: number
  saleAmount: number
  regularAmount: number
  bundleDiscount: number
  paymentDiscount: number
  totalDiscount: number
  periodGrossSales: number
  periodOrderCount: number
  promoLineSaleSharePct: number
  bundleDiscountPctOfGross: number
  paymentDiscountPctOfGross: number
  totalDiscountPctOfGross: number
  estimatedLineQty: number
  unresolvedLineQty: number
}

export type PosSalesPromoKindTotals = {
  kind: 'set' | 'campaign' | 'platform' | 'other'
  qty: number
  saleAmount: number
  regularAmount: number
  bundleDiscount: number
  discountPct: number
  saleSharePctOfGross: number
  bundleDiscountPctOfGross: number
  bundleDiscountSharePct: number
}

export type PosSalesPaymentDiscountRow = {
  key: string
  kind: 'manual' | 'collab' | 'coupon' | 'platform' | 'other'
  label: string
  code: string
  orderCount: number
  discountAmount: number
  discountPctOfGross: number
  discountSharePct: number
}

export type PosSalesPaymentDiscountTotals = {
  discountAmount: number
  orderCountWithDiscount: number
  periodGrossSales: number
  periodOrderCount: number
  discountPctOfGross: number
}

export type PosSalesPaymentKindTotals = {
  kind: 'manual' | 'collab' | 'coupon' | 'platform' | 'other'
  orderCount: number
  discountAmount: number
  discountPctOfGross: number
  discountSharePct: number
}

export type PosSalesPaymentDiscountResult = {
  rows: PosSalesPaymentDiscountRow[]
  totals: PosSalesPaymentDiscountTotals
  byKind: PosSalesPaymentKindTotals[]
}

export type PosSalesCombinedKindTotals = {
  layer: 'bundle' | 'payment'
  kind: string
  label: string
  discountAmount: number
  discountPctOfGross: number
  discountSharePct: number
}

export type PosSalesCombinedDiscountTotals = {
  periodGrossSales: number
  periodOrderCount: number
  bundleDiscount: number
  paymentDiscount: number
  totalDiscount: number
  bundleDiscountPctOfGross: number
  paymentDiscountPctOfGross: number
  totalDiscountPctOfGross: number
  promoLineSaleSharePct: number
  promoLineSaleAmount: number
  paymentOrderSharePct: number
}

export type PosSalesCombinedDiscountResult = {
  totals: PosSalesCombinedDiscountTotals
  byKind: PosSalesCombinedKindTotals[]
}

export type PosSalesByPromoResult = {
  rows: PosSalesPromoRow[]
  totals: PosSalesPromoAggregateTotals
  byKind?: PosSalesPromoKindTotals[]
  payment?: PosSalesPaymentDiscountResult
  combined?: PosSalesCombinedDiscountResult
  truncated?: boolean
}

export type PosSalesDiscountDrillOrderRow = {
  orderId: number
  orderNo: string
  storeCode: string
  orderType: string
  tableName: string
  total: number
  discountAmount: number
  discountReason?: string
  couponCode?: string
  promoLabel?: string
  paidAt?: string
  createdAt: string
}

export type PosSalesDiscountDrillDownResult = {
  success: boolean
  layer?: 'bundle' | 'payment'
  kind?: string | null
  rowKey?: string | null
  orders: PosSalesDiscountDrillOrderRow[]
  truncated?: boolean
  message?: string
}

export async function getPosSalesDiscountDrillDown(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  orderTypes?: string[]
  layer: 'bundle' | 'payment'
  kind?: string
  rowKey?: string
  limit?: number
}): Promise<PosSalesDiscountDrillDownResult> {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr, layer: params.layer })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  if (params.kind) q.set('kind', params.kind)
  if (params.rowKey) q.set('rowKey', params.rowKey)
  if (params.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline(`/api/posSalesDiscountDrillDown?${q}`)
  const truncated = res.headers.get('X-Sales-Truncated') === '1'
  const json = (await res.json()) as Partial<PosSalesDiscountDrillDownResult>
  return {
    success: json.success === true,
    layer: json.layer,
    kind: json.kind ?? null,
    rowKey: json.rowKey ?? null,
    orders: Array.isArray(json.orders) ? json.orders : [],
    truncated: truncated || json.truncated === true,
    message: json.message,
  }
}

export async function getPosSalesByPromo(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  search?: string
  searchMode?: 'or' | 'and'
  orderTypes?: string[]
}): Promise<PosSalesByPromoResult> {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.search) q.set('search', params.search)
  if (params.searchMode === 'and') q.set('searchMode', 'and')
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  const res = await apiFetchWithOffline(`/api/posSalesByPromo?${q}`)
  const truncated = res.headers.get('X-Sales-Truncated') === '1'
  const json = (await res.json()) as Partial<PosSalesByPromoResult>
  const emptyTotals: PosSalesPromoAggregateTotals = {
    qty: 0,
    saleAmount: 0,
    regularAmount: 0,
    bundleDiscount: 0,
    paymentDiscount: 0,
    totalDiscount: 0,
    periodGrossSales: 0,
    periodOrderCount: 0,
    promoLineSaleSharePct: 0,
    bundleDiscountPctOfGross: 0,
    paymentDiscountPctOfGross: 0,
    totalDiscountPctOfGross: 0,
    estimatedLineQty: 0,
    unresolvedLineQty: 0,
  }
  const emptyPayment: PosSalesPaymentDiscountResult = {
    rows: [],
    totals: {
      discountAmount: 0,
      orderCountWithDiscount: 0,
      periodGrossSales: 0,
      periodOrderCount: 0,
      discountPctOfGross: 0,
    },
    byKind: [],
  }
  const emptyCombined: PosSalesCombinedDiscountResult = {
    totals: {
      periodGrossSales: 0,
      periodOrderCount: 0,
      bundleDiscount: 0,
      paymentDiscount: 0,
      totalDiscount: 0,
      bundleDiscountPctOfGross: 0,
      paymentDiscountPctOfGross: 0,
      totalDiscountPctOfGross: 0,
      promoLineSaleSharePct: 0,
      promoLineSaleAmount: 0,
      paymentOrderSharePct: 0,
    },
    byKind: [],
  }
  return {
    rows: Array.isArray(json.rows) ? json.rows : [],
    totals: json.totals ?? emptyTotals,
    byKind: Array.isArray(json.byKind) ? json.byKind : [],
    payment: json.payment ?? emptyPayment,
    combined: json.combined ?? emptyCombined,
    truncated: truncated || !!json.truncated,
  }
}

export type PosSalesHierarchyLevel = 'main' | 'category' | 'menu' | 'option'

export type PosSalesHierarchyRow = {
  key: string
  label: string
  qty: number
  sales: number
  categoryMain?: string
  category?: string
  menuId?: string
}

export type PosSalesHierarchyByOrderType = {
  levels: Record<PosSalesHierarchyLevel, PosSalesHierarchyRow[]>
  totals: { qty: number; sales: number }
}

export type PosSalesByMenuHierarchyResult = {
  levels: Record<PosSalesHierarchyLevel, PosSalesHierarchyRow[]>
  totals: { qty: number; sales: number }
  truncated?: boolean
  byOrderType?: Partial<Record<'dine_in' | 'takeout' | 'delivery', PosSalesHierarchyByOrderType>>
}

export async function getPosSalesByMenuHierarchy(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  search?: string
  searchMode?: 'or' | 'and'
  orderTypes?: string[]
  splitByOrderType?: boolean
}): Promise<PosSalesByMenuHierarchyResult> {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.search) q.set('search', params.search)
  if (params.searchMode === 'and') q.set('searchMode', 'and')
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  if (params.splitByOrderType) q.set('splitByOrderType', '1')
  const res = await apiFetchWithOffline(`/api/posSalesByMenuHierarchy?${q}`)
  if (!res.ok) {
    throw new Error(`posSalesByMenuHierarchy ${res.status}`)
  }
  const truncated = res.headers.get('X-Sales-Truncated') === '1'
  const json = (await res.json()) as Partial<PosSalesByMenuHierarchyResult> & { success?: boolean; message?: string }
  if (json && json.success === false) {
    throw new Error(String(json.message || 'posSalesByMenuHierarchy failed'))
  }
  const emptyLevels: PosSalesByMenuHierarchyResult['levels'] = {
    main: [],
    category: [],
    menu: [],
    option: [],
  }
  return {
    levels: json.levels ?? emptyLevels,
    totals: json.totals ?? { qty: 0, sales: 0 },
    truncated: truncated || !!json.truncated,
    byOrderType: json.byOrderType,
  }
}

export async function getPosSalesByPayment(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  orderTypes?: string[]
}) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  const res = await apiFetchWithOffline(`/api/posSalesByPayment?${q}`)
  return jsonAsArray<{ paymentKey: string; sales: number }>(await res.json())
}

export type PosSalesPaymentBreakdown = {
  deliveryByChannel: { channelKey: string; sales: number }[]
  deliveryTotal: number
  creditByChannel: { channelKey: string; sales: number }[]
  creditTotal: number
  summary: { paymentKey: string; sales: number }[]
  /** 결산 Cash vs 주문 payment_cash 합 불일치 시 안내 */
  cashReconcile?: {
    liveCash: number
    settlementCash: number
    mismatch: boolean
    diff: number
  } | null
}

export async function getPosSalesByPaymentBreakdown(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  orderTypes?: string[]
}): Promise<PosSalesPaymentBreakdown> {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  const res = await apiFetchWithOffline(`/api/posSalesByPaymentBreakdown?${q}`)
  const json = (await res.json()) as Partial<PosSalesPaymentBreakdown>
  return {
    deliveryByChannel: Array.isArray(json.deliveryByChannel) ? json.deliveryByChannel : [],
    deliveryTotal: Number(json.deliveryTotal ?? 0) || 0,
    creditByChannel: Array.isArray(json.creditByChannel) ? json.creditByChannel : [],
    creditTotal: Number(json.creditTotal ?? 0) || 0,
    summary: Array.isArray(json.summary) ? json.summary : [],
    cashReconcile: json.cashReconcile ?? null,
  }
}
