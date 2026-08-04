/**
 * 재고·발주·주문 승인 API 클라이언트 (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'
import { getMyOrderHistoryWithCache, getMyUsageHistoryWithCache } from '../offline/erp-offline'
import { invalidateAppDataCache } from './app-data-cache'
import type { PaginatedList } from './types'

export interface StockStatusItem {
  code: string
  name: string
  image?: string
  spec: string
  qty: number
  safeQty: number
  store: string
  price?: number
  cost?: number
  category?: string
  purchaseSource?: 'hq' | 'store'
  /** true이면 품목 일시중지(발주 중지). 메뉴 관리와 연동 */
  orderDisabled?: boolean
  /** 재고 기본 단위. 비어 있으면 단위 선택 없음 (하위 호환) */
  stockBaseUnit?: string
  /** 조정/조사 시 선택 단위 옵션 (하위 호환) */
  stockUnitOptions?: { unit: string; factor: number }[]
  /** 표준 단위 목록. (totalQuantity) [unit] = 1 규격 */
  standardUnits?: { unit: string; totalQuantity: number }[]
}

export interface AdjustmentHistoryItem {
  date: string
  store: string
  item: string
  itemCode?: string
  category?: string
  spec: string
  diff: number
  reason: string
}

export async function saveSafetyStock(params: {
  store: string
  code: string
  qty: number
}) {
  const res = await apiFetchWithOffline('/api/saveSafetyStock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getAdjustmentHistory(params: {
  startStr: string
  endStr: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
    ...(params.storeFilter ? { storeFilter: params.storeFilter } : {}),
  })
  const res = await apiFetchWithOffline(`/api/getAdjustmentHistory?${q}`)
  return jsonAsArray<AdjustmentHistoryItem>(await res.json())
}

/** stock_logs Usage 기간 합계 (발주 도움). 기준일·기간은 방콕 달력. */
export async function getStockUsageAggregate(params: {
  storeName: string
  days?: number
  endDate?: string
}) {
  const q = new URLSearchParams({ storeName: params.storeName })
  if (params.days != null) q.set('days', String(params.days))
  if (params.endDate?.trim()) q.set('endDate', params.endDate.trim())
  const res = await apiFetchWithOffline(`/api/getStockUsageAggregate?${q}`)
  return res.json() as Promise<{
    success: boolean
    usageByCode: Record<string, number>
    startYmd: string
    endYmd: string
    days: number
    message?: string
    /** 본사: 출고 합계 / 매장: Usage 합계 */
    consumptionBasis?: 'hq_outbound' | 'store_usage'
  }>
}

export type IngredientUsageMenuContribution = {
  menuId: string
  optionId: string
  menuLabel: string
  optionLabel: string
  theoreticalQty: number
}

export type IngredientUsageVarianceRow = {
  itemCode: string
  itemName: string
  unit: string
  cost: number
  ingredientType: 'food' | 'packaging' | 'unknown'
  theoreticalQty: number
  actualQty: number
  varianceQty: number
  variancePct: number | null
  varianceCost: number
  beginningQty: number
  endingQty: number
  inboundQty: number
  outboundQty: number
  usageQty: number
  adjustmentQty: number
  posQty: number
  hasAdjustment: boolean
  menuContributions: IngredientUsageMenuContribution[]
}

/** 원재료 이론 소진(판매×BOM) vs 실제 소진(재고등식) */
export async function getIngredientUsageVariance(params: {
  store: string
  startYmd: string
  endYmd: string
}) {
  const q = new URLSearchParams({
    store: params.store,
    startYmd: params.startYmd,
    endYmd: params.endYmd,
  })
  const res = await apiFetchWithOffline(`/api/getIngredientUsageVariance?${q}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    startYmd: string
    endYmd: string
    store: string
    posTruncated: boolean
    actualSource: 'rpc' | 'fallback' | 'none'
    unmatchedOrderLines: number
    orderCount: number
    rows: IngredientUsageVarianceRow[]
    warnings: string[]
  }>
}

export async function getStockStores() {
  const res = await apiFetchWithOffline('/api/getStockStores')
  return jsonAsArray<string>(await res.json())
}

export async function adjustStock(params: {
  store: string
  itemCode: string
  itemName?: string
  spec?: string
  diffQty: number
  memo?: string
  userRole?: string
  /** 재고 목록 기준일(방콕 YYYY-MM-DD). 월말 실사 등 과거 기준일 조정에 필요 */
  asOfDate?: string
}) {
  const res = await apiFetchWithOffline('/api/adjustStock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const json = await res.json()
  if (json?.success) invalidateAppDataCache()
  return json as Promise<{ success: boolean; message?: string }>
}

export async function processOrder(params: {
  storeName: string
  userName: string
  cart: {
    code?: string
    name: string
    price: number
    qty: number
    taxType?: string
    line_remarks?: string
  }[]
}) {
  const res = await apiFetchWithOffline('/api/processOrder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const json = await res.json()
  if (json?.success) invalidateAppDataCache()
  return json as Promise<{ success: boolean; message?: string }>
}

export interface OrderHistoryItem {
  id: number
  date: string
  deliveryDate: string
  deliveryDatesByOutbound?: Record<string, string>
  summary: string
  total: number
  status: string
  deliveryStatus?: string
  items: { name?: string; qty?: number; price?: number; receivedQty?: number; originalQty?: number; code?: string; outboundLocation?: string; index?: number }[]
  receivedIndices?: number[]
  userName?: string
  userNick?: string
  rejectReason?: string
  /** 강제 출고(출고 입력에서 직접 입력) 여부 */
  isForceOutbound?: boolean
}

export async function getMyOrderHistory(params: {
  store: string
  startStr: string
  endStr: string
  page?: number
  pageSize?: number
}): Promise<PaginatedList<OrderHistoryItem>> {
  const raw = await getMyOrderHistoryWithCache(params)
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as PaginatedList<OrderHistoryItem>).items)) {
    const p = raw as PaginatedList<OrderHistoryItem>
    return {
      items: p.items,
      total: p.total ?? 0,
      page: p.page ?? 1,
      pageSize: p.pageSize ?? 20,
    }
  }
  const arr = Array.isArray(raw) ? (raw as OrderHistoryItem[]) : []
  return { items: arr, total: arr.length, page: 1, pageSize: arr.length || 20 }
}

export interface UsageHistoryItem {
  date: string
  dateTime: string
  item: string
  itemCode?: string
  category?: string
  qty: number
  amount: number
  userName?: string
  userNick?: string
}

export async function processUsage(params: {
  storeName: string
  userName?: string
  items: { code?: string; name?: string; qty: number }[]
}) {
  const res = await apiFetchWithOffline('/api/processUsage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const json = await res.json()
  if (json?.success) invalidateAppDataCache()
  return json as Promise<{ success: boolean; message?: string }>
}

export async function getMyUsageHistory(params: {
  store: string
  startStr: string
  endStr: string
}) {
  const raw = await getMyUsageHistoryWithCache(params)
  return raw as UsageHistoryItem[]
}

export async function processOrderReceive(params: {
  orderRowId: number
  imageUrl?: string
  imageUrls?: string[]
  isPartialReceive?: boolean
  inspectedIndices?: number[]
  receivedQtys?: Record<number, number>
  /** 동일 수령 제출·오프라인 큐 재전송 시 서버 중복 방지 */
  idempotencyKey?: string
}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 90000)
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const idem = String(params.idempotencyKey || '').trim()
    if (idem) headers['X-Idempotency-Key'] = idem
    const res = await apiFetchWithOffline('/api/processOrderReceive', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
      signal: ctrl.signal,
    })
    const data = await res.json().catch(() => ({ success: false, message: '응답 파싱 실패' }))
    if (!res.ok) {
      return { success: false, message: data?.message || `요청 실패 (${res.status})` }
    }
    if (data?.success) invalidateAppDataCache()
    return data as { success: boolean; message?: string }
  } catch (e) {
    const isAbort = e instanceof Error && e.name === 'AbortError'
    if (isAbort) {
      return { success: false, message: '요청 시간이 초과되었습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.' }
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export interface AdminOrderItem {
  row: number
  orderId: number
  date: string
  store: string
  userName?: string
  userNick?: string
  total: number
  status: string
  deliveryStatus: string
  deliveryDate: string
  /** 출고지별 배송일 {"본사":"2025-02-25","JIDUBANG":"2025-02-26"} */
  deliveryDatesByOutbound?: Record<string, string>
  items: {
    code?: string
    name?: string
    spec?: string
    line_remarks?: string
    lineRemarks?: string
    category?: string
    vendor?: string
    outboundLocation?: string
    qty?: number
    price?: number
    originalQty?: number
  }[]
  summary: string
  receivedIndices?: number[]
  rejectReason?: string
}

export async function getAdminOrders(params: {
  startStr: string
  endStr: string
  store?: string
  deliveryStatus?: string
  status?: string
  userStore?: string
  userRole?: string
  /** 주문번호로 검색 (미수금 #123 등) — 날짜 범위 밖이라도 해당 주문 조회 */
  orderId?: string | number
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.store) q.set('store', params.store)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  if (params.deliveryStatus) q.set('deliveryStatus', params.deliveryStatus)
  if (params.status) q.set('status', params.status)
  const orderIdVal = params.orderId != null ? String(params.orderId).replace(/^#/, '').trim() : ''
  if (orderIdVal && /^\d+$/.test(orderIdVal)) q.set('orderId', orderIdVal)
  const res = await apiFetchWithOffline(`/api/getAdminOrders?${q}`)
  const data = await res.json()
  return {
    list: (data.list || []) as AdminOrderItem[],
    stores: (data.stores || []) as string[],
  }
}

export async function getOrderFilterOptions() {
  const res = await apiFetchWithOffline('/api/getOrderFilterOptions')
  const data = await res.json()
  return {
    categories: (data.categories || []) as string[],
    vendors: (data.vendors || []) as string[],
  }
}

export interface AdminDashboardStats {
  unapprovedOrders: number
  thisMonthInbound: number
  thisMonthOutbound: number
  leavePending: number
  attPending: number
}

export async function getAdminDashboardStats() {
  const res = await apiFetchWithOffline('/api/getAdminDashboardStats')
  return res.json() as Promise<AdminDashboardStats>
}

export interface AdminActivityItem {
  id: string
  type: 'receiving' | 'shipping' | 'order' | 'leave' | 'employee'
  titleKey: string
  description: string
  descriptionKey?: string
  descriptionParams?: Record<string, string>
  time: string
  ts?: number
  timeKey?: 'justNow' | 'minAgo' | 'hourAgo' | 'dayAgo' | 'date'
  timeParam?: number | string
}

export async function getAdminRecentActivity() {
  const res = await apiFetchWithOffline('/api/getAdminRecentActivity')
  return jsonAsArray<AdminActivityItem>(await res.json())
}

export async function processOrderDecision(params: {
  orderId: number
  decision: 'Approved' | 'Rejected' | 'Hold'
  deliveryDate?: string
  /** 출고지별 배송일 - 우선 사용 */
  deliveryDatesByOutbound?: Record<string, string>
  rejectReason?: string
  userRole?: string
  processorName?: string
  updatedCart?: {
    code?: string
    name?: string
    spec?: string
    line_remarks?: string
    lineRemarks?: string
    price: number
    qty: number
  }[]
}) {
  const res = await apiFetchWithOffline('/api/processOrderDecision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const json = await res.json()
  if (json?.success) invalidateAppDataCache()
  return json as Promise<{ success: boolean; message?: string }>
}

export async function updateOrderDeliveryDates(params: {
  orderId: number
  deliveryDatesByOutbound: Record<string, string>
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/updateOrderDeliveryDates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateOrderDeliveryStatus(params: {
  orderId: number
  deliveryStatus: string
}) {
  const res = await apiFetchWithOffline('/api/updateOrderDeliveryStatus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => ({})) as { success?: boolean; message?: string }
  if (!res.ok) {
    throw new Error(data?.message || `배송 상태 변경 실패 (${res.status})`)
  }
  return data
}

export async function updateOrderCart(params: {
  orderId: number
  updatedCart: {
    code?: string
    name?: string
    spec?: string
    line_remarks?: string
    lineRemarks?: string
    price: number
    qty: number
  }[]
  deliveryStatus?: string
  receivedIndices?: number[]
}) {
  const res = await apiFetchWithOffline('/api/updateOrderCart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
