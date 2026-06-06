/**
 * API 클라이언트
 * core fetch/auth는 lib/api/ 에서 분리
 * 쓰기 API는 apiFetchWithOffline 사용 → 네트워크 실패 시 큐 적재, 복구 후 자동 전송
 */
import type { PosPaymentOtherBreakdown } from './pos-payment-other-breakdown'
import type { MarketingCollabDetail } from './marketing-collab-detail'
import type { MarketingCampaignPhasePeriod } from './marketing-campaign-periods'
import { apiFetch } from './api/fetch'
import { apiFetchWithOffline } from './api/fetch-offline'
import { POS_BUSINESS_DAY_DEFAULT_START, POS_BUSINESS_DAY_DEFAULT_HOURS } from './pos-business-day'
import {
  getChecklistItemsWithCache,
  getVendorsForPurchaseWithCache,
  getVendorsForSalesWithCache,
  getReceivablePayableListWithCache,
  getPayableTransactionItemsWithCache,
  getPurchaseOrdersWithCache,
  getCheckHistoryWithCache,
  getBankTransactionsWithCache,
  getPettyCashListWithCache,
  getAdminItemsWithCache,
  getWarehouseLocationsWithCache,
  getAppDataWithCache,
  getMyOrderHistoryWithCache,
  getMyUsageHistoryWithCache,
  invalidateAppDataCache as invalidateAppDataCacheOffline,
  invalidateAdminItemsCache,
} from './offline/erp-offline'
import { fetchPosCatalogCached, notifyPosCatalogUpdated, posMenusCatalogCacheKey } from './offline/pos-catalog-offline'
import { getFromErpCache, setErpCache } from './offline/cache'
import type { PosMenuUpsertApiBody } from './pos-menu-upsert-server'
import { readAutoTranslateEnabled } from './auto-translate'
import {
  attachEvalAnalyticsRedirectFlag,
  parseEvalAnalyticsErrorResponse,
} from './eval-analytics-http-error'
import { jsonAsArray, jsonAsPlainObject, jsonAsStringArray, jsonObjectWithList } from './safe-api-json'
import { isLinkposCardApiEnabled } from './linkpos-card-api-enabled'

export { apiFetch } from './api/fetch'
export { apiFetchWithOffline }
export { loginCheck, changePassword } from './api/auth'
export { getLoginDataWithCache as getLoginData } from './offline/erp-offline'
export { useStoreList } from './use-store-list'
export {
  invalidateBankTransactionsListCache,
  invalidateReceivablePayableListCache,
  invalidatePurchaseOrdersListCache,
  invalidateAdminItemsCache,
} from './offline/erp-offline'
export type { MarketingCampaignPhasePeriod } from './marketing-campaign-periods'

/** 페이지네이션 목록 API 공통 응답 */
export interface PaginatedList<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  truncated?: boolean
}

export interface NoticeAttachment {
  name?: string
  mime?: string
  url?: string
}

export interface NoticeItem {
  id: number
  date: string
  title: string
  content: string
  sender: string
  status: string
  attachments: NoticeAttachment[]
}

export async function getMyNotices(params: {
  store: string
  name: string
  page?: number
  pageSize?: number
  status?: 'all' | 'unread' | 'read'
  dateFrom?: string
  dateTo?: string
  /** ERP 공지 패널: 기간 밖이어도 미확인은 포함 */
  listMode?: 'default' | 'unread_or_in_range'
  rangeStart?: string
  rangeEnd?: string
}): Promise<PaginatedList<NoticeItem>> {
  const q = new URLSearchParams({ store: params.store, name: params.name })
  if (params.page != null) q.set('page', String(params.page))
  if (params.pageSize != null) q.set('pageSize', String(params.pageSize))
  if (params.status && params.status !== 'all') q.set('status', params.status)
  if (params.dateFrom) q.set('dateFrom', params.dateFrom)
  if (params.dateTo) q.set('dateTo', params.dateTo)
  if (params.listMode) q.set('listMode', params.listMode)
  if (params.rangeStart) q.set('rangeStart', params.rangeStart)
  if (params.rangeEnd) q.set('rangeEnd', params.rangeEnd)
  const res = await apiFetchWithOffline(`/api/getMyNotices?${q}`)
  const data = (await res.json()) as unknown
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as PaginatedList<NoticeItem>).items)) {
    const p = data as PaginatedList<NoticeItem>
    return {
      items: p.items,
      total: p.total ?? 0,
      page: p.page ?? 1,
      pageSize: p.pageSize ?? 20,
      truncated: p.truncated,
    }
  }
  const arr = Array.isArray(data) ? data : []
  return { items: arr, total: arr.length, page: 1, pageSize: arr.length || 20 }
}

export async function confirmNoticeRead(params: {
  noticeId: number
  store: string
  name: string
  action: '확인' | '다음에'
}) {
  const res = await apiFetchWithOffline('/api/confirmNoticeRead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      noticeId: params.noticeId,
      store: params.store,
      name: params.name,
      action: params.action,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface MyPayrollData {
  month: string
  store: string
  name: string
  employee_id?: number
  employee_code?: string
  dept: string
  role: string
  companyName?: string
  salary: number
  pos_allow: number
  haz_allow: number
  diligence_allow: number
  birth_bonus: number
  holiday_pay: number
  spl_bonus: number
  ot_amt: number
  late_ded: number
  /** 조퇴 공제 — 관리자 표의 지각 열은 late_ded+early_ded 합계 */
  early_ded: number
  sso: number
  tax: number
  other_ded: number
  net_pay: number
}

export async function getMyPayroll(params: {
  store: string
  name: string
  month: string
  employeeId?: number
}) {
  const q = new URLSearchParams({
    userStore: params.store,
    userName: params.name,
    month: params.month.slice(0, 7),
  })
  if (params.employeeId != null && params.employeeId > 0) {
    q.set('employeeId', String(params.employeeId))
  }
  const res = await apiFetchWithOffline(`/api/getMyPayroll?${q}`)
  const json = await res.json()
  return {
    success: json.success === true,
    data: json.data as MyPayrollData | null,
    msg: json.msg || '',
  }
}

export interface AppItem {
  code: string
  category: string
  name: string
  spec: string
  price: number
  cost: number
  taxType: string
  safeQty: number
  image?: string
  description?: string
  purchaseSource?: 'hq' | 'store'
  orderDisabled?: boolean
  stockBaseUnit?: string
  stockUnitOptions?: { unit: string; factor: number }[]
  /** 표준 단위 목록. (totalQuantity) [unit] = 1 규격 */
  standardUnits?: { unit: string; totalQuantity: number }[]
}

/** 재고/품목 변경 후 캐시 무효화 (processOrder, processUsage, adjustStock 등 호출 후) */
export function invalidateAppDataCache() {
  invalidateAppDataCacheOffline()
}

export async function getAppData(
  storeName: string,
  asOfDateOrOptions?: string | { asOfDate?: string; scope?: 'order' | 'stock' }
) {
  const opts = typeof asOfDateOrOptions === 'string'
    ? { asOfDate: asOfDateOrOptions }
    : (asOfDateOrOptions || {})
  const raw = await getAppDataWithCache(storeName, opts)
  return { items: (raw.items || []) as AppItem[], stock: raw.stock || {} }
}

// ─── 재고 현황 (Stock) ───
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
}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 90000)
  try {
    const res = await apiFetchWithOffline('/api/processOrderReceive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

// ─── 인사 (HR) ───
export interface TodayAttendanceState {
  types: string[]
  canBreakStart: boolean
  canBreakEnd: boolean
  isOnBreak: boolean
}

export async function getTodayAttendanceTypes(params: {
  storeName: string
  name: string
  employeeId?: number
  employeeCode?: string
}) {
  const q = new URLSearchParams({
    storeName: params.storeName,
    name: params.name,
  })
  if (params.employeeId != null && params.employeeId > 0) q.set('employeeId', String(params.employeeId))
  if (params.employeeCode != null && String(params.employeeCode).trim())
    q.set('employeeCode', String(params.employeeCode).trim())
  const res = await apiFetchWithOffline(`/api/getTodayAttendanceTypes?${q}`)
  const raw: unknown = await res.json()
  // 구버전 API: string[] 만 반환 (클라만 먼저 배포된 경우 대비)
  if (Array.isArray(raw)) {
    const types = raw.filter((x): x is string => typeof x === 'string')
    const hasClockIn = types.includes('출근')
    const hasClockOut = types.includes('퇴근')
    const hasBreakStart = types.includes('휴식시작')
    const hasBreakEnd = types.includes('휴식종료')
    const isOnBreak = hasBreakStart && !hasBreakEnd
    return {
      types,
      canBreakStart: hasClockIn && !hasClockOut && !isOnBreak,
      canBreakEnd: hasClockIn && !hasClockOut && isOnBreak,
      isOnBreak,
    }
  }
  const o = raw as Record<string, unknown>
  const types = Array.isArray(o.types) ? o.types.filter((x): x is string => typeof x === 'string') : []
  return {
    types,
    canBreakStart: o.canBreakStart === true,
    canBreakEnd: o.canBreakEnd === true,
    isOnBreak: o.isOnBreak === true,
  }
}

export interface AttendanceLogItem {
  timestamp: string
  type: string
  status: string
  late_min?: number
  ot_min?: number
  approved?: string
}

export async function getAttendanceList(params: {
  startDate: string
  endDate: string
  storeFilter: string
  employeeFilter: string
  employeeId?: number
  /** employees.employee_code — 레거시 로그(employee_id NULL) 병합용 */
  employeeCode?: string
}) {
  const q = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    storeFilter: params.storeFilter,
    employeeFilter: params.employeeFilter,
  })
  if (params.employeeId != null && params.employeeId > 0) q.set('employeeId', String(params.employeeId))
  if (params.employeeCode != null && String(params.employeeCode).trim())
    q.set('employeeCode', String(params.employeeCode).trim())
  const res = await apiFetchWithOffline(`/api/getAttendanceList?${q}`)
  return jsonAsArray<AttendanceLogItem>(await res.json())
}

export async function submitAttendance(params: {
  storeName: string
  name: string
  type: string
  lat: string | number
  lng: string | number
  employeeId?: number
  /** 선택; 서버는 employees에서 코드를 다시 확인해 스냅샷 저장 */
  employeeCode?: string
}) {
  const res = await apiFetchWithOffline('/api/submitAttendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; code?: string }>
}

export async function requestLeave(params: {
  store: string
  name: string
  type: string
  date: string
  reason: string
  employeeId?: number
}) {
  const res = await apiFetchWithOffline('/api/requestLeave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface LeaveHistoryItem {
  id?: number
  date: string
  type: string
  reason: string
  status: string
  certificateUrl?: string
  /** 반려 시 관리자가 입력한 사유 (모바일에서 확인 가능) */
  rejectReason?: string
}

const DEFAULT_MY_LEAVE_INFO_STATS: {
  usedAnn: number
  usedSick: number
  usedUnpaid: number
  usedLakij: number
  remain: number
  remainLakij: number
  remainSick: number
  annualTotal: number
  lakijTotal: number
  sickTotal: number
} = {
  usedAnn: 0,
  usedSick: 0,
  usedUnpaid: 0,
  usedLakij: 0,
  remain: 15,
  remainLakij: 3,
  remainSick: 30,
  annualTotal: 6,
  lakijTotal: 3,
  sickTotal: 30,
}

function normalizeMyLeaveInfoStats(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_MY_LEAVE_INFO_STATS }
  const s = raw as Record<string, unknown>
  return {
    usedAnn: Number(s.usedAnn) || 0,
    usedSick: Number(s.usedSick) || 0,
    usedUnpaid: Number(s.usedUnpaid) || 0,
    usedLakij: Number(s.usedLakij) || 0,
    remain: Number(s.remain) || 0,
    remainLakij: Number(s.remainLakij) || 0,
    remainSick: Number(s.remainSick) || 0,
    annualTotal: Number(s.annualTotal) || 0,
    lakijTotal: Number(s.lakijTotal) || 0,
    sickTotal: Number(s.sickTotal) || 0,
  }
}

export async function getMyLeaveInfo(params: { store: string; name: string; employeeId?: number }): Promise<{
  history: LeaveHistoryItem[]
  stats: typeof DEFAULT_MY_LEAVE_INFO_STATS
}> {
  const q = new URLSearchParams()
  q.set('store', params.store)
  q.set('name', params.name)
  if (params.employeeId != null && params.employeeId > 0) q.set('employeeId', String(params.employeeId))
  const res = await apiFetchWithOffline(`/api/getMyLeaveInfo?${q}`)
  const raw: unknown = await res.json()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { history: [], stats: { ...DEFAULT_MY_LEAVE_INFO_STATS } }
  }
  const o = raw as Record<string, unknown>
  const history = Array.isArray(o.history) ? (o.history as LeaveHistoryItem[]) : []
  return {
    history,
    stats: normalizeMyLeaveInfoStats(o.stats),
  }
}

export async function uploadLeaveCertificate(params: {
  id: number
  store: string
  name: string
  certificateUrl: string
}) {
  const res = await apiFetchWithOffline('/api/uploadLeaveCertificate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 관리 (Admin) ───
export async function getNoticeOptions() {
  const res = await apiFetchWithOffline('/api/getNoticeOptions')
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    stores: jsonAsStringArray(o.stores),
    roles: jsonAsStringArray(o.roles),
    permissionGroups: jsonAsStringArray(o.permissionGroups),
  }
}

export async function sendNotice(params: {
  title: string
  content: string
  targetStore: string
  targetRole: string
  targetPermissionGroup?: string | null
  sender: string
  targetRecipients?: Array<{ store: string; name: string; employeeId?: number }>
  userStore?: string
  userRole?: string
  attachments?: Array<{ name: string; mime: string; url: string }>
}) {
  const res = await apiFetchWithOffline('/api/sendNotice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function presignNoticeAttachment(params: {
  fileName: string
  contentType: string
  fileSize: number
}): Promise<{
  success: boolean
  message?: string
  signedUrl?: string
  publicUrl?: string
  storagePath?: string
}> {
  const res = await apiFetchWithOffline('/api/uploadNoticeAttachment/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
    storagePath?: string
  }>
}

export interface SentNoticeItem {
  id: string
  sender?: string
  title: string
  date: string
  recipients: string[]
  preview: string
  content?: string
  readCount: number
  totalCount: number
}

export async function getNoticeSenders(params?: { startDate?: string; endDate?: string }) {
  const q = new URLSearchParams()
  if (params?.startDate) q.set('startDate', params.startDate)
  if (params?.endDate) q.set('endDate', params.endDate)
  const res = await apiFetchWithOffline(`/api/getNoticeSenders?${q}`)
  const data = (await res.json()) as { senders?: string[] }
  return { senders: data.senders ?? [] }
}

export async function getSentNotices(params: {
  sender: string
  startDate: string
  endDate: string
  userStore?: string
  userRole?: string
  searchType?: 'all' | 'notice' | 'order'
  page?: number
  pageSize?: number
  keyword?: string
}): Promise<PaginatedList<SentNoticeItem>> {
  const q = new URLSearchParams({
    sender: params.sender,
    startDate: params.startDate,
    endDate: params.endDate,
  })
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  if (params.searchType && params.searchType !== 'all') q.set('searchType', params.searchType)
  if (params.page != null) q.set('page', String(params.page))
  if (params.pageSize != null) q.set('pageSize', String(params.pageSize))
  if (params.keyword?.trim()) q.set('keyword', params.keyword.trim())
  const res = await apiFetchWithOffline(`/api/getSentNotices?${q}`)
  const raw = await res.json()
  if (raw && typeof raw === 'object' && Array.isArray((raw as PaginatedList<SentNoticeItem>).items)) {
    const p = raw as PaginatedList<SentNoticeItem>
    return {
      items: p.items,
      total: p.total ?? 0,
      page: p.page ?? 1,
      pageSize: p.pageSize ?? 15,
      truncated: p.truncated,
    }
  }
  const arr = Array.isArray(raw) ? (raw as SentNoticeItem[]) : []
  return { items: arr, total: arr.length, page: 1, pageSize: arr.length || 15 }
}

export interface NoticeReadDetailItem {
  store: string
  name: string
  read_at: string
  status: string
}

export async function getNoticeReadDetail(params: { noticeId: number }) {
  const q = new URLSearchParams({ noticeId: String(params.noticeId) })
  const res = await apiFetchWithOffline(`/api/getNoticeReadDetail?${q}`)
  const data = (await res.json()) as { items?: NoticeReadDetailItem[]; success?: boolean; message?: string }
  if (!res.ok || data.success === false) throw new Error(data.message || 'Failed')
  return { items: data.items ?? [] }
}

export interface NoticeReaderStatsRow {
  store: string
  name: string
  job: string
  targeted: number
  confirmed: number
  missed: number
  missRate: number
}

export async function getNoticeReaderStats(params: {
  startDate: string
  endDate: string
  store?: string
  searchType?: 'all' | 'notice' | 'order'
  minMissed?: number
}): Promise<{
  success: boolean
  message?: string
  items: NoticeReaderStatsRow[]
  truncated: boolean
  noticeInRange: number
}> {
  const q = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
  })
  if (params.store) q.set('store', params.store)
  if (params.searchType && params.searchType !== 'all') q.set('searchType', params.searchType)
  if (params.minMissed != null && params.minMissed > 0) q.set('minMissed', String(params.minMissed))
  const res = await apiFetchWithOffline(`/api/getNoticeReaderStats?${q}`)
  const data = (await res.json()) as {
    success?: boolean
    message?: string
    items?: NoticeReaderStatsRow[]
    truncated?: boolean
    noticeInRange?: number
  }
  if (!res.ok) {
    return {
      success: false,
      message: data?.message,
      items: [],
      truncated: false,
      noticeInRange: 0,
    }
  }
  return {
    success: data.success !== false,
    message: data.message,
    items: Array.isArray(data.items) ? data.items : [],
    truncated: Boolean(data.truncated),
    noticeInRange: data.noticeInRange ?? 0,
  }
}

// --- HR policies (인사 규정) ---

export type HrPolicyRow = {
  id: number
  title?: string
  content?: string
  target_store?: string
  target_role?: string
  target_permission_group?: string | null
  target_recipients?: string | null
  content_version?: number
  created_at?: string
  updated_at?: string
  effective_at?: string | null
  is_active?: boolean
  attachments?: string
  sender?: string
}

export async function getHrPolicies(params?: {
  activeOnly?: boolean
  q?: string
  store?: string
  permissionGroup?: string
  audience?: 'all' | 'office' | 'store' | 'individual'
}): Promise<{
  success: boolean
  items: (HrPolicyRow & { targetSummary?: string })[]
  total?: number
  scoped?: boolean
  message?: string
}> {
  const q = new URLSearchParams()
  if (params?.activeOnly) q.set('activeOnly', '1')
  if (params?.q?.trim()) q.set('q', params.q.trim())
  if (params?.store?.trim()) q.set('store', params.store.trim())
  if (params?.permissionGroup?.trim()) q.set('permissionGroup', params.permissionGroup.trim())
  if (params?.audience && params.audience !== 'all') q.set('audience', params.audience)
  const res = await apiFetchWithOffline(`/api/getHrPolicies?${q}`)
  return (await res.json()) as {
    success: boolean
    items: (HrPolicyRow & { targetSummary?: string })[]
    total?: number
    scoped?: boolean
    message?: string
  }
}

export async function saveHrPolicy(body: {
  id?: number
  title: string
  content: string
  targetStore: string
  targetRole: string
  targetPermissionGroup?: string
  targetRecipients?: Array<{ store: string; name: string }>
  effectiveAt?: string | null
  is_active?: boolean
  attachments?: Array<{ name: string; mime: string; url: string }>
}): Promise<{ success: boolean; message?: string; id?: number; content_version?: number }> {
  const res = await apiFetchWithOffline('/api/saveHrPolicy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: body.id,
      title: body.title,
      content: body.content,
      targetStore: body.targetStore,
      targetRole: body.targetRole,
      targetPermissionGroup: body.targetPermissionGroup,
      targetRecipients: body.targetRecipients,
      effective_at: body.effectiveAt,
      is_active: body.is_active,
      attachments: body.attachments,
    }),
  })
  return (await res.json()) as { success: boolean; message?: string; id?: number; content_version?: number }
}

export type HrPolicyListItem = {
  id: number
  date: string
  title: string
  content: string
  status: string
  needsReconfirm: boolean
  attachments: unknown[]
  contentVersion: number
  effectiveAt: string
}

export async function getMyHrPolicies(params: {
  store: string
  name: string
  page?: number
  pageSize?: number
  status?: 'all' | 'unread' | 'read'
}): Promise<{
  items: HrPolicyListItem[]
  total: number
  page: number
  pageSize: number
  truncated: boolean
}> {
  const q = new URLSearchParams({ store: params.store, name: params.name })
  if (params.page != null) q.set('page', String(params.page))
  if (params.pageSize != null) q.set('pageSize', String(params.pageSize))
  if (params.status && params.status !== 'all') q.set('status', params.status)
  const res = await apiFetchWithOffline(`/api/getMyHrPolicies?${q}`)
  return (await res.json()) as {
    items: HrPolicyListItem[]
    total: number
    page: number
    pageSize: number
    truncated: boolean
  }
}

export async function confirmHrPolicyRead(params: {
  policyId: number
  store: string
  name: string
  action?: string
}): Promise<{ success: boolean; message?: string }> {
  const res = await apiFetchWithOffline('/api/confirmHrPolicyRead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      policyId: params.policyId,
      store: params.store,
      name: params.name,
      action: params.action,
    }),
  })
  return (await res.json()) as { success: boolean; message?: string }
}

export type HrPolicyReadDetailItem = {
  store: string
  name: string
  read_at: string
  status: string
  acknowledged: boolean
}

export async function getHrPolicyReadDetail(params: { policyId: number }): Promise<{
  items: HrPolicyReadDetailItem[]
  contentVersion: number
}> {
  const q = new URLSearchParams({ policyId: String(params.policyId) })
  const res = await apiFetchWithOffline(`/api/getHrPolicyReadDetail?${q}`)
  const data = (await res.json()) as {
    items?: HrPolicyReadDetailItem[]
    success?: boolean
    contentVersion?: number
    message?: string
  }
  if (!res.ok || data.success === false) throw new Error(data.message || 'Failed')
  return { items: data.items ?? [], contentVersion: data.contentVersion ?? 1 }
}

export async function getHrPolicyReaderStats(params: {
  startDate: string
  endDate: string
  store?: string
  minMissed?: number
}): Promise<{
  success: boolean
  message?: string
  items: NoticeReaderStatsRow[]
  truncated: boolean
  policyInRange: number
}> {
  const q = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
  })
  if (params.store) q.set('store', params.store)
  if (params.minMissed != null && params.minMissed > 0) q.set('minMissed', String(params.minMissed))
  const res = await apiFetchWithOffline(`/api/getHrPolicyReaderStats?${q}`)
  const data = (await res.json()) as {
    success?: boolean
    message?: string
    items?: NoticeReaderStatsRow[]
    truncated?: boolean
    policyInRange?: number
  }
  if (!res.ok) {
    return {
      success: false,
      message: data?.message,
      items: [],
      truncated: false,
      policyInRange: 0,
    }
  }
  return {
    success: data.success !== false,
    message: data.message,
    items: Array.isArray(data.items) ? data.items : [],
    truncated: Boolean(data.truncated),
    policyInRange: data.policyInRange ?? 0,
  }
}

export async function deleteNoticeAdmin(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteNoticeAdmin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: params.id }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getLeavePendingList(params: {
  startStr: string
  endStr: string
  store?: string
  status?: string
  typeFilter?: string
  userStore?: string
  userRole?: string
  dateFilterType?: 'request' | 'leave'
}) {
  const clean: Record<string, string> = {}
  if (params.startStr) clean.startStr = params.startStr
  if (params.endStr) clean.endStr = params.endStr
  if (params.store != null && params.store !== '') clean.store = params.store
  if (params.status) clean.status = params.status
  if (params.typeFilter != null && params.typeFilter !== '') clean.typeFilter = params.typeFilter
  if (params.userStore) clean.userStore = params.userStore
  if (params.userRole) clean.userRole = params.userRole
  if (params.dateFilterType) clean.dateFilterType = params.dateFilterType
  const q = new URLSearchParams(clean)
  const res = await apiFetchWithOffline(`/api/getLeavePendingList?${q}`)
  return res.json() as Promise<{
    id: number
    store: string
    name: string
    employeeCode: string
    nick: string
    type: string
    date: string
    requestDate: string
    requestTimeBangkok?: string
    reason: string
    status: string
    certificateUrl: string
  }[]>
}

export async function getLeaveStats(params: {
  startStr?: string
  endStr?: string
  store?: string
  userStore?: string
  userRole?: string
}) {
  const clean: Record<string, string> = {}
  if (params.startStr) clean.startStr = params.startStr
  if (params.endStr) clean.endStr = params.endStr
  if (params.store != null && params.store !== '') clean.store = params.store
  if (params.userStore) clean.userStore = params.userStore
  if (params.userRole) clean.userRole = params.userRole
  const q = new URLSearchParams(clean)
  const res = await apiFetchWithOffline(`/api/getLeaveStats?${q}`)
  return res.json() as Promise<
    {
      store: string
      name: string
      employeeCode: string
      usedPeriodAnnual: number
      usedPeriodSick: number
      usedPeriodUnpaid: number
      usedPeriodLakij: number
      usedTotalAnnual: number
      usedTotalSick: number
      usedTotalUnpaid: number
      usedTotalLakij: number
      remain: number
      remainLakij: number
      remainSick: number
    }[]
  >
}

export async function processLeaveApproval(params: { id: number; decision: string; userStore?: string; userRole?: string; rejectReason?: string }) {
  const res = await apiFetchWithOffline('/api/processLeaveApproval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getAttendancePendingList(params: {
  startStr: string
  endStr: string
  store?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams()
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  if (params.store != null && params.store !== '') q.set('store', params.store)
  if (params.userStore != null && params.userStore !== '') q.set('userStore', params.userStore)
  if (params.userRole != null && params.userRole !== '') q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getAttendancePendingList?${q}`)
  return jsonAsArray<{ id: number; log_at: string; store_name: string; name: string; log_type: string; status?: string; approved?: string }>(await res.json())
}

export async function processAttendanceApproval(params: {
  id: number
  decision: string
  optOtMinutes?: number | null
  optEarlyMinutes?: number | null
  optLateMinutes?: number | null
  optionalInLogId?: number | null
  waiveLate?: boolean
  userStore?: string
  userRole?: string
}) {
  const body: Record<string, unknown> = { id: params.id, decision: params.decision }
  if (params.optOtMinutes != null) body.optOtMinutes = Number(params.optOtMinutes)
  if (params.optEarlyMinutes != null) body.optEarlyMinutes = Number(params.optEarlyMinutes)
  if (params.optLateMinutes != null) body.optLateMinutes = Number(params.optLateMinutes)
  if (params.optionalInLogId != null && params.optionalInLogId > 0) body.optionalInLogId = Number(params.optionalInLogId)
  if (params.waiveLate) body.waiveLate = true
  if (params.userStore) body.userStore = params.userStore
  if (params.userRole) body.userRole = params.userRole
  const res = await apiFetchWithOffline('/api/processAttendanceApproval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface AttendanceNoRecordRow {
  date: string
  store: string
  name: string
  employeeId?: number
  employeeCode?: string
  nick?: string
  inTimeStr: string
  outTimeStr: string
  breakMin: number
  breakOverMin?: number
  planIn: string
  planOut: string
  breakStart: string
  breakEnd: string
  planInPrevDay?: boolean
}

export async function getAttendanceNoRecordList(params: {
  startStr: string
  endStr: string
  store?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams()
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  if (params.store != null && params.store !== '') q.set('store', params.store)
  if (params.userStore != null && params.userStore !== '') q.set('userStore', params.userStore)
  if (params.userRole != null && params.userRole !== '') q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getAttendanceNoRecordList?${q}`)
  return jsonAsArray<AttendanceNoRecordRow>(await res.json())
}

export async function createAttendanceFromSchedule(params: {
  date: string
  store: string
  name: string
  employeeId?: number
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/createAttendanceFromSchedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function approveNoClockOut(params: {
  date: string
  store: string
  name: string
  employeeId?: number
  /** 강제 퇴근 생성 시 조퇴(분). 미입력·0이면 계획 퇴근 시각 기준 */
  optEarlyMinutes?: number
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/approveNoClockOut', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface AttendanceDailyRow {
  date: string
  store: string
  name: string
  employeeId?: number
  employeeCode?: string
  inTimeStr: string
  outTimeStr: string
  breakMin: number
  breakOverMin?: number
  actualWorkHrs: number
  plannedWorkHrs: number
  diffMin: number
  lateMin: number
  lateBeforeMin?: number
  lateAfterMin?: number
  /** DB 저장값(퇴근 로그 early_min). 기존 건 조정 반영 시 사용 */
  earlyMin?: number
  earlyBeforeMin?: number
  earlyAfterMin?: number
  otMin: number
  otBeforeMin?: number
  otAfterMin?: number
  status: string
  approval: string
  pendingId: number | null
  pendingInId?: number | null
  pendingOutId?: number | null
  /** 출근 로그 id (지각 분 조정 시 사용, 승인 여부와 무관) */
  inLogId?: number | null
  /** 퇴근 로그 id (조정 반영 시 사용) */
  outLogId?: number | null
  inStatus?: string
  /** 파트타임/시급이면 계획 0이어도 빨간 행 미적용 */
  isPartTime?: boolean
}

export async function getAttendanceRecordsAdmin(params: {
  startDate: string
  endDate: string
  storeFilter?: string
  employeeFilter?: string
  employeeId?: number
  employeeCode?: string
  statusFilter?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams()
  if (params.startDate) q.set('startDate', params.startDate)
  if (params.endDate) q.set('endDate', params.endDate)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.employeeFilter) q.set('employeeFilter', params.employeeFilter)
  if (params.employeeId != null && params.employeeId > 0) q.set('employeeId', String(params.employeeId))
  if (params.employeeCode != null && String(params.employeeCode).trim())
    q.set('employeeCode', String(params.employeeCode).trim())
  if (params.statusFilter) q.set('statusFilter', params.statusFilter || 'all')
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getAttendanceRecordsAdmin?${q}`)
  const raw: unknown = await res.json()
  if (Array.isArray(raw)) {
    return raw as AttendanceDailyRow[]
  }
  return []
}

// ─── 업무일지 (Work Log) ───
export interface WorkLogItem {
  id: string
  content: string
  progress: number
  status: string
  priority: string
  managerCheck?: string
  managerComment?: string
}

export interface WorkLogData {
  finish: WorkLogItem[]
  continueItems: WorkLogItem[]
  todayItems: WorkLogItem[]
}

export async function getWorkLogStaffList() {
  const res = await apiFetchWithOffline('/api/getWorkLogStaffList')
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    staff: jsonAsArray<{ id: number; name: string; displayName: string }>(o.staff),
  }
}

export async function getWorkLogOfficeOptions() {
  const res = await apiFetchWithOffline('/api/getWorkLogOfficeOptions')
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    staff: jsonAsArray<{ id: number; name: string; displayName: string }>(o.staff),
    depts: jsonAsStringArray(o.depts),
  }
}

export async function getWorkLogData(params: {
  dateStr: string
  name: string
  /** 있으면 이름 매칭보다 우선(employees.id) */
  employeeId?: number
}) {
  const q = new URLSearchParams({
    dateStr: params.dateStr,
    name: params.name,
  })
  if (params.employeeId != null && params.employeeId > 0) {
    q.set('employeeId', String(params.employeeId))
  }
  const res = await apiFetchWithOffline(`/api/getWorkLogData?${q}`)
  const raw: unknown = await res.json()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { finish: [], continueItems: [], todayItems: [] }
  }
  const o = raw as Record<string, unknown>
  return {
    finish: jsonAsArray<WorkLogItem>(o.finish),
    continueItems: jsonAsArray<WorkLogItem>(o.continueItems),
    todayItems: jsonAsArray<WorkLogItem>(o.todayItems),
  }
}

export async function saveWorkLogData(params: {
  date: string
  name: string
  logs: WorkLogItem[]
  employeeId?: number
}) {
  const res = await apiFetchWithOffline('/api/saveWorkLogData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function submitDailyClose(params: {
  date: string
  name: string
  logs: WorkLogItem[]
  employeeId?: number
}) {
  const res = await apiFetchWithOffline('/api/submitDailyClose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateWorkLogManagerCheck(params: {
  id: string
  status: string
  comment?: string
}) {
  const res = await apiFetchWithOffline('/api/updateManagerCheck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateWorkLogPriority(params: { id: string; priority: string }) {
  const res = await apiFetchWithOffline('/api/updateWorkLogPriority', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; messageKey?: string }>
}

export async function deleteWorkLogItem(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteWorkLogItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; messageKey?: string; message?: string }>
}

export interface WorkLogManagerItem {
  id: string
  date: string
  dept: string
  name: string
  content: string
  progress: number
  status: string
  priority: string
  managerCheck: string
  managerComment: string
}

export async function getWorkLogManagerReport(params: {
  startStr: string
  endStr: string
  dept?: string
  employee?: string
  status?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.dept && params.dept !== 'all') q.set('dept', params.dept)
  if (params.employee && params.employee !== 'all') q.set('employee', params.employee)
  if (params.status && params.status !== 'all') q.set('status', params.status)
  const res = await apiFetchWithOffline(`/api/getWorkLogManagerReport?${q}`)
  return jsonAsArray<WorkLogManagerItem>(await res.json())
}

export interface WorkLogWeeklySummary {
  employee: string
  role: string
  totalTasks: number
  completed: number
  carried: number
  inProgress: number
  avgProgress: number
}

export async function getWorkLogWeekly(params: {
  startStr: string
  endStr: string
  dept?: string
  employee?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.dept && params.dept !== 'all') q.set('dept', params.dept)
  if (params.employee && params.employee !== 'all') q.set('employee', params.employee)
  const res = await apiFetchWithOffline(`/api/getWorkLogWeekly?${q}`)
  const raw: unknown = await res.json()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { summaries: [], totalTasks: 0, totalCompleted: 0, totalCarried: 0, overallAvg: 0 }
  }
  const o = raw as Record<string, unknown>
  return {
    summaries: jsonAsArray<WorkLogWeeklySummary>(o.summaries),
    totalTasks: Number(o.totalTasks) || 0,
    totalCompleted: Number(o.totalCompleted) || 0,
    totalCarried: Number(o.totalCarried) || 0,
    overallAvg: Number(o.overallAvg) || 0,
  }
}

// ─── 시간표 (Timesheet) ───
export interface TodayScheduleItem {
  date: string
  store: string
  name: string
  nick: string
  pIn: string
  pOut: string
  pBS: string
  pBE: string
  area: string
  plan_in_prev_day?: boolean
  /** 승인된 휴가일 때 종류 (병가, 휴가, ลากิจ 등) */
  leaveType?: string
  /** 당일 출근 요약과 조인 (직원코드 > id > 이름) */
  joinKey?: string
  employeeCode?: string
  /** schedules.employee_id — joinKey 불일치 시 보조 매칭 */
  employeeId?: number
}

export interface TodayAttendanceItem {
  store: string
  name: string
  /** employees.nick — 실시간 격자에서 표시명(nick)과 출근 요약(풀네임) 조인 보강 */
  nick?: string
  inTimeStr: string
  outTimeStr: string
  lateMin: number
  status: string
  onlyIn: boolean
  joinKey?: string
  employeeCode?: string
  /** attendance_logs.employee_id — joinKey 불일치 시 보조 매칭 */
  employeeId?: number
}

export async function getTodaySchedule(params: { store: string; date: string }) {
  const q = new URLSearchParams(params)
  const res = await apiFetchWithOffline(`/api/getTodaySchedule?${q}`)
  return jsonAsArray<TodayScheduleItem>(await res.json())
}

export async function getTodayAttendanceSummary(params: {
  store: string
  date: string
}) {
  const q = new URLSearchParams(params)
  const res = await apiFetchWithOffline(`/api/getTodayAttendanceSummary?${q}`)
  return jsonAsArray<TodayAttendanceItem>(await res.json())
}

export type WeeklyScheduleItem = TodayScheduleItem

export async function getWeeklySchedule(params: {
  store: string
  monday: string
  area?: string
}) {
  const q = new URLSearchParams({
    store: params.store,
    monday: params.monday,
  })
  if (params.area && params.area !== 'All') q.set('area', params.area)
  const res = await apiFetchWithOffline(`/api/getWeeklySchedule?${q}`)
  return jsonAsArray<WeeklyScheduleItem>(await res.json())
}

export async function saveSchedule(params: {
  store: string
  monday: string
  rows: { date: string; name: string; pIn?: string; pOut?: string; pBS?: string; pBE?: string; remark?: string; plan_in_prev_day?: boolean }[]
}) {
  const res = await apiFetchWithOffline('/api/saveSchedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; duplicateNames?: string }>
}

export interface MyAttendanceSummary {
  normalDays: number
  otHours: number
  otDays: number
  lateMinutes: number
  lateDays: number
}

export async function getMyAttendanceSummary(params: {
  store: string
  name: string
  yearMonth: string
}) {
  const q = new URLSearchParams({
    store: params.store,
    name: params.name,
    yearMonth: params.yearMonth,
  })
  const res = await apiFetchWithOffline(`/api/getMyAttendanceSummary?${q}`)
  return res.json() as Promise<MyAttendanceSummary>
}

// ─── 방문 (Visit) ───
export interface TodayVisitItem {
  time: string
  store: string
  type: string
  duration: number
}

export async function getTodayMyVisits(params: { userName: string }) {
  const q = new URLSearchParams({ userName: params.userName })
  const res = await apiFetchWithOffline(`/api/getTodayMyVisits?${q}`)
  return jsonAsArray<TodayVisitItem>(await res.json())
}

export async function checkUserVisitStatus(params: { userName: string }) {
  const q = new URLSearchParams({ userName: params.userName })
  const res = await apiFetchWithOffline(`/api/checkUserVisitStatus?${q}`)
  return res.json() as Promise<{ active: boolean; storeName?: string; purpose?: string }>
}

export async function submitStoreVisit(params: {
  userName: string
  storeName: string
  type: string
  purpose?: string
  lat?: string | number
  lng?: string | number
  clientTimestamp?: number
}) {
  const res = await apiFetchWithOffline('/api/submitStoreVisit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; msg?: string }>
}

// ─── 패티 캐쉬 ───
export interface PettyCashItem {
  id: number
  store: string
  trans_date: string
  trans_type: string
  amount: number
  balance_after: number | null
  memo: string
  receipt_url?: string
  user_name: string
  account_subject_id?: number | null
  accountSubjectId?: number | null
}

export async function getPettyCashOptions(): Promise<{ stores: string[]; officeDepartments: string[] }> {
  const res = await apiFetchWithOffline('/api/getPettyCashOptions')
  return res.json()
}

export async function getPettyCashList(params: {
  startStr: string
  endStr: string
  scopeFilter?: string
  storeFilter?: string
  departmentFilter?: string
  userStore?: string
  userRole?: string
  page?: number
  pageSize?: number
}): Promise<PaginatedList<PettyCashItem>> {
  const data = (await getPettyCashListWithCache(params)) as
    | PaginatedList<PettyCashItem>
    | PettyCashItem[]
    | unknown
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as PaginatedList<PettyCashItem>).items)) {
    const p = data as PaginatedList<PettyCashItem>
    return {
      items: p.items,
      total: p.total ?? 0,
      page: p.page ?? 1,
      pageSize: p.pageSize ?? 25,
    }
  }
  const arr = Array.isArray(data) ? (data as PettyCashItem[]) : []
  return { items: arr, total: arr.length, page: params.page ?? 1, pageSize: params.pageSize ?? 25 }
}

/** 해당 월 또는 기간 거래 전체 + 실시간 잔액 */
export async function getPettyCashMonthDetail(params: {
  yearMonth: string
  startStr?: string
  endStr?: string
  scopeFilter?: string
  storeFilter?: string
  departmentFilter?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams({ yearMonth: params.yearMonth })
  if (params.startStr && params.endStr) {
    q.set('startStr', params.startStr)
    q.set('endStr', params.endStr)
  }
  if (params.scopeFilter) q.set('scopeFilter', params.scopeFilter)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.departmentFilter) q.set('departmentFilter', params.departmentFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getPettyCashMonthDetail?${q}`)
  return jsonAsArray<PettyCashItem>(await res.json())
}

/** 사용자 입력 내용(memo 등) 번역 - 로그인 언어로 표시 */
export async function translateTexts(texts: string[], targetLang: string): Promise<string[]> {
  const filtered = texts.filter((s) => s && String(s).trim()).map((s) => String(s).trim())
  if (filtered.length === 0) return []
  if (!readAutoTranslateEnabled()) return filtered
  const tl = String(targetLang || 'ko').toLowerCase().slice(0, 2)
  try {
    const res = await apiFetchWithOffline('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: filtered, targetLang: tl }),
    })
    const data = (await res.json()) as { translated?: string[] }
    const translated = Array.isArray(data?.translated) ? data.translated : []
    if (translated.length !== filtered.length) return filtered
    return translated.map((v, i) => {
      const src = filtered[i]
      const out = (v == null ? '' : String(v)).trim()
      return out || src
    })
  } catch {
    return filtered
  }
}

export async function addPettyCashTransaction(params: {
  store: string
  transDate: string
  transType: string
  amount: number
  memo?: string
  receiptUrl?: string
  accountSubjectId?: number | null
  userName?: string
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/addPettyCashTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 시재(카운터 현금) 입출금 목록 - pos_till_transactions */
export interface TillItem {
  id: number
  store: string
  trans_date: string
  trans_type: string
  amount: number
  balance_after: number | null
  memo: string
  user_name: string
  /** 매출액 출금일 때만: 해당 현금 매출의 영업일 */
  sales_date?: string | null
}

export async function getTillList(params: {
  startStr: string
  endStr: string
  storeFilter?: string
  userStore?: string
  userRole?: string
  /** all | till_only(일반 입출금만) | sales_withdrawal_only(매출액 출금만) */
  typeFilter?: 'all' | 'till_only' | 'sales_withdrawal_only'
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  if (params.typeFilter && params.typeFilter !== 'all') q.set('typeFilter', params.typeFilter)
  const res = await apiFetchWithOffline(`/api/getTillList?${q}`)
  return jsonAsArray<TillItem>(await res.json())
}

export async function addTillTransaction(params: {
  storeCode: string
  transDate: string
  transType: 'deposit' | 'withdrawal' | 'sales_withdrawal'
  amount: number
  memo?: string
  userName?: string
  userStore?: string
  userRole?: string
  /** 매출액 출금 시 해당 현금 매출의 영업일 (YYYY-MM-DD) */
  salesDate?: string
}): Promise<{ success: boolean; message?: string; queued?: boolean; transactionId?: number }> {
  const res = await apiFetchWithOffline('/api/addTillTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as {
    success?: boolean
    message?: string
    queued?: boolean
    transactionId?: number
  }
  const queued = res.headers.get('X-Offline-Queued') === '1' || data.queued === true
  const rawTid = data.transactionId
  const transactionId =
    typeof rawTid === 'number' && Number.isFinite(rawTid)
      ? rawTid
      : typeof rawTid === 'string' && /^\d+$/.test(String(rawTid))
        ? Number(rawTid)
        : undefined
  return {
    success: Boolean(data.success),
    message: typeof data.message === 'string' ? data.message : undefined,
    queued,
    ...(transactionId != null ? { transactionId } : {}),
  }
}

/** 시재 매출 출금(sales_withdrawal) 한 건 삭제 */
export async function deleteTillTransaction(params: {
  id: number
}): Promise<{ success: boolean; message?: string; queued?: boolean }> {
  const res = await apiFetchWithOffline('/api/deleteTillTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: params.id }),
  })
  const data = (await res.json()) as { success?: boolean; message?: string; queued?: boolean }
  const queued = res.headers.get('X-Offline-Queued') === '1' || data.queued === true
  return {
    success: Boolean(data.success),
    message: typeof data.message === 'string' ? data.message : undefined,
    queued,
  }
}

/** 패티캐시 거래 수정 - 월별 현황에서 조회 후 수정 */
export async function updatePettyCashTransaction(params: {
  id: number
  transDate: string
  transType: string
  amount: number
  memo?: string
  receiptUrl?: string | null
  accountSubjectId?: number | null
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/updatePettyCashTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: params.id,
      transDate: params.transDate,
      transType: params.transType,
      amount: params.amount,
      memo: params.memo ?? '',
      receiptUrl: params.receiptUrl,
      accountSubjectId: params.accountSubjectId,
      userStore: params.userStore,
      userRole: params.userRole,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 패티캐시 거래 삭제 */
export async function deletePettyCashTransaction(params: {
  id: number
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/deletePettyCashTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: params.id,
      userStore: params.userStore,
      userRole: params.userRole,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 미수금/미지급금 관리 ───
export interface ReceivablePayableItem {
  storeName?: string
  vendorCode?: string
  vendorName?: string
  balance: number
  items: {
    id?: number
    trans_date?: string
    ref_type?: string
    ref_id?: number
    amount?: number
    memo?: string
    invoice_no?: string
    invoice_received?: boolean
    receive_checked?: boolean
    /** 미지급: 입고·발주·지출·통장·패티에서 해석한 귀속 매장 */
    attributed_store?: string
  }[]
}

export interface ReceivablePayableSummaryItem {
  storeName?: string
  vendorCode?: string
  vendorName?: string
  balance: number
  count: number
}

export async function getReceivablePayableSummary(params: {
  type: 'receivable' | 'payable'
  userStore?: string
  userRole?: string
  startStr?: string
  endStr?: string
  storeFilter?: string
  vendorFilter?: string
}) {
  const q = new URLSearchParams({ type: params.type })
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.vendorFilter) q.set('vendorFilter', params.vendorFilter)
  const res = await apiFetchWithOffline(`/api/getReceivablePayableSummary?${q}`)
  const data = await res.json()
  return data as { type: string; list: ReceivablePayableSummaryItem[]; totalAmount?: number }
}

export interface ReceivableOrderItem {
  id?: number
  orderId?: number
  storeName: string
  amount: number
  transDate: string
  orderDate: string
  deliveryDate: string
  total: number
  status: string
  memo: string
}

export async function getReceivableOrders(params: {
  storeFilter?: string
  startStr?: string
  endStr?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams()
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getReceivableOrders?${q}`)
  const data = await res.json()
  return data as {
    type: string
    list: ReceivableOrderItem[]
    storeBalances?: Record<string, number>
  }
}

export async function getReceivablePayableList(params: {
  type: 'receivable' | 'payable'
  storeFilter?: string
  vendorFilter?: string
  startStr: string
  endStr: string
  userStore?: string
  userRole?: string
}) {
  return getReceivablePayableListWithCache(params)
}

/** 수령 완료 주문의 Order 미수금을 현재 cart·직접정산 규칙으로 재계산 (지두방 제외 등) */
export async function syncOrderReceivable(params: { orderId: number; userRole?: string }) {
  const res = await apiFetchWithOffline('/api/syncOrderReceivable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: params.orderId, userRole: params.userRole }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    orderId?: number
    subtotalHQ?: number
    totalHQ?: number
    removed?: boolean
  }>
}

/** 수령 완료 주문 미수금을 출고 관리(통합 출고 이력) 합계·직접정산·VAT 반올림에 맞춤 */
export async function syncOrderReceivableFromOutbound(params: { orderId: number; userRole?: string }) {
  const res = await apiFetchWithOffline('/api/syncOrderReceivableFromOutbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: params.orderId, userRole: params.userRole }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    orderId?: number
    subtotalHQ?: number
    totalHQ?: number
    removed?: boolean
    usedCartFallback?: boolean
  }>
}

/** Order 미수금 일괄 — 출고 로그·출고 관리 합계 기준 (배치 1회) */
export async function syncAllOrderReceivablesFromOutboundBatch(params: {
  lastReceivableId?: number
  batchSize?: number
  storeFilter?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/syncAllOrderReceivablesFromOutbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lastReceivableId: params.lastReceivableId ?? 0,
      batchSize: params.batchSize ?? 120,
      storeFilter: params.storeFilter,
      userRole: params.userRole,
    }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    nextReceivableId?: number
    hasMore?: boolean
    stats?: {
      processed: number
      updated: number
      removed: number
      skipped: number
      errors: number
      cartFallback: number
      forceOutboundProcessed?: number
      forceOutboundErrors?: number
    }
    errorSamples?: { orderId: number; message: string }[]
  }>
}

/** Order 미수금 일괄 재동기화 (배치 1회 — 클라이언트에서 hasMore까지 반복) */
export async function syncAllOrderReceivablesBatch(params: {
  lastReceivableId?: number
  batchSize?: number
  storeFilter?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/syncAllOrderReceivables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lastReceivableId: params.lastReceivableId ?? 0,
      batchSize: params.batchSize ?? 120,
      storeFilter: params.storeFilter,
      userRole: params.userRole,
    }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    nextReceivableId?: number
    hasMore?: boolean
    stats?: {
      processed: number
      updated: number
      removed: number
      skipped: number
      orphanRemoved: number
      errors: number
    }
    errorSamples?: { orderId: number; message: string }[]
  }>
}

export interface PayableTransactionItem {
  code?: string
  name?: string
  spec?: string
  /** 인보이스 품목 하단 비고(무게·kg당가 등) */
  line_remarks?: string
  qty: number
  unitCost?: number
  amount: number
}

/** 주문 장바구니 공급가 합계 → 미수·인보이스와 동일 VAT 규칙 */
export interface OrderInvoiceTotals {
  subtotalRounded: number
  vatRounded: number
  grandTotal: number
}

export type PayableTransactionItemsResponse = {
  items: PayableTransactionItem[]
  orderInvoiceTotals?: OrderInvoiceTotals
  withholdingTaxAmount?: number
  withholdingTaxRate?: number
}

export async function getPayableTransactionItems(params: {
  refType: string
  refId: number
}): Promise<PayableTransactionItemsResponse> {
  return getPayableTransactionItemsWithCache(params)
}

// ─── 손익계산서 (1단계) ───
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export interface IncomeStatementData {
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  timezone?: string
  sales: number
  purchases: number
  beginningInventory?: number
  endingInventory?: number
  cogs?: number
  expenses: number
  expenseBreakdown?: {
    pettyCash: number
    bankWithdraw: number
    deliveryAppFees: number
    cardFees: number
    fixedExpenses: number
    total: number
  }
  diagnostics?: {
    warnings: string[]
    limits: Record<string, { fetched: number; limit: number; total?: number }>
    /** 직접 입고 + 통장 매입지급에 동시에 잡힌 거래처 키(코드) */
    purchaseInboundBankOverlapVendorKeys?: string[]
    purchaseHqOutboundBasis?: {
      outboundTotal: number
      approvedOrdersTotal: number
      diff: number
    }
    purchaseExcludedHqBankPayments?: { key: string; amount: number; label?: string }[]
  }
  expenseByAccountSubject?: {
    accountSubjectId: number | null
    code: string
    name: string
    nameEn: string | null
    nameTh: string | null
    amount: number
  }[]
  purchaseByVendor?: { key: string; amount: number; label?: string }[]
  /** 본사 손익: 출고 발주 store_name(매출처)별 매출 */
  salesByCustomer?: { key: string; amount: number; label?: string }[]
  /** 매장 손익: POS 영업일별 매출 */
  salesByDay?: { key: string; amount: number; label?: string }[]
  grossProfit: number
  netProfit: number
  error?: string
}

/** API 응답이 손익계산서 본문인지 검사 (오류 JSON·빈 객체 방지) */
export function isIncomeStatementData(v: unknown): v is IncomeStatementData {
  if (!v || typeof v !== 'object') return false
  const o = v as IncomeStatementData
  if (typeof o.error === 'string' && o.error.trim()) return false
  return (
    typeof o.yearMonth === 'string' &&
    typeof o.startStr === 'string' &&
    typeof o.endStr === 'string' &&
    typeof o.storeFilter === 'string' &&
    isFiniteNumber(o.sales) &&
    isFiniteNumber(o.purchases) &&
    isFiniteNumber(o.expenses) &&
    isFiniteNumber(o.grossProfit) &&
    isFiniteNumber(o.netProfit)
  )
}

export async function getIncomeStatement(params: {
  yearMonth?: string
  storeFilter?: string
  userStore?: string
  userRole?: string
  includeDebug?: boolean
}) {
  const q = new URLSearchParams()
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  if (params.includeDebug) q.set('includeDebug', '1')
  const res = await apiFetchWithOffline(`/api/getIncomeStatement?${q}`)
  const payload = (await res.json()) as IncomeStatementData & { error?: string }
  if (!res.ok) {
    throw new Error(payload.error || `HTTP ${res.status}`)
  }
  if (!isIncomeStatementData(payload)) {
    const errBody = payload as { error?: string }
    throw new Error(errBody.error || 'Invalid income statement response')
  }
  return payload
}

/** 손익 매입 거래처 행 상세 (직접입고 / 통장 매입지급 / 본사승인 발주) */
export type IncomeStatementPurchaseDrillInboundRow = {
  kind: 'inbound'
  id: number | null
  logDate: string
  location: string
  itemCode: string
  qty: number
  unitCost: number
  lineAmount: number
  vendorTarget: string | null
}

export type IncomeStatementPurchaseDrillBankRow = {
  kind: 'bank'
  id: number
  transDate: string
  amount: number
  vendorCode: string | null
  memo: string | null
  note: string | null
  store: string | null
  refType: string | null
  refId: number | null
}

export type IncomeStatementPurchaseDrillOrderRow = {
  kind: 'hq_order'
  id: number
  orderDate: string
  total: number
  storeName: string | null
  status: string | null
}

export type IncomeStatementPurchaseDrillHqOutboundRow = {
  kind: 'hq_outbound'
  id: number
  logDate: string
  logType: string | null
  itemCode: string
  targetStore: string | null
  qty: number
  unitPrice: number
  lineAmount: number
}

export type IncomeStatementPurchaseDrillDown = {
  vendorKey: string
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  isHqOrders: boolean
  hqOutbounds: IncomeStatementPurchaseDrillHqOutboundRow[]
  hqOrders: IncomeStatementPurchaseDrillOrderRow[]
  inbound: IncomeStatementPurchaseDrillInboundRow[]
  bankPayments: IncomeStatementPurchaseDrillBankRow[]
  truncated: { inbound: boolean; bank: boolean; orders: boolean }
  error?: string
}

export async function getIncomeStatementPurchaseDrillDown(params: {
  yearMonth: string
  storeFilter?: string
  userStore?: string
  userRole?: string
  vendorKey: string
}): Promise<IncomeStatementPurchaseDrillDown> {
  const q = new URLSearchParams()
  q.set('yearMonth', params.yearMonth)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  q.set('vendorKey', params.vendorKey)
  const res = await apiFetchWithOffline(`/api/getIncomeStatementPurchaseDrillDown?${q}`)
  const data = (await res.json()) as IncomeStatementPurchaseDrillDown & { error?: string }
  if (!res.ok) {
    return { ...data, error: data.error || `HTTP ${res.status}` }
  }
  return data
}

export type IncomeStatementExpenseDrillDown = {
  accountSubjectKey: string
  accountSubjectId: number | null
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  petty: {
    kind: 'petty'
    id: number
    transDate: string
    amount: number
    store: string | null
    memo: string | null
    transType: string
  }[]
  bankWithdrawals: {
    kind: 'bank'
    id: number
    transDate: string
    expenseDate: string | null
    amount: number
    category: string | null
    memo: string | null
    store: string | null
  }[]
  fixedExpenses: {
    kind: 'fixed'
    id: number
    name: string
    store: string
    monthlyAmount: number
    startYearMonth: string | null
    endYearMonth: string | null
    memo: string | null
  }[]
  truncated: { petty: boolean; bank: boolean; fixed: boolean }
  error?: string
}

export async function getIncomeStatementExpenseDrillDown(params: {
  yearMonth: string
  storeFilter?: string
  userStore?: string
  userRole?: string
  accountSubjectId: number | null
}): Promise<IncomeStatementExpenseDrillDown> {
  const q = new URLSearchParams()
  q.set('yearMonth', params.yearMonth)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  if (params.accountSubjectId == null) {
    q.set('unclassified', '1')
  } else {
    q.set('accountSubjectKey', String(params.accountSubjectId))
  }
  const res = await apiFetchWithOffline(`/api/getIncomeStatementExpenseDrillDown?${q}`)
  const data = (await res.json()) as IncomeStatementExpenseDrillDown & { error?: string }
  if (!res.ok) {
    return {
      accountSubjectKey: params.accountSubjectId == null ? '__unclassified__' : String(params.accountSubjectId),
      accountSubjectId: params.accountSubjectId,
      yearMonth: params.yearMonth,
      startStr: '',
      endStr: '',
      storeFilter: params.storeFilter || 'All',
      petty: [],
      bankWithdrawals: [],
      fixedExpenses: [],
      truncated: { petty: false, bank: false, fixed: false },
      error: data.error || `HTTP ${res.status}`,
    }
  }
  return data
}

export type IncomeStatementOverrideRow = {
  year_month: string
  store_key: string
  sales_override_enabled: boolean
  sales_override_amount: number
  beginning_inv_override_enabled: boolean
  beginning_inv_override_amount: number
  updated_at?: string | null
  updated_by?: string | null
}

export async function fetchIncomeStatementOverrides(params: {
  yearMonth: string
  storeFilter: string
  userStore?: string
  userRole?: string
}): Promise<{ success: boolean; row?: IncomeStatementOverrideRow; error?: string }> {
  const q = new URLSearchParams()
  q.set("yearMonth", params.yearMonth)
  q.set("storeFilter", params.storeFilter)
  if (params.userStore) q.set("userStore", params.userStore)
  if (params.userRole) q.set("userRole", params.userRole)
  const res = await apiFetchWithOffline(`/api/incomeStatementOverrides?${q}`)
  const j = (await res.json()) as {
    success?: boolean
    row?: IncomeStatementOverrideRow
    error?: string
  }
  if (!res.ok) {
    return { success: false, error: j.error || `HTTP_${res.status}` }
  }
  return { success: Boolean(j.success), row: j.row, error: j.error }
}

export async function saveIncomeStatementOverrides(params: {
  yearMonth: string
  storeFilter: string
  userStore?: string
  userRole?: string
  updatedBy?: string
  salesOverrideEnabled: boolean
  salesOverrideAmount: number
  beginningInvOverrideEnabled: boolean
  beginningInvOverrideAmount: number
}): Promise<{ success: boolean; error?: string }> {
  const res = await apiFetchWithOffline("/api/incomeStatementOverrides", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      yearMonth: params.yearMonth,
      storeFilter: params.storeFilter,
      userStore: params.userStore,
      userRole: params.userRole,
      updatedBy: params.updatedBy,
      salesOverrideEnabled: params.salesOverrideEnabled,
      salesOverrideAmount: params.salesOverrideAmount,
      beginningInvOverrideEnabled: params.beginningInvOverrideEnabled,
      beginningInvOverrideAmount: params.beginningInvOverrideAmount,
    }),
  })
  const j = (await res.json()) as { success?: boolean; error?: string }
  if (!res.ok) {
    return { success: false, error: j.error || `HTTP_${res.status}` }
  }
  return { success: Boolean(j.success), error: j.error }
}

export interface UnpostedBankTransaction {
  id: number
  transDate: string
  amount: number
  category: string
  memo: string | null
  store: string | null
}

export interface BalanceSheetLedgerBreakdown {
  glAccount1130: number
  subledgerReceivables: number
  glAccount2110: number
  subledgerPayables: number
  glAccount1010: number
  glSource: 'rpc' | 'select'
}

export interface BalanceSheetData {
  yearMonth: string
  startStr?: string
  endStr: string
  storeFilter: string
  timezone: string
  assets: { cashAndBanks: number; inventory: number; receivables: number; total: number }
  liabilities: { payables: number; total: number }
  equity: { openingCapital: number; retainedEarningsYtd: number; currentPeriodProfit: number; total: number }
  balanceCheckDiff: number
  unpostedBankWithdrawals?: UnpostedBankTransaction[]
  ledgerBreakdown?: BalanceSheetLedgerBreakdown
}

export interface SubledgerGlReconciliationData {
  yearMonth: string
  endStr: string
  storeFilter: string
  timezone: string
  receivables: {
    glAccount1130: number
    subledgerTotal: number
    difference: number
    glSource: 'rpc' | 'select'
    subledgerSource: 'rpc' | 'select'
  }
  payables: {
    glAccount2110: number
    subledgerTotal: number
    difference: number
    glSource: 'rpc' | 'select'
    subledgerSource: 'rpc' | 'select'
  }
  cashGl1010: number
  riskyRevenueDeposits: {
    id: number
    transDate: string
    amount: number
    category: string
    store: string | null
    memo: string | null
  }[]
  pendingChannelSettlements: {
    id: number
    storeCode: string
    settleDate: string
    channel: string
    gross: number
    net: number
    fee: number
    bankTransactionId: number | null
    journalEntryId: number | null
  }[]
  receivableReceiveWithSettlementLink: {
    bankId: number
    transDate: string
    amount: number
    storeName: string | null
    settlementIds: number[]
  }[]
}

/** API 응답이 재무상태표 본문인지 검사 (오류 JSON·빈 객체 방지) */
export function isBalanceSheetData(v: unknown): v is BalanceSheetData {
  if (!v || typeof v !== 'object') return false
  const o = v as BalanceSheetData
  const a = o.assets
  const l = o.liabilities
  const e = o.equity
  return (
    typeof o.yearMonth === 'string' &&
    typeof o.endStr === 'string' &&
    !!a &&
    !!l &&
    !!e &&
    isFiniteNumber(a.cashAndBanks) &&
    isFiniteNumber(a.inventory) &&
    isFiniteNumber(a.receivables) &&
    isFiniteNumber(a.total) &&
    isFiniteNumber(l.payables) &&
    isFiniteNumber(l.total) &&
    isFiniteNumber(e.openingCapital) &&
    isFiniteNumber(e.retainedEarningsYtd) &&
    isFiniteNumber(e.currentPeriodProfit) &&
    isFiniteNumber(e.total) &&
    isFiniteNumber(o.balanceCheckDiff)
  )
}

export async function getBalanceSheet(params: {
  yearMonth?: string
  storeFilter?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams()
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getBalanceSheet?${q}`)
  const payload = (await res.json()) as BalanceSheetData & { error?: string }
  if (!res.ok) {
    throw new Error(payload.error || `HTTP ${res.status}`)
  }
  if (!isBalanceSheetData(payload)) {
    const errBody = payload as { error?: string }
    throw new Error(errBody.error || 'Invalid balance sheet response')
  }
  return payload
}

export async function getSubledgerGlReconciliation(params: {
  yearMonth: string
  storeFilter?: string
}) {
  const q = new URLSearchParams()
  q.set('yearMonth', params.yearMonth)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getSubledgerGlReconciliation?${q}`)
  const payload = (await res.json()) as SubledgerGlReconciliationData & { error?: string }
  if (!res.ok) {
    throw new Error(payload.error || `HTTP ${res.status}`)
  }
  return payload
}

export type ThaiFilingResponsibility = 'in_house' | 'tax_agent' | 'tbd'

export async function getAccountingFilingPreferences(params: { userRole: string }) {
  const q = new URLSearchParams({ userRole: params.userRole })
  const res = await apiFetchWithOffline(`/api/getAccountingFilingPreferences?${q}`)
  return res.json() as Promise<{
    definitions: unknown[]
    responsibilities: Record<string, ThaiFilingResponsibility>
    notes: string | null
    updatedAt: string | null
  }>
}

export async function saveAccountingFilingPreferences(params: {
  userRole: string
  responsibilities: Record<string, ThaiFilingResponsibility>
  notes?: string | null
}) {
  const res = await apiFetchWithOffline('/api/saveAccountingFilingPreferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; responsibilities?: Record<string, ThaiFilingResponsibility>; error?: string }>
}

export async function getAccountingPeriods(params: { userRole: string; storeFilter?: string }) {
  const q = new URLSearchParams({ userRole: params.userRole })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getAccountingPeriods?${q}`)
  return res.json() as Promise<{
    storeScope?: string
    periods: {
      yearMonth: string
      storeScope?: string
      isClosed: boolean
      closedViaAll?: boolean
      closedAt: string | null
      closedBy: string | null
      unlockedAt?: string | null
      unlockedBy?: string | null
      unlockReason?: string | null
      unlockApprovedBy?: string | null
    }[]
  }>
}

export async function getAccountingPeriodCloseStatus(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, yearMonth: params.yearMonth })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getAccountingPeriodCloseStatus?${q}`)
  return res.json() as Promise<{
    snapshot?: {
      yearMonth: string
      storeScope: string
      isClosed: boolean
      closedViaAll: boolean
    }
    error?: string
  }>
}

export async function setAccountingPeriodClosed(params: {
  userRole: string
  yearMonth: string
  closed: boolean
  storeScope?: string
  storeFilter?: string
  closedBy?: string | null
  unlockReason?: string | null
  unlockApprovedBy?: string | null
}) {
  const res = await apiFetchWithOffline('/api/setAccountingPeriodClosed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export type TrialBalanceRow = {
  accountCode: string
  accountName: string | null
  debit: number
  credit: number
  netDebit: number
}

export async function getTrialBalance(params: {
  userRole: string
  yearMonth?: string
  storeFilter?: string
  userStore?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  const res = await apiFetchWithOffline(`/api/getTrialBalance?${q}`)
  return res.json() as Promise<{
    yearMonth: string
    rows: TrialBalanceRow[]
    totalDebit: number
    totalCredit: number
    diff: number
  }>
}

export async function getAccountingReconciliation(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
  userStore?: string
  profitLossAccountCode?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    storeFilter: params.storeFilter || 'All',
    profitLossAccountCode: params.profitLossAccountCode || '3120',
  })
  if (params.userStore) q.set('userStore', params.userStore)
  const res = await apiFetchWithOffline(`/api/getAccountingReconciliation?${q}`)
  return res.json() as Promise<{
    yearMonth: string
    storeFilter: string
    profitLossAccountCode: string
    summary: {
      tbRevenue: number
      tbExpense: number
      tbNetIncome: number
      tbDiff: number
      incomeNetProfit: number
      bsCurrentPeriodProfit: number
      closingPreviewNetIncome: number
      netDiff: number
      bsDiff: number
      closingDiff: number
    }
    mismatch: {
      trialUnbalanced: boolean
      tbVsIncome: boolean
      tbVsBalanceSheet: boolean
      tbVsClosingPreview: boolean
    }
  }>
}

export async function getVatLedger(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  q.set('storeFilter', params.storeFilter || 'All')
  const res = await apiFetchWithOffline(`/api/vatLedger?${q}`)
  const data = (await res.json()) as { entries?: Record<string, unknown>[]; error?: string }
  if (!res.ok) {
    return { entries: [], error: data?.error || `HTTP_${res.status}` }
  }
  return { entries: data.entries || [], error: data.error }
}

export type StoreTaxFilingProfileDto = {
  storeCode: string
  vendorCode?: string
  taxpayerName: string
  taxId: string
  branchNo: string
  placeOfBusiness: string
  ssoAccountNo?: string
  ssoBranchCode?: string
  ssoOfficeAddress?: string
  ssoPostcode?: string
  ssoPhone?: string
  ssoFax?: string
  ssoEmail?: string
  updatedAt?: string | null
  updatedBy?: string | null
}

export async function getStoreTaxFilingProfile(storeCode: string) {
  const q = new URLSearchParams({ storeCode })
  const res = await apiFetchWithOffline(`/api/storeTaxFilingProfiles?${q}`)
  const data = (await res.json()) as { profile?: StoreTaxFilingProfileDto; error?: string }
  if (!res.ok) {
    return { profile: null, error: data?.error || `HTTP_${res.status}` }
  }
  return { profile: data.profile || null }
}

export async function getStoreTaxFilingProfiles() {
  const res = await apiFetchWithOffline('/api/storeTaxFilingProfiles')
  const data = (await res.json()) as {
    profiles?: StoreTaxFilingProfileDto[]
    tableMissing?: boolean
    error?: string
  }
  if (!res.ok) {
    return { profiles: [] as StoreTaxFilingProfileDto[], error: data?.error || `HTTP_${res.status}` }
  }
  return { profiles: data.profiles || [], tableMissing: !!data.tableMissing }
}

export async function saveStoreTaxFilingProfile(params: {
  storeCode: string
  vendorCode?: string
  taxpayerName: string
  taxId: string
  branchNo: string
  placeOfBusiness?: string
  ssoAccountNo?: string
  ssoBranchCode?: string
  ssoOfficeAddress?: string
  ssoPostcode?: string
  ssoPhone?: string
  ssoFax?: string
  ssoEmail?: string
}) {
  const res = await apiFetchWithOffline('/api/storeTaxFilingProfiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success?: boolean
    profile?: StoreTaxFilingProfileDto
    error?: string
    hint?: string
  }>
}

export type VatLedgerStoreNameGapsReportDto = {
  taxMonths: string[]
  storeFilter: string
  inScopeRowCount: number
  emptyStoreNameRowCount: number
  emptyStoreNameOutputNet: number
  emptyStoreNameOutputVat: number
  emptyStoreNameInputNet: number
  emptyStoreNameInputVat: number
  otherStoreRowCount: number
  otherStoreOutputVat: number
  otherStoreInputVat: number
  samples: {
    id?: number
    doc_date: string
    direction: string
    net_amount: number
    vat_amount: number
    counterparty_name: string
    invoice_number: string
    memo: string
  }[]
}

export type IntercompanyVatReconcileReportDto = {
  months: string[]
  storeFilter: string
  issuedCount: number
  matchedCount: number
  missingInStoreCount: number
  extraInStoreCount: number
  diffCount: number
  hqIssuedNetTotal: number
  storeInputNetTotal: number
  storeInputVatTotal: number
  diffNetTotal: number
  rows: {
    storeName: string
    referenceNo: string
    hqIssuedNet: number
    storeInputNet: number
    storeInputVat: number
    diffNet: number
    status: 'missing_in_store_input' | 'extra_in_store_input' | 'net_diff'
  }[]
}

export async function getVatLedgerStoreNameGaps(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getVatLedgerStoreNameGaps?${q}`)
  const data = (await res.json()) as { report?: VatLedgerStoreNameGapsReportDto; error?: string }
  if (!res.ok) {
    return { report: null, error: data?.error || `HTTP_${res.status}` }
  }
  return { report: data.report || null }
}

export async function getIntercompanyVatReconcile(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/ops/intercompany-vat-reconcile?${q}`)
  const data = (await res.json()) as { report?: IntercompanyVatReconcileReportDto; error?: string }
  if (!res.ok) {
    return { report: null, error: data?.error || `HTTP_${res.status}` }
  }
  return { report: data.report || null }
}

/** 본사 출고(세금계산서) 이력이 있을 때만 매장↔본사 VAT 대사 UI를 노출 */
export async function probeIntercompanyVatReconcileApplicable(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    taxMonth: params.taxMonth,
    storeFilter: params.storeFilter,
    probeOnly: '1',
  })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  const res = await apiFetchWithOffline(`/api/ops/intercompany-vat-reconcile?${q}`)
  const data = (await res.json()) as { applicable?: boolean; error?: string }
  if (!res.ok) {
    return { applicable: false, error: data?.error || `HTTP_${res.status}` }
  }
  return { applicable: Boolean(data.applicable) }
}

export async function saveVatLedgerEntry(params: Record<string, unknown> & { userRole: string }) {
  const res = await apiFetchWithOffline('/api/vatLedger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    id?: number
    error?: string
    pendingEvidenceCount?: number
    pendingEvidenceRows?: {
      id: number
      docDate: string
      counterpartyName: string
      invoiceNumber: string
      storeName: string
      memo: string
    }[]
  }>
}

export async function deleteVatLedgerEntry(params: { userRole: string; id: number }) {
  const res = await apiFetchWithOffline('/api/vatLedger', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export async function getPp36Ledger(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/pp36Ledger?${q}`)
  const data = (await res.json()) as { entries?: Record<string, unknown>[]; error?: string }
  if (!res.ok) {
    return { entries: [], error: data?.error || `HTTP_${res.status}` }
  }
  return { entries: data.entries || [], error: data.error }
}

export async function savePp36LedgerEntry(params: Record<string, unknown> & { userRole: string }) {
  const res = await apiFetchWithOffline('/api/pp36Ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; error?: string }>
}

export async function deletePp36LedgerEntry(params: { userRole: string; id: number }) {
  const res = await apiFetchWithOffline('/api/pp36Ledger', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export async function getWithholdingTaxLedger(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/withholdingTaxLedger?${q}`)
  return res.json() as Promise<{ entries: Record<string, unknown>[] }>
}

export async function saveWithholdingTaxLedgerEntry(params: Record<string, unknown> & { userRole: string }) {
  const res = await apiFetchWithOffline('/api/withholdingTaxLedger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; error?: string }>
}

export async function deleteWithholdingTaxLedgerEntry(params: { userRole: string; id: number }) {
  const res = await apiFetchWithOffline('/api/withholdingTaxLedger', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export async function getPnd54Ledger(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/pnd54Ledger?${q}`)
  const data = (await res.json()) as { entries?: Record<string, unknown>[]; error?: string }
  if (!res.ok) {
    return { entries: [], error: data?.error || `HTTP_${res.status}` }
  }
  return { entries: data.entries || [], error: data.error }
}

export async function savePnd54LedgerEntry(params: Record<string, unknown> & { userRole: string }) {
  const res = await apiFetchWithOffline('/api/pnd54Ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; error?: string }>
}

export async function deletePnd54LedgerEntry(params: { userRole: string; id: number }) {
  const res = await apiFetchWithOffline('/api/pnd54Ledger', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export function getExportVatLedgerCsvUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  excludePosAuto?: boolean
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.excludePosAuto) q.set('excludePosAuto', '1')
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportVatLedgerCsv?${q}`
  }
  return `/api/exportVatLedgerCsv?${q}`
}

export function getExportWithholdingTaxLedgerCsvUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  format?: 'raw' | 'submission'
  formHint?: 'PND3' | 'PND53' | 'ALL'
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.format) q.set('format', params.format)
  if (params.formHint) q.set('formHint', params.formHint)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportWithholdingTaxLedgerCsv?${q}`
  }
  return `/api/exportWithholdingTaxLedgerCsv?${q}`
}

export function getExportPp36LedgerCsvUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportPp36LedgerCsv?${q}`
  }
  return `/api/exportPp36LedgerCsv?${q}`
}

export function getExportPnd54LedgerCsvUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportPnd54LedgerCsv?${q}`
  }
  return `/api/exportPnd54LedgerCsv?${q}`
}

export function getExportPnd1RdPrepTxtUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  filingForm?: 'pnd1' | 'pnd1a' | 'all'
  payerTaxId?: string
  payerBranchNo?: string
  payerName?: string
  includeHeader?: boolean
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.filingForm) q.set('filingForm', params.filingForm)
  if (params.payerTaxId) q.set('payerTaxId', params.payerTaxId)
  if (params.payerBranchNo) q.set('payerBranchNo', params.payerBranchNo)
  if (params.payerName) q.set('payerName', params.payerName)
  if (params.includeHeader) q.set('includeHeader', '1')
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportPnd1RdPrepTxt?${q}`
  }
  return `/api/exportPnd1RdPrepTxt?${q}`
}

export type ValidatePnd1RdPrepResult = {
  period: {
    periodType: 'monthly' | 'half_year' | 'annual'
    periodKey: string
    startMonth: string
    endMonth: string
    months: string[]
  }
  filingForm: 'pnd1' | 'pnd1a' | 'all'
  totalRows: number
  validRows: number
  warningCounts: {
    missingPayeeName: number
    missingPayeeTaxId: number
    invalidPayeeTaxIdLength: number
    missingPaymentDate: number
    invalidPaymentDate: number
    missingIncomeType: number
    nonPositiveWithheldAmount: number
  }
  sampleWarnings: string[]
  issues: {
    lineNo: number
    rowId: number | null
    code:
      | 'missing_payee_name'
      | 'missing_payee_tax_id'
      | 'invalid_payee_tax_id_length'
      | 'missing_payment_date'
      | 'invalid_payment_date'
      | 'missing_income_type'
      | 'non_positive_withheld_amount'
    message: string
    payeeName: string
    certificateNo: string
  }[]
}

export type ValidatePnd3Pnd53Result = {
  period: {
    periodType: 'monthly' | 'half_year' | 'annual'
    periodKey: string
    startMonth: string
    endMonth: string
    months: string[]
  }
  filingForm: 'PND3' | 'PND53' | 'ALL'
  totalRows: number
  validRows: number
  warningCounts: {
    missingPayeeName: number
    missingPayeeTaxId: number
    missingIncomeType: number
    missingCertificateNo: number
    invalidWhtRate: number
    nonPositiveWithheldAmount: number
  }
  sampleWarnings: string[]
  issues: {
    lineNo: number
    rowId: number | null
    code:
      | 'missing_payee_name'
      | 'missing_payee_tax_id'
      | 'missing_income_type'
      | 'missing_certificate_no'
      | 'invalid_wht_rate'
      | 'non_positive_wht_amount'
    message: string
    payeeName: string
    certificateNo: string
  }[]
}

export type PayrollWhtTinGapResult = {
  period: {
    periodType: 'monthly' | 'half_year' | 'annual'
    periodKey: string
    startMonth: string
    endMonth: string
    months: string[]
  }
  storeFilter: string
  payrollRowCount: number
  gapRowCount: number
  uniqueEmployeeCount: number
  gaps: {
    id: number | null
    paymentDate: string
    taxMonth: string
    payeeName: string
    storeName: string
    whtAmount: number
    certificateNo: string
    formHint: string
    memo: string
  }[]
}

export async function validatePnd1RdPrep(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  filingForm?: 'pnd1' | 'pnd1a' | 'all'
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.filingForm) q.set('filingForm', params.filingForm)
  const res = await apiFetchWithOffline(`/api/validatePnd1RdPrep?${q}`)
  return res.json() as Promise<ValidatePnd1RdPrepResult>
}

export async function validatePnd3Pnd53(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  formHint?: 'PND3' | 'PND53' | 'ALL'
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.formHint) q.set('formHint', params.formHint)
  const res = await apiFetchWithOffline(`/api/validatePnd3Pnd53?${q}`)
  return res.json() as Promise<ValidatePnd3Pnd53Result>
}

export async function getPayrollWhtTinGaps(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getPayrollWhtTinGaps?${q}`)
  return res.json() as Promise<PayrollWhtTinGapResult>
}

export type Kt20kSettings = {
  companyTaxId: string
  companyName: string
  ssoOfficeProvince: string
  ssoOfficePhone: string
  businessCode5: string
  fundRatePercent: string
  updatedBy?: string
  updatedAt?: string
}

export async function getKt20kSettings(params: { userRole: string; year: number }) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    year: String(params.year),
  })
  const res = await apiFetchWithOffline(`/api/getKt20kSettings?${q}`)
  return res.json() as Promise<{ success: boolean; year: number; settings: Kt20kSettings }>
}

export async function saveKt20kSettings(params: {
  userRole: string
  year: number
  companyTaxId: string
  companyName: string
  ssoOfficeProvince: string
  ssoOfficePhone: string
  businessCode5: string
  fundRatePercent: string
  updatedBy?: string
}) {
  const res = await apiFetch('/api/saveKt20kSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export function getExportKt20kCsvUrl(params: { userRole: string; year: number; storeFilter?: string }) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    year: String(params.year),
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (typeof window !== 'undefined') return `${window.location.origin}/api/exportKt20kCsv?${q}`
  return `/api/exportKt20kCsv?${q}`
}

export type Pnd91EmployeeAnnual = {
  employeeKey: string
  employeeId: number | null
  name: string
  store: string
  taxId: string | null
  monthCount: number
  annualGross: number
  annualWhtPayroll: number
  annualWhtLedger: number
  annualSso: number
  annualNetPay: number
  whtLedgerMismatch: boolean
}

export type Pnd91AnnualSummaryResult = {
  success: boolean
  year: number
  storeFilter: string
  filingDueDate: string
  employees: Pnd91EmployeeAnnual[]
  totals: {
    employeeCount: number
    annualGross: number
    annualWhtPayroll: number
    annualWhtLedger: number
    annualSso: number
    annualNetPay: number
    whtMismatchCount: number
  }
  warnings: string[]
  error?: string
}

export async function getPnd91AnnualSummary(params: {
  year: number
  storeFilter?: string
}): Promise<Pnd91AnnualSummaryResult> {
  const q = new URLSearchParams({ year: String(params.year) })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getPnd91AnnualSummary?${q}`)
  return res.json() as Promise<Pnd91AnnualSummaryResult>
}

export function getExportPnd91AnnualCsvUrl(params: {
  year: number
  storeFilter?: string
  checklistJson?: string
}) {
  const q = new URLSearchParams({ year: String(params.year) })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.checklistJson) q.set('checklistJson', params.checklistJson)
  if (typeof window !== 'undefined') return `${window.location.origin}/api/exportPnd91AnnualCsv?${q}`
  return `/api/exportPnd91AnnualCsv?${q}`
}

export type ThaiTaxFilingSummary = {
  period: {
    periodType: 'monthly' | 'half_year' | 'annual'
    periodKey: string
    startMonth: string
    endMonth: string
    months: string[]
  }
  vat: {
    outputNet: number
    outputVat: number
    inputNet: number
    inputVat: number
    payableVat: number
    missingTaxIdCount: number
    missingInvoiceCount: number
    rowCount: number
  }
  wht: {
    totalGross: number
    totalWithheld: number
    missingTaxIdCount: number
    missingCertificateCount: number
    rowCount: number
    byForm: Record<string, { gross: number; withheld: number; rows: number }>
  }
}

export type TaxReadinessChecklist = {
  period: {
    yearMonth: string
    startDate: string
    endDate: string
    storeFilter: string
  }
  limits: {
    sourceLimit: number
    hit: {
      bank: boolean
      petty: boolean
      card: boolean
      purchase: boolean
      sales: boolean
      journal: boolean
    }
  }
  domains: {
    bank: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
    }
    pettyCash: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
    }
    cardExpense: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
    }
    purchase: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
    }
    sales: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
      monthMismatchCount: number
      sampleMonthMismatchSourceIds: number[]
    }
  }
  score: {
    criticalIssues: number
    warningIssues: number
  }
  recommendations: string[]
}

export async function getThaiTaxFilingSummary(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    periodType: params.periodType || 'monthly',
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getThaiTaxFilingSummary?${q}`)
  return res.json() as Promise<ThaiTaxFilingSummary>
}

export async function getTaxReadinessChecklist(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getTaxReadinessChecklist?${q}`)
  return res.json() as Promise<TaxReadinessChecklist>
}

export type CorporateTaxComputationData = {
  periodType: 'monthly' | 'half_year' | 'annual'
  filingForm: 'pnd50' | 'pnd51'
  periodKey: string
  months: string[]
  storeFilter: string
  accountingProfit: number
  taxAddBack: number
  taxDeduction: number
  taxableIncome: number
  projectedAnnualTaxableIncome: number
  taxRate: number
  estimatedTax: number
  filingTaxDue: number
  pdfMeta: {
    formCode: 'P.N.D.50' | 'P.N.D.51'
    periodLabel: string
    periodStartMonth: string
    periodEndMonth: string
    generatedAtBangkok: string
    storeScopeLabel: string
  }
  validation: {
    isValid: boolean
    errors: string[]
    warnings: string[]
  }
  adjustments: { type: 'add_back' | 'deduction'; itemName: string; amount: number; memo: string | null }[]
}

export async function getCorporateTaxComputation(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
  userStore?: string
  taxRate?: number
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    periodType: params.periodType || 'monthly',
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.taxRate != null && !isNaN(Number(params.taxRate))) q.set('taxRate', String(params.taxRate))
  const res = await apiFetchWithOffline(`/api/getCorporateTaxComputation?${q}`)
  return res.json() as Promise<CorporateTaxComputationData>
}

export function getExportCorporateTaxPackageCsvUrl(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
  userStore?: string
  taxRate?: number
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    periodType: params.periodType || 'monthly',
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.taxRate != null && !isNaN(Number(params.taxRate))) q.set('taxRate', String(params.taxRate))
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportCorporateTaxPackageCsv?${q}`
  }
  return `/api/exportCorporateTaxPackageCsv?${q}`
}

export async function saveCorporateTaxAdjustments(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  adjustments: {
    adjustmentType: 'add_back' | 'deduction'
    itemCode?: string | null
    itemName: string
    amount: number
    memo?: string | null
  }[]
}) {
  const res = await apiFetchWithOffline('/api/saveCorporateTaxAdjustments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    periodKey?: string
    savedCount?: number
    rows?: Record<string, unknown>[]
    error?: string
  }>
}

export type AccountingWorkflowStatusRow = {
  id?: number
  year_month: string
  period_type?: 'monthly' | 'half_year' | 'annual'
  period_key?: string
  filing_type: string
  status: 'todo' | 'in_progress' | 'review' | 'done'
  note?: string | null
  owner?: string | null
  updated_by?: string | null
  updated_at?: string | null
  store_scope?: string | null
}

export type IncomeExpenseClosingPreview = {
  yearMonth: string
  storeFilter: string
  profitLossAccountCode: string
  profitLossAccountName: string
  revenueTotal: number
  expenseTotal: number
  netIncome: number
  lineCount: number
  lines: {
    accountCode: string
    accountName: string | null
    side: 'debit' | 'credit'
    amount: number
  }[]
}

export type IncomeExpenseClosingHistoryItem = {
  id?: number
  store_scope?: string | null
  status?: string | null
  created_at?: string | null
  created_by?: string | null
  memo?: string | null
  journal_entry_id?: number | null
  revenue_total?: number | null
  expense_total?: number | null
  net_income?: number | null
  line_count?: number | null
  payload?: unknown
}

export type AccountingComplianceAuditLog = {
  id?: number
  action_type?: string | null
  user_role?: string | null
  actor?: string | null
  decision?: 'allow' | 'deny' | 'error' | null
  reason_code?: string | null
  year_month?: string | null
  period_type?: 'monthly' | 'half_year' | 'annual' | null
  period_key?: string | null
  store_scope?: string | null
  filing_type?: string | null
  target_type?: string | null
  target_id?: string | null
  payload?: unknown
  created_at?: string | null
}

export async function getIncomeExpenseClosingPreview(params: {
  userRole: string
  userStore?: string
  yearMonth: string
  storeFilter?: string
  profitLossAccountCode?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    storeFilter: params.storeFilter || 'All',
    profitLossAccountCode: params.profitLossAccountCode || '3120',
  })
  if (params.userStore) q.set('userStore', params.userStore)
  const res = await apiFetchWithOffline(`/api/getIncomeExpenseClosingPreview?${q}`)
  return res.json() as Promise<{
    preview: IncomeExpenseClosingPreview
    closed?: { id?: number; entry_no?: string | null; posted_at?: string | null; posted_by?: string | null } | null
    draft?:
      | {
          id?: number
          status?: string | null
          memo?: string | null
          created_at?: string | null
          created_by?: string | null
          payload?: IncomeExpenseClosingPreview | null
        }
      | null
    history?: IncomeExpenseClosingHistoryItem[]
  }>
}

export function getExportIncomeExpenseClosingAuditCsvUrl(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    storeFilter: params.storeFilter || 'All',
  })
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportIncomeExpenseClosingAuditCsv?${q}`
  }
  return `/api/exportIncomeExpenseClosingAuditCsv?${q}`
}

export async function getAccountingComplianceAuditLogs(params: {
  userRole: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  decision?: 'allow' | 'deny' | 'error' | 'all'
  actionKeyword?: string
  storeFilter?: string
  limit?: number
}) {
  const q = new URLSearchParams({ userRole: params.userRole })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.decision && params.decision !== 'all') q.set('decision', params.decision)
  if (params.actionKeyword) q.set('actionKeyword', params.actionKeyword)
  if (params.limit != null && Number.isFinite(params.limit)) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline(`/api/getAccountingComplianceAuditLogs?${q}`)
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    success: o.success === true,
    rows: jsonAsArray<AccountingComplianceAuditLog>(o.rows),
    fallbackUsed: o.fallbackUsed === true,
    error: typeof o.error === 'string' ? o.error : undefined,
  }
}

export async function getAccountingComplianceAuditTrend(params: {
  userRole: string
  yearMonth: string
  months?: number
  periodType?: 'monthly' | 'half_year' | 'annual'
  decision?: 'allow' | 'deny' | 'error' | 'all'
  actionKeyword?: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    months: String(params.months ?? 3),
  })
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.decision && params.decision !== 'all') q.set('decision', params.decision)
  if (params.actionKeyword) q.set('actionKeyword', params.actionKeyword)
  const res = await apiFetchWithOffline(`/api/getAccountingComplianceAuditTrend?${q}`)
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    success: o.success === true,
    rows: jsonAsArray<{
      year_month?: string | null
      total?: number | null
      allow_count?: number | null
      deny_count?: number | null
      error_count?: number | null
      deny_rate?: number | null
      error_rate?: number | null
    }>(o.rows),
    fallbackUsed: o.fallbackUsed === true,
    error: typeof o.error === 'string' ? o.error : undefined,
  }
}

export async function getAccountingWorkflowReminders(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    storeFilter: params.storeFilter || 'All',
  })
  const res = await apiFetchWithOffline(`/api/getAccountingWorkflowReminders?${q}`)
  const raw: unknown = await res.json()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      success: false,
      rows: [] as {
        filingType: string
        filingLabelKo: string
        periodType: 'monthly' | 'half_year' | 'annual'
        yearMonth: string
        dueDateBangkok: string
        daysToDue: number
        severity: 'info' | 'warn' | 'critical'
        status: string
        messageKo: string
      }[],
    }
  }
  const o = raw as Record<string, unknown>
  return {
    success: o.success === true,
    bangkokToday: typeof o.bangkokToday === 'string' ? o.bangkokToday : undefined,
    rows: jsonAsArray<{
      filingType: string
      filingLabelKo: string
      periodType: 'monthly' | 'half_year' | 'annual'
      yearMonth: string
      dueDateBangkok: string
      daysToDue: number
      severity: 'info' | 'warn' | 'critical'
      status: string
      messageKo: string
    }>(o.rows),
    summary:
      o.summary && typeof o.summary === 'object' && !Array.isArray(o.summary)
        ? (o.summary as { critical: number; warn: number; info: number })
        : undefined,
    error: typeof o.error === 'string' ? o.error : undefined,
  }
}

export function getExportAccountingComplianceAuditCsvUrl(params: {
  userRole: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  decision?: 'allow' | 'deny' | 'error' | 'all'
  actionKeyword?: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.decision && params.decision !== 'all') q.set('decision', params.decision)
  if (params.actionKeyword) q.set('actionKeyword', params.actionKeyword)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportAccountingComplianceAuditCsv?${q}`
  }
  return `/api/exportAccountingComplianceAuditCsv?${q}`
}

export async function saveIncomeExpenseClosingDraft(params: {
  userRole: string
  userStore?: string
  createdBy?: string | null
  yearMonth: string
  storeFilter?: string
  profitLossAccountCode?: string
  memo?: string
}) {
  const res = await apiFetchWithOffline('/api/saveIncomeExpenseClosingDraft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    error?: string
    id?: number
    warning?: string
    preview?: IncomeExpenseClosingPreview
  }>
}

export async function postIncomeExpenseClosing(params: {
  userRole: string
  userStore?: string
  postedBy?: string | null
  yearMonth: string
  storeFilter?: string
  profitLossAccountCode?: string
  forceReset?: boolean
  autoLockPeriod?: boolean
  memo?: string
}) {
  const res = await apiFetchWithOffline('/api/postIncomeExpenseClosing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    error?: string
    journalEntryId?: number
    entryNo?: string
    preview?: IncomeExpenseClosingPreview
    autoLocked?: boolean
  }>
}

export async function getAccountingWorkflowStatus(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, yearMonth: params.yearMonth })
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getAccountingWorkflowStatus?${q}`)
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    rows: jsonAsArray<AccountingWorkflowStatusRow>(o.rows),
    fallbackUsed: o.fallbackUsed === true,
  }
}

export async function saveAccountingWorkflowStatus(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingType: string
  status: 'todo' | 'in_progress' | 'review' | 'done'
  note?: string | null
  owner?: string | null
  updatedBy?: string | null
  storeFilter?: string
}) {
  const res = await apiFetchWithOffline('/api/saveAccountingWorkflowStatus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; error?: string; fallbackUsed?: boolean }>
}

export type PayrollSsoExpenseSyncDto = {
  created: number
  updated: number
  skippedPaid: number
  deleted: number
  stores: { store: string; totalBaht: number; employeeCount: number }[]
}

export async function syncPayrollSsoExpenseAccruals(params: {
  yearMonth: string
  storeFilter?: string
  postedBy?: string
}) {
  const res = await apiFetch('/api/syncPayrollSsoExpenseAccruals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    sync?: PayrollSsoExpenseSyncDto
    error?: string
  }>
}

// ─── 감가상각·고정자산 ───
export async function getFixedAssets(params: { storeFilter?: string; status?: string }) {
  const q = new URLSearchParams()
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.status) q.set('status', params.status)
  const res = await apiFetchWithOffline(`/api/getFixedAssets?${q}`)
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return { success: o.success === true, list: jsonAsArray(o.list) }
}

export async function saveFixedAsset(params: {
  id?: number
  assetCode?: string
  name: string
  storeName?: string
  acquisitionDate: string
  acquisitionCost: number
  residualRate?: number
  usefulLifeMonths?: number
  depreciationMethod?: string
  memo?: string
  assetAccountCode?: string
  accumulatedDepreciationAccountCode?: string
  depreciationExpenseAccountCode?: string
}) {
  const res = await apiFetchWithOffline('/api/saveFixedAsset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function setFixedAssetStatus(params: {
  id: number
  action: 'dispose' | 'restore'
  disposedAt?: string
  disposalProceeds?: number
  disposalGainAccountCode?: string
  disposalLossAccountCode?: string
  memo?: string
}) {
  const res = await apiFetchWithOffline('/api/saveFixedAsset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getDepreciationEntries(params: { yearMonth: string; storeFilter?: string }) {
  const q = new URLSearchParams({ yearMonth: params.yearMonth })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getDepreciationEntries?${q}`)
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    success: o.success === true,
    list: jsonAsArray(o.list),
    totalAmount: Number(o.totalAmount) || 0,
  }
}

export async function runDepreciationPreview(params: { yearMonth: string; storeFilter?: string }) {
  const q = new URLSearchParams({ yearMonth: params.yearMonth })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/runDepreciation?${q}`)
  const raw: unknown = await res.json()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { success: false, candidates: [], totalAmount: 0 }
  }
  const o = raw as Record<string, unknown>
  return {
    success: o.success === true,
    candidates: jsonAsArray<{
      id: number
      name: string
      store_name: string
      monthly_amount: number
    }>(o.candidates),
    totalAmount: Number(o.totalAmount) || 0,
  }
}

export async function runDepreciation(params: { yearMonth: string; storeFilter?: string; dryRun?: boolean }) {
  const res = await apiFetchWithOffline('/api/runDepreciation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; created?: number; totalAmount?: number; message?: string }>
}

export async function addBalanceTransaction(params: {
  type: 'payable' | 'receivable'
  vendorCode?: string
  storeName?: string
  amount: number
  transDate: string
  memo?: string
  isOpening?: boolean
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/addBalanceTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateReceivableReceiveCheck(params: {
  id: number
  receiveChecked: boolean
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/updateReceivableReceiveCheck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: number; receiveChecked?: boolean }>
}

// ─── 지출 관리 (MVP) ───
export type PayeeMemoMatchQuality = 'ok' | 'uncertain' | 'mismatch' | 'trivial'

export interface ExpenseAccrualPlanItem {
  id: number
  payeeCode: string
  payeeName: string
  withdrawalCategory?: string
  /** 인보이스·비용 총액(세금포함) */
  grossAmount?: number
  vatAmount?: number
  withholdingTaxAmount?: number
  /** 실제 지급 대상(총액 − 원천징수) */
  plannedAmount: number
  paidAmount: number
  remainingAmount: number
  /** 인보이스·영수증 등 첨부 URL 목록 */
  attachmentUrls?: string[]
  expenseDate: string
  dueDate?: string
  memo?: string
  accountSubjectId?: number | null
  status: 'planned' | 'approved' | 'paid' | 'rejected'
  approvedBy?: string | null
  approvedAt?: string | null
  approvalNote?: string | null
  rejectedBy?: string | null
  rejectedAt?: string | null
  rejectionNote?: string | null
  storeName?: string
  /** getApprovedExpenseAccrualsForBankTx: 통장 적요 vs 지급처(느슨) */
  payeeMemoMatchQuality?: PayeeMemoMatchQuality
  payeeMemoMatchDetail?: string
}

export interface LogisticsPaymentPlanItem {
  vendorCode: string
  remainingAmount: number
  txCount: number
}

export interface ExpensePaymentPlanResponse {
  success: boolean
  message?: string
  expensePlans: ExpenseAccrualPlanItem[]
  purchasePlans: ExpenseAccrualPlanItem[]
  logisticsPlans: LogisticsPaymentPlanItem[]
  totals: {
    expensePlanned: number
    expenseRemaining: number
    logisticsRemaining: number
    purchaseRemaining?: number
  }
}

export async function registerExpenseFromBankTransaction(params: {
  bankTransactionId: number
  payeeCode: string
  payeeName?: string
  accountSubjectId?: number | null
  memo?: string
  storeName?: string
  userName?: string
  userRole?: string
  updateExisting?: boolean
}) {
  const res = await apiFetchWithOffline('/api/registerExpenseFromBankTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: number }>
}

export async function registerPurchaseFromBankTransaction(params: {
  bankTransactionId: number
  vendorCode: string
  /** 본사 발주(orders.id)와 연결 — ref_type=Order */
  linkedOrderId?: number
  userName?: string
  userRole?: string
  updateExisting?: boolean
}) {
  const res = await apiFetchWithOffline('/api/registerPurchaseFromBankTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function addExpenseAccrual(params: {
  payeeCode: string
  payeeName?: string
  withdrawalCategory?: string
  categoryMain?: string
  categorySub?: string
  amount: number
  /** 부가세 금액(참고) */
  vatAmount?: number
  /** 원천징수세 — 실지급액 = amount − 이 값 */
  withholdingTaxAmount?: number
  expenseDate: string
  dueDate?: string
  memo?: string
  accountSubjectId?: number | null
  storeName?: string
  userName?: string
  userRole?: string
  /** 인보이스·영수증 등 (data URL 또는 https) */
  attachmentUrls?: string[]
}) {
  const res = await apiFetchWithOffline('/api/addExpenseAccrual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: number }>
}

export async function updateExpenseRegisterItem(params: {
  bankTransactionId: number
  accountId: number
  transDate: string
  amount: number
  memo?: string
  storeName?: string
  categoryMain: string
  categorySub?: string
  vendorCode?: string
  accountSubjectId?: number | null
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/updateExpenseRegisterItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteExpenseRegisterItem(params: {
  bankTransactionId: number
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/updateExpenseRegisterItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, action: 'delete' }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function approveExpenseAccrual(params: {
  expenseAccrualId: number
  action: 'approve' | 'reject'
  approvalNote?: string
  userName?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/approveExpenseAccrual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateExpenseAccrual(params: {
  expenseAccrualId: number
  amount: number
  vatAmount?: number
  withholdingTaxAmount?: number
  expenseDate: string
  dueDate?: string | null
  memo?: string
  payeeCode?: string
  payeeName?: string
  accountSubjectId?: number | null
  storeName?: string
  withdrawalCategory?: string
  categoryMain?: string
  categorySub?: string
  userRole?: string
  attachmentUrls?: string[]
}) {
  const res = await apiFetchWithOffline('/api/updateExpenseAccrual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, action: 'update' }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteExpenseAccrual(params: {
  expenseAccrualId: number
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/updateExpenseAccrual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, action: 'delete' }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteExpenseAccrualsWithoutStore(params: { userRole?: string }) {
  const res = await apiFetchWithOffline('/api/deleteExpenseAccrualsWithoutStore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; deletedCount?: number }>
}

export async function deletePurchaseAccrualsByVendor(params: {
  vendorCode: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/deletePurchaseAccrualsByVendor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; deletedCount?: number }>
}

export async function getApprovedExpenseAccrualsForBankTx(params: {
  bankTransactionId: number
  userRole?: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    bankTransactionId: String(params.bankTransactionId),
  })
  if (params.userRole) q.set('userRole', params.userRole)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getApprovedExpenseAccrualsForBankTx?${q}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    bankTransaction?: { id: number; amount: number; transDate: string; memo?: string; note?: string }
    list: ExpenseAccrualPlanItem[]
  }>
}

export async function getExpensePaymentPlan(params: {
  startStr: string
  endStr: string
  payeeFilter?: string
  vendorFilter?: string
  userRole?: string
  /** 매니저·가맹점주: 자기 매장 지급예정만 (서버는 JWT store 우선) */
  userStore?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.payeeFilter) q.set('payeeFilter', params.payeeFilter)
  if (params.vendorFilter) q.set('vendorFilter', params.vendorFilter)
  q.set('userRole', params.userRole ?? '')
  q.set('userStore', params.userStore ?? '')
  // 지급예정은 오프라인 큐/캐시 없이 항상 서버 조회 (검색·탭 전환 시 최신 데이터)
  const res = await apiFetch(`/api/getExpensePaymentPlan?${q}`)
  return res.json() as Promise<ExpensePaymentPlanResponse>
}

export async function executeExpensePayment(params: {
  expenseAccrualId: number
  paymentMethod: 'bank' | 'petty'
  amount: number
  transDate: string
  memo?: string
  accountId?: number
  store?: string
  bankTransactionId?: number | null
  userName?: string
  userRole?: string
  /** 통장 적요 vs 지급처 불일치(409) 시, 회계/본사 권한으로만 사용 */
  acknowledgePayeeMemoMismatch?: boolean
}) {
  const res = await apiFetchWithOffline('/api/executeExpensePayment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    code?: string
    message?: string
    payeeMemoMatchQuality?: PayeeMemoMatchQuality
    payeeMemoMatchDetail?: string
    bankTransactionId?: number | null
    pettyCashTransactionId?: number | null
    remainingAmount?: number
  }>
}

export async function getUnlinkedBankWithdrawals(params: {
  accountId: number
  startStr: string
  endStr: string
  amount?: number
  transDate?: string
}) {
  const q = new URLSearchParams({
    accountId: String(params.accountId),
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.amount != null && params.amount > 0) q.set('amount', String(params.amount))
  if (params.transDate) q.set('transDate', params.transDate)
  const res = await apiFetchWithOffline(`/api/getUnlinkedBankWithdrawals?${q}`)
  return res.json() as Promise<{
    list: { id: number; transDate: string; amount: number; memo: string }[]
  }>
}

export interface CardAccount {
  id?: number
  name: string
  store?: string | null
  memo?: string | null
  cardNumber?: string | null
  holderName?: string | null
  cardCompany?: string | null
}

export interface CardTransaction {
  id?: number
  cardAccountId: number
  transDate: string
  transType: 'charge' | 'expense'
  amount: number
  memo?: string | null
  bankTransactionId?: number | null
  vendorCode?: string | null
  accountSubjectId?: number | null
  note?: string | null
}

export async function getCardAccounts() {
  const res = await apiFetchWithOffline('/api/getCardAccounts')
  return jsonAsArray<CardAccount>(await res.json())
}

export async function getCardTransactions(params: {
  cardAccountId?: number
  startStr?: string
  endStr?: string
}) {
  const q = new URLSearchParams()
  if (params.cardAccountId) q.set('cardAccountId', String(params.cardAccountId))
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  const res = await apiFetchWithOffline(`/api/getCardTransactions?${q}`)
  return jsonObjectWithList<CardTransaction>(await res.json())
}

export async function saveCardAccount(params: { id?: number; name: string; store?: string; memo?: string; cardNumber?: string; holderName?: string; cardCompany?: string }) {
  const res = await apiFetchWithOffline('/api/saveCardAccount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function saveCardTransaction(params: {
  id?: number
  cardAccountId: number
  transDate: string
  transType: 'charge' | 'expense'
  amount: number
  memo?: string
  bankTransactionId?: number | null
  vendorCode?: string
  accountSubjectId?: number | null
  note?: string
}) {
  const res = await apiFetchWithOffline('/api/saveCardTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteCardAccount(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteCardAccount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteCardTransaction(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteCardTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type WithdrawalCategoryMain =
  | 'purchase'
  | 'expense'
  | 'fixed_asset'
  | 'transfer'
  | 'loan_repayment'
  | 'loan_given'
  | 'correction'
  | 'dividend'
export type WithdrawalCategorySub = 'normal' | 'advance'

export async function executeWithdrawal(params: {
  paymentMethod: 'bank' | 'petty'
  amount: number
  transDate: string
  memo?: string
  storeName?: string
  categoryMain: WithdrawalCategoryMain | string
  categorySub?: WithdrawalCategorySub | string
  vendorCode?: string
  accountSubjectId?: number | null
  accountSubjectCode?: string
  accountSubjectName?: string
  transferToAccountId?: number | null
  transferToAccountNo?: string | null
  transferBankAccountNo?: string | null
  transferBankRecipientName?: string | null
  transferToPettyStore?: string | null
  transferToCardAccountId?: number | null
  accountId?: number
  assetName?: string
  assetCode?: string
  usefulLifeMonths?: number
  residualRate?: number
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  userName?: string
  userRole?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/executeWithdrawal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    bankTransactionId?: number
    pettyCashTransactionId?: number
    fixedAssetId?: number
  }>
}

// ─── 매출 관리 (pos_orders 기반) ───
export async function getPosSalesByStore(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  /** dine_in / takeout / delivery — 복수 시 합산(OR) */
  orderTypes?: string[]
}) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  const res = await apiFetchWithOffline(`/api/posSalesByStore?${q}`)
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
  splitByStore?: boolean
}): Promise<PosSalesByPeriodResult> {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
    groupBy: params.groupBy,
  })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  if (params.splitByStore) q.set('splitByStore', '1')
  const res = await apiFetchWithOffline(`/api/posSalesByPeriod?${q}`)
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
}) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.stores?.length) q.set('stores', params.stores.join(','))
  else if (params.pos) q.set('pos', params.pos)
  if (params.orderTypes?.length) q.set('orderTypes', params.orderTypes.join(','))
  const res = await apiFetchWithOffline(`/api/posSalesByDeliveryApp?${q}`)
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

export async function getPosSalesByChannel(params: {
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
  const res = await apiFetchWithOffline(`/api/posSalesByChannel?${q}`)
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
  const truncated = res.headers.get('X-Sales-Truncated') === '1'
  const json = (await res.json()) as Partial<PosSalesByMenuHierarchyResult>
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

// ─── 통장 거래 ───
export interface BankAccount {
  id: number
  name: string
  store: string
  bankName?: string
  openingBalance: number
  openingBalanceDate: string | null
}

export interface BankTransactionItem {
  id?: number
  transDate: string
  transType: string
  amount: number
  memo: string
  note?: string
  category?: string
  accountSubjectId?: number | null
  salesDate?: string
  expenseDate?: string
  vendorCode?: string
  storeName?: string
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  purchaseOrderId?: number
  isLinked?: boolean
}

export interface BankTransactionsSummary {
  openingBalance: number
  beginningBalance: number
  periodDeposits: number
  periodWithdrawals: number
  calculatedBalance: number
  actualBalance?: number | null
  difference?: number | null
}

export async function getBankAccounts(params?: { store?: string; userStore?: string; userRole?: string }) {
  const q = new URLSearchParams()
  if (params?.store) q.set('store', params.store)
  if (params?.userStore) q.set('userStore', params.userStore)
  if (params?.userRole) q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getBankAccounts?${q}`)
  return jsonAsArray<BankAccount>(await res.json())
}

export async function getBankTransactions(params: {
  accountId: string | number
  startStr: string
  endStr: string
}) {
  return getBankTransactionsWithCache(params) as Promise<{
    list: BankTransactionItem[]
    summary: BankTransactionsSummary | null
  }>
}

export interface ExpenseRegisterItem {
  id?: number
  accountId?: number
  transDate: string
  transType: string
  amount: number
  memo?: string
  category: string
  accountSubjectId?: number | null
  expenseDate?: string
  vendorCode?: string
  storeName?: string
  invoiceReceived: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  linkStatus?: 'unlinked' | 'bank' | 'bank_plan' | 'inbound' | 'card'
  bankLinked?: boolean
  pettyLinked?: boolean
}

export async function getExpenseRegisterList(params: {
  accountId?: string | number
  startStr: string
  endStr: string
  category?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.accountId) q.set('accountId', String(params.accountId))
  if (params.category) q.set('category', params.category)
  const res = await apiFetchWithOffline(`/api/getExpenseRegisterList?${q}`)
  return jsonObjectWithList<ExpenseRegisterItem>(await res.json())
}

export async function addBankTransaction(params: {
  accountId: number
  transDate: string
  transType: 'deposit' | 'withdraw'
  amount: number
  memo?: string
  note?: string
  store?: string
  userName?: string
  category?: string
  fixedExpenseId?: number
  accountSubjectId?: number
  salesDate?: string
  expenseDate?: string
  vendorCode?: string
  storeName?: string
}) {
  const res = await apiFetchWithOffline('/api/addBankTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function addBankTransactionsBulk(params: {
  accountId: number
  store?: string
  userName?: string
  items: Array<{
    transDate: string
    transType: 'deposit' | 'withdraw'
    amount: number
    memo?: string
    note?: string
    category?: string
    accountSubjectId?: number
    salesDate?: string
    expenseDate?: string
    vendorCode?: string
    storeName?: string
  }>
}) {
  const res = await apiFetchWithOffline('/api/addBankTransactionsBulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  type BulkRes = {
    success?: boolean
    inserted?: number
    skipped?: number
    duplicateSkipped?: number
    policySkipped?: number
    policyAdjusted?: number
    message?: string
    queued?: boolean
  }
  let data: BulkRes = {}
  try {
    data = (await res.json()) as BulkRes
  } catch {
    return {
      success: false,
      queued: false,
      message: res.ok ? 'Invalid server response' : `HTTP ${res.status}`,
    }
  }
  const queued = res.headers.get('X-Offline-Queued') === '1' || data.queued === true
  return {
    ...data,
    success: queued ? false : Boolean(res.ok && data.success),
    queued,
  }
}

export async function updateBankTransactionInvoice(params: {
  bankTransactionId: number
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  purchaseOrderId?: number | null
}) {
  const res = await apiFetchWithOffline('/api/updateBankTransactionInvoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateBankTransaction(params: {
  bankTransactionId: number
  category?: string
  accountSubjectId?: number | null
  note?: string
  salesDate?: string
  expenseDate?: string
  vendorCode?: string
  storeName?: string
  withholdingTaxAmount?: number | null
  withholdingTaxRate?: number | null
}) {
  const res = await apiFetchWithOffline('/api/updateBankTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InboundBatchForLink {
  id: number
  batchDate: string
  vendorName: string
  totalAmount: number
  location?: string
}

export async function getInboundBatchesForLink(params: {
  vendorCode?: string
  vendorName?: string
  storeFilter?: string
}) {
  const q = new URLSearchParams()
  if (params.vendorCode?.trim()) q.set('vendorCode', params.vendorCode.trim())
  if (params.vendorName?.trim()) q.set('vendorName', params.vendorName.trim())
  if (params.storeFilter?.trim()) q.set('storeFilter', params.storeFilter.trim())
  const res = await apiFetchWithOffline(`/api/getInboundBatchesForLink?${q}`)
  return jsonAsArray<InboundBatchForLink>(await res.json())
}

export async function getBankTransactionInboundLinks(bankTransactionId: number) {
  const res = await apiFetchWithOffline(`/api/getBankTransactionInboundLinks?bankTransactionId=${bankTransactionId}`)
  return jsonAsArray<{ id?: number; inboundBatchId?: number; amount: number }>(await res.json())
}

export async function saveBankTransactionInboundLinks(params: {
  bankTransactionId: number
  links: { inboundBatchId: number; amount: number }[]
}) {
  const res = await apiFetchWithOffline('/api/saveBankTransactionInboundLinks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface BankMemoRule {
  id?: number
  keyword: string
  transType: string
  category: string
  accountSubjectId?: number | null
}

export async function getBankMemoRules() {
  const res = await apiFetchWithOffline('/api/getBankMemoRules')
  return jsonAsArray<BankMemoRule>(await res.json())
}

export async function saveBankMemoRule(params: {
  id?: number
  keyword: string
  transType: 'deposit' | 'withdraw'
  category: string
  accountSubjectId?: number | null
}) {
  const res = await apiFetchWithOffline('/api/saveBankMemoRule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteBankMemoRule(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteBankMemoRule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function saveBankAccount(params: {
  id?: number
  name: string
  store?: string
  bankName?: string
  openingBalance?: number
  openingBalanceDate?: string | null
}) {
  const res = await apiFetchWithOffline('/api/saveBankAccount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteBankAccount(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteBankAccount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 계정과목 ───
export interface AccountSubjectItem {
  id?: number
  code: string
  name: string
  nameEn?: string | null
  nameTh?: string | null
  type: string
  pAndLSection?: string | null
  sortOrder: number
  statementType?: string | null
  normalSide?: string | null
  parentId?: number | null
  isHeader?: boolean
  isSystem?: boolean
  coaClass?: string | null
}

export async function getAccountSubjects(params?: {
  type?: string
  forExpense?: boolean
  forFixed?: boolean
  forCost?: boolean
  forTransfer?: boolean
  forRevenue?: boolean
  forCard?: boolean
  forItem?: boolean
  excludeHeaders?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.type) q.set('type', params.type)
  if (params?.forExpense) q.set('forExpense', 'true')
  if (params?.forFixed) q.set('forFixed', 'true')
  if (params?.forCost) q.set('forCost', 'true')
  if (params?.forTransfer) q.set('forTransfer', 'true')
  if (params?.forRevenue) q.set('forRevenue', 'true')
  if (params?.forCard) q.set('forCard', 'true')
  if (params?.forItem) q.set('forItem', 'true')
  if (params?.excludeHeaders) q.set('excludeHeaders', 'true')
  const res = await apiFetchWithOffline(`/api/getAccountSubjects?${q}`)
  return jsonAsArray<AccountSubjectItem>(await res.json())
}

export async function saveAccountSubject(params: {
  id?: number
  code: string
  name: string
  nameEn?: string | null
  nameTh?: string | null
  type: string
  pAndLSection?: string | null
  sortOrder?: number
  parentId?: number | null
  isHeader?: boolean
  statementType?: string | null
  normalSide?: string | null
  coaClass?: string | null
}) {
  const res = await apiFetchWithOffline('/api/saveAccountSubject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteAccountSubject(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteAccountSubject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 고정비 ───
export interface FixedExpenseItem {
  id?: number
  name: string
  monthlyAmount: number
  store: string
  startYearMonth?: string | null
  endYearMonth?: string | null
  memo?: string | null
  accountSubjectId?: number | null
}

export async function getFixedExpenses(params?: { store?: string; userStore?: string; userRole?: string }) {
  const q = new URLSearchParams()
  if (params?.store) q.set('store', params.store)
  if (params?.userStore) q.set('userStore', params.userStore)
  if (params?.userRole) q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getFixedExpenses?${q}`)
  return jsonAsArray<FixedExpenseItem>(await res.json())
}

export async function saveFixedExpense(params: {
  id?: number
  name: string
  monthlyAmount: number
  store?: string
  startYearMonth?: string | null
  endYearMonth?: string | null
  memo?: string | null
  accountSubjectId?: number | null
}) {
  const res = await apiFetchWithOffline('/api/saveFixedExpense', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteFixedExpense(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteFixedExpense', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 인테리어 프로젝트 ───
export interface InteriorProject {
  id?: number
  code: string
  name: string
  location?: string
  status?: string
  budgetTotal?: number
  startDate?: string | null
  endDate?: string | null
}

export async function getInteriorProjects() {
  const res = await apiFetchWithOffline('/api/getInteriorProjects')
  return jsonAsArray<InteriorProject>(await res.json())
}

export async function saveInteriorProject(params: Partial<InteriorProject> & { code: string; name: string }) {
  const res = await apiFetchWithOffline('/api/saveInteriorProject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorProject(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorProject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type InteriorDashboardTotals = {
  activeProjectCount: number
  scheduleOverdueCount: number
  vendorDelayedCount: number
  overBudgetProjectCount: number
  projectsWithAnyAlert: number
}

export type InteriorDashboardSummary = {
  generatedAt: string
  totals: InteriorDashboardTotals
}

export async function getInteriorDashboardSummary() {
  const res = await apiFetchWithOffline('/api/getInteriorDashboardSummary')
  return res.json() as Promise<InteriorDashboardSummary>
}

export interface InteriorScheduleItem {
  id?: number
  projectId?: number
  itemNo?: number
  workDetail?: string
  startDate?: string | null
  endDate?: string | null
  dayProgress?: Record<string, unknown>
  sortOrder?: number
}

export async function getInteriorSchedule(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorSchedule?${q}`)
  return jsonAsArray<InteriorScheduleItem>(await res.json())
}

export async function saveInteriorScheduleItem(params: Partial<InteriorScheduleItem> & { projectId: number; workDetail: string }) {
  const res = await apiFetchWithOffline('/api/saveInteriorScheduleItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorScheduleItem(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorScheduleItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorWorkPackage {
  id?: number
  legacyId?: number
  isLegacy?: boolean
  projectId?: number
  partType?: string
  title?: string
  description?: string
  startDate?: string | null
  endDate?: string | null
  status?: 'planned' | 'in_progress' | 'blocked' | 'done' | 'cancelled' | string
  progressPct?: number
  color?: string
  sortOrder?: number
}

export async function getInteriorWorkPackages(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorWorkPackages?${q}`)
  return jsonAsArray<InteriorWorkPackage>(await res.json())
}

export async function saveInteriorWorkPackage(
  params: Partial<InteriorWorkPackage> & { projectId: number; title: string }
) {
  const res = await apiFetchWithOffline('/api/saveInteriorWorkPackage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorWorkPackage(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorWorkPackage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorVendorDirectoryEntry {
  id?: number
  code?: string
  name?: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  specialty?: string
  memo?: string
  useCount?: number
  lastUsedAt?: string | null
  isActive?: boolean
  sortOrder?: number
}

export async function getInteriorVendorDirectory(options?: { includeInactive?: boolean }) {
  const q = new URLSearchParams()
  if (options?.includeInactive) q.set('includeInactive', '1')
  const suffix = q.toString() ? `?${q}` : ''
  const res = await apiFetchWithOffline(`/api/getInteriorVendorDirectory${suffix}`)
  return jsonAsArray<InteriorVendorDirectoryEntry>(await res.json())
}

export async function saveInteriorVendorDirectory(
  params: Partial<InteriorVendorDirectoryEntry> & { name: string }
) {
  const res = await apiFetchWithOffline('/api/saveInteriorVendorDirectory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorVendorDirectory(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorVendorDirectory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorVendorTrack {
  id?: number
  projectId?: number
  vendorName?: string
  vendorCode?: string
  workPackageId?: number | null
  paymentDueDate?: string | null
  paymentPaidDate?: string | null
  materialEtaDate?: string | null
  materialReceivedDate?: string | null
  workCompletedDate?: string | null
  status?: 'planned' | 'ordered' | 'paid' | 'received' | 'done' | 'delayed' | 'cancelled' | string
  amount?: number
  note?: string
  sortOrder?: number
}

export async function getInteriorVendorTracks(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorVendorTracks?${q}`)
  return jsonAsArray<InteriorVendorTrack>(await res.json())
}

export async function saveInteriorVendorTrack(
  params: Partial<InteriorVendorTrack> & { projectId: number; vendorName: string; vendorCode: string }
) {
  const res = await apiFetchWithOffline('/api/saveInteriorVendorTrack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorVendorTrack(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorVendorTrack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorLayoutItem {
  id?: number
  projectId?: number
  zone?: 'kitchen' | 'hall' | string
  floor?: string
  x?: number
  y?: number
  w?: number
  h?: number
  rotation?: number
  itemName?: string
  qty?: number
  status?: 'planned' | 'ordered' | 'installed' | 'done' | 'blocked' | string
  materialSpecId?: number | null
  note?: string
  sortOrder?: number
}

export interface InteriorLayoutEditorPrefs {
  duplicateOffsetX?: number
  duplicateOffsetY?: number
  snapEnabled?: boolean
  snapStep?: number
  nudgeSmall?: number
  nudgeMedium?: number
  nudgeLarge?: number
  updatedAt?: string | null
}

export async function getInteriorLayoutItems(params: { projectId: string | number; zone?: string }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  if (params.zone) q.set('zone', String(params.zone))
  const res = await apiFetchWithOffline(`/api/getInteriorLayoutItems?${q}`)
  return jsonAsArray<InteriorLayoutItem>(await res.json())
}

export async function saveInteriorLayoutItem(
  params: Partial<InteriorLayoutItem> & { projectId: number; itemName: string }
) {
  const res = await apiFetchWithOffline('/api/saveInteriorLayoutItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorLayoutItem(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorLayoutItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getInteriorLayoutEditorPrefs(params: {
  projectId: string | number
  zone: string
  userStore: string
  userName: string
  employeeId?: number
}) {
  const q = new URLSearchParams({
    projectId: String(params.projectId),
    zone: String(params.zone),
    userStore: String(params.userStore),
    userName: String(params.userName),
  })
  if (params.employeeId != null && params.employeeId > 0) q.set('employeeId', String(params.employeeId))
  const res = await apiFetchWithOffline(`/api/getInteriorLayoutEditorPrefs?${q}`)
  return res.json() as Promise<InteriorLayoutEditorPrefs>
}

export async function saveInteriorLayoutEditorPrefs(params: {
  projectId: number
  zone: string
  userStore: string
  userName: string
  employeeId?: number
  duplicateOffsetX: number
  duplicateOffsetY: number
  snapEnabled?: boolean
  snapStep?: number
  nudgeSmall?: number
  nudgeMedium?: number
  nudgeLarge?: number
}) {
  const res = await apiFetchWithOffline('/api/saveInteriorLayoutEditorPrefs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorMaterialSpec {
  id?: number
  projectId?: number
  materialCode?: string
  materialName?: string
  spec?: string
  supplier?: string
  unit?: string
  unitCost?: number
  imageUrl?: string
  location?: string
  note?: string
  sortOrder?: number
}

export async function getInteriorMaterialSpecs(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorMaterialSpecs?${q}`)
  return jsonAsArray<InteriorMaterialSpec>(await res.json())
}

export async function saveInteriorMaterialSpec(
  params: Partial<InteriorMaterialSpec> & { projectId: number; materialName: string }
) {
  const res = await apiFetchWithOffline('/api/saveInteriorMaterialSpec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorMaterialSpec(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorMaterialSpec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorExpenseItem {
  id?: number
  projectId?: number
  category?: string
  description?: string
  vendorCode?: string
  quote?: number
  paid?: number
  balance?: number
  paymentSchedule?: unknown[]
  sortOrder?: number
}

export async function getInteriorExpenseItems(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorExpenseItems?${q}`)
  return jsonAsArray<InteriorExpenseItem>(await res.json())
}

export async function saveInteriorExpenseItem(params: Partial<InteriorExpenseItem> & { projectId: number; description: string }) {
  const res = await apiFetchWithOffline('/api/saveInteriorExpenseItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorExpenseItem(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorExpenseItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function payInteriorExpense(params: {
  expenseId: number
  accountId: number
  transDate: string
  amount: number
  memo?: string
}) {
  const res = await apiFetchWithOffline('/api/payInteriorExpense', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; bankTransactionId?: number }>
}

export interface InteriorDirectPurchase {
  id?: number
  projectId?: number
  category?: string
  itemNo?: number
  description?: string
  qty?: number
  unit?: string
  price?: number
  sumAmount?: number
  supplierCode?: string
  status?: string
  remark?: string
}

export async function getInteriorDirectPurchases(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorDirectPurchases?${q}`)
  return jsonAsArray<InteriorDirectPurchase>(await res.json())
}

export async function saveInteriorDirectPurchase(params: Partial<InteriorDirectPurchase> & { projectId: number; description: string }) {
  const res = await apiFetchWithOffline('/api/saveInteriorDirectPurchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorDirectPurchase(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorDirectPurchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorProjectFile {
  id?: number
  projectId?: number
  fileType?: string
  fileName?: string
  filePath?: string
  fileSize?: number
  uploadedAt?: string | null
}

export async function getInteriorFiles(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorFiles?${q}`)
  return jsonAsArray<InteriorProjectFile>(await res.json())
}

export async function uploadInteriorFile(params: {
  projectId: string | number
  fileType: string
  file: File
}) {
  const file = params.file
  const pres = await apiFetchWithOffline('/api/uploadInteriorFile/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: String(params.projectId),
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || 'application/octet-stream',
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    storagePath?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.storagePath) {
    return {
      success: false,
      message: pjson.message || '업로드 준비 실패',
      url: undefined,
    }
  }
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, file, { upsert: false })
  if (!putRes.ok) {
    const raw = await putRes.text().catch(() => '')
    return {
      success: false,
      message: raw || `Storage 업로드 실패 (${putRes.status})`,
      url: undefined,
    }
  }
  const done = await apiFetchWithOffline('/api/uploadInteriorFile/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: String(params.projectId),
      fileType: params.fileType,
      fileName: file.name,
      fileSize: file.size,
      storagePath: pjson.storagePath,
    }),
  })
  return done.json() as Promise<{ success: boolean; message?: string; url?: string }>
}

export async function deleteInteriorFile(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorFile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorKitchenItem {
  id?: number
  projectId?: number
  itemNameKr?: string
  itemNameEn?: string
  sizeMm?: string
  supplierCode?: string
  zone?: string
  price?: number
  quantity?: number
}

export async function getInteriorKitchenItems(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorKitchenItems?${q}`)
  return jsonAsArray<InteriorKitchenItem>(await res.json())
}

export async function saveInteriorKitchenItem(params: Partial<InteriorKitchenItem> & { projectId: number }) {
  const res = await apiFetchWithOffline('/api/saveInteriorKitchenItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorKitchenItem(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorKitchenItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorSpecification {
  id?: number
  projectId?: number
  description?: string
  code?: string
  size?: string
  supplierCode?: string
  location?: string
}

export async function getInteriorSpecifications(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorSpecifications?${q}`)
  return jsonAsArray<InteriorSpecification>(await res.json())
}

export async function saveInteriorSpecification(params: Partial<InteriorSpecification> & { projectId: number; description: string }) {
  const res = await apiFetchWithOffline('/api/saveInteriorSpecification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorSpecification(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorSpecification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 품목/거래처 관리 (Admin) ───
export interface AdminItem {
  code: string
  name: string
  category: string
  vendor: string
  outboundLocation?: string
  spec: string
  unit?: string
  price: number
  cost: number
  /** 총 수량 (표준 단위). 있으면 단위당 원가 = price/totalQuantity */
  totalQuantity?: number | null
  taxType: 'taxable' | 'exempt' | 'zero'
  imageUrl: string
  hasImage: boolean
  description?: string
  purchaseSource?: 'hq' | 'store'
  /** true이면 매장 발주 품목 검색에 노출되지 않음 */
  orderDisabled?: boolean
  /** 표시 순서. 엑셀 가져오기 시 행 순서로 설정. 있으면 이 값 기준 정렬 */
  sortOrder?: number
  /** 재고 기본 단위 (저장 단위). 비어 있으면 unit 사용 (하위 호환) */
  stockBaseUnit?: string
  /** 조정/조사 시 선택 단위 (하위 호환) */
  stockUnitOptions?: { unit: string; factor: number }[]
  /** 표준 단위 목록. (totalQuantity) [unit] = 1 규격 */
  standardUnits?: { unit: string; totalQuantity: number }[]
  /** 품목별 기본 계정과목 (선택). 미지정이면 기존 재고/매입 흐름 유지 */
  accountSubjectId?: number | null
}

export interface AdminVendor {
  code: string
  name: string
  gps_name?: string
  sales_outlet?: string
  contact: string
  phone: string
  email: string
  address: string
  tax_no?: string
  type: 'purchase' | 'sales' | 'both'
  memo: string
}

export async function getAdminItems(options?: { scope?: 'outbound' | 'order' }) {
  return getAdminItemsWithCache(options) as Promise<AdminItem[]>
}

export interface WarehouseLocation {
  id?: number
  name: string
  address: string
  location_code: string
  sort_order: number
}

export async function getWarehouseLocations() {
  return getWarehouseLocationsWithCache() as Promise<WarehouseLocation[]>
}

export async function saveWarehouseLocation(params: {
  id?: number
  name: string
  address?: string
  location_code?: string
  sort_order?: number
}) {
  const res = await apiFetchWithOffline('/api/saveWarehouseLocation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteWarehouseLocation(params: { id?: number; location_code?: string }) {
  const res = await apiFetchWithOffline('/api/deleteWarehouseLocation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface ItemCategory {
  id?: number
  name: string
  sort_order?: number
}

export async function getItemCategorySettings() {
  const res = await apiFetchWithOffline('/api/getItemCategorySettings')
  return jsonAsArray<ItemCategory>(await res.json())
}

export async function saveItemCategory(params: {
  id?: number
  name: string
  oldName?: string
  sort_order?: number
}) {
  const res = await apiFetchWithOffline('/api/saveItemCategory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; queued?: boolean }>
}

export async function deleteItemCategory(params: { id?: number; name?: string }) {
  const res = await apiFetchWithOffline('/api/deleteItemCategory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; queued?: boolean }>
}

export async function getItemCategories() {
  const res = await apiFetchWithOffline('/api/getItemCategories')
  return res.json() as Promise<{ categories: string[] }>
}

export async function getAdminVendors() {
  const res = await apiFetchWithOffline('/api/getVendors')
  return jsonAsArray<AdminVendor>(await res.json())
}

export async function saveItem(params: {
  code: string
  name: string
  category?: string
  vendor?: string
  outboundLocation?: string
  spec?: string
  unit?: string
  price?: number
  cost?: number
  totalQuantity?: number | null
  taxType?: string
  imageUrl?: string
  description?: string
  editingCode?: string
  purchaseSource?: 'hq' | 'store'
  stockBaseUnit?: string
  stockUnitOptions?: { unit: string; factor: number }[]
  standardUnits?: { unit: string; totalQuantity: number }[]
  accountSubjectId?: number | null
}) {
  const res = await apiFetchWithOffline('/api/saveItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const json = (await res.json()) as { success: boolean; message?: string }
  if (json?.success) await invalidateAdminItemsCache().catch(() => {})
  return json
}

export async function deleteItem(params: { code: string }) {
  const res = await apiFetchWithOffline('/api/deleteItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const json = (await res.json()) as { success: boolean; message?: string }
  if (json?.success) await invalidateAdminItemsCache().catch(() => {})
  return json
}

/** 가격 이력 조회 */
export interface PriceHistoryRow {
  id: number
  entity_type: string
  entity_id: string
  entity_display_name: string | null
  field_name: string
  old_value: number | null
  new_value: number | null
  changed_at: string
  changed_by: string | null
}

export interface PriceScheduleRow {
  id: number
  entity_type: "item" | "pos_menu"
  entity_id: string
  entity_display_name: string | null
  field_name: string
  current_value: number | null
  scheduled_value: number
  status: "pending" | "applied" | "cancelled" | "failed"
  effective_at: string
  created_by: string | null
  created_at: string
  applied_at?: string | null
  cancelled_at?: string | null
  failed_reason?: string | null
}

export async function getPriceHistory(params: {
  entityType?: 'pos_menu' | 'pos_menu_option' | 'item'
  entityId?: string
  menuId?: string
  categoryMain?: string
  category?: string
  from?: string
  to?: string
  search?: string
  limit?: number
}) {
  const searchParams = new URLSearchParams()
  if (params.entityType) searchParams.set('entityType', params.entityType)
  if (params.entityId) searchParams.set('entityId', params.entityId)
  if (params.menuId) searchParams.set('menuId', params.menuId)
  if (params.categoryMain) searchParams.set('categoryMain', params.categoryMain)
  if (params.category) searchParams.set('category', params.category)
  if (params.from) searchParams.set('from', params.from)
  if (params.to) searchParams.set('to', params.to)
  if (params.search) searchParams.set('search', params.search)
  if (params.limit != null) searchParams.set('limit', String(params.limit))
  const q = searchParams.toString()
  const res = await apiFetchWithOffline(`/api/getPriceHistory${q ? '?' + q : ''}`)
  const data = await res.json()
  if (!res.ok || (data && typeof data === 'object' && 'error' in data)) {
    console.warn('getPriceHistory:', data?.error || res.status)
    return []
  }
  return Array.isArray(data) ? data : []
}

export async function backfillPriceHistory() {
  const res = await apiFetchWithOffline('/api/backfillPriceHistory', { method: 'POST' })
  const data = await res.json() as { success?: boolean; inserted?: number; error?: string }
  if (!res.ok || !data?.success) {
    return { success: false as const, error: data?.error || '실패', inserted: 0 }
  }
  return { success: true as const, inserted: data.inserted ?? 0, message: `${data.inserted ?? 0}건 등록됨` }
}

/** 가격 이력 복구. targetDate(YYYY-MM-DD) 있으면 해당 날짜 시점 가격으로 메뉴/옵션 복구, 없으면 0/비어있는 것만 복구 */
export async function restoreFromPriceHistory(params?: { targetDate?: string; dryRun?: boolean }) {
  const sp = new URLSearchParams()
  if (params?.dryRun) sp.set('dryRun', '1')
  if (params?.targetDate) sp.set('targetDate', params.targetDate)
  const q = sp.toString()
  const url = q ? `/api/restoreFromPriceHistory?${q}` : '/api/restoreFromPriceHistory'
  const res = await apiFetchWithOffline(url, { method: 'POST' })
  const data = await res.json() as {
    success?: boolean
    message?: string
    restored?: { items: number; menus: number; options: number }
    dryRun?: boolean
    targetDate?: string
    details?: { items: string[]; menus: string[]; options: string[] }
  }
  if (!res.ok || !data?.success) {
    return { success: false as const, error: data?.message || '복구 실패', restored: { items: 0, menus: 0, options: 0 } }
  }
  return {
    success: true as const,
    message: data.message,
    restored: data.restored ?? { items: 0, menus: 0, options: 0 },
    dryRun: data.dryRun,
    targetDate: data.targetDate,
    details: data.details,
  }
}

export async function getPriceSchedules(params: {
  entityType?: "item" | "pos_menu"
  status?: "pending" | "applied" | "cancelled" | "failed"
  search?: string
  category?: string
  limit?: number
}) {
  const sp = new URLSearchParams()
  if (params.entityType) sp.set("entityType", params.entityType)
  if (params.status) sp.set("status", params.status)
  if (params.search) sp.set("search", params.search)
  if (params.category) sp.set("category", params.category)
  if (params.limit != null) sp.set("limit", String(params.limit))
  const q = sp.toString()
  const res = await apiFetchWithOffline(`/api/getPriceSchedules${q ? `?${q}` : ""}`)
  const data = await res.json().catch(() => [])
  if (!res.ok || (data && typeof data === "object" && "error" in data)) return []
  return Array.isArray(data) ? (data as PriceScheduleRow[]) : []
}

export async function savePriceSchedule(params: {
  entityType: "item" | "pos_menu"
  entityId: string
  fieldName: string
  scheduledValue: number
  effectiveAt: string
}) {
  const res = await apiFetchWithOffline("/api/savePriceSchedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  return (await res.json().catch(() => ({ success: false, message: "저장 실패" }))) as {
    success: boolean
    message?: string
  }
}

export async function cancelPriceSchedule(params: { id: number }) {
  const res = await apiFetchWithOffline("/api/cancelPriceSchedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  return (await res.json().catch(() => ({ success: false, message: "취소 실패" }))) as {
    success: boolean
    message?: string
  }
}

export async function applyDuePriceSchedules() {
  const res = await apiFetchWithOffline("/api/applyDuePriceSchedules", { method: "POST" })
  return (await res.json().catch(() => ({ success: false, message: "실행 실패", appliedCount: 0, failedCount: 0 }))) as {
    success: boolean
    message?: string
    appliedCount: number
    failedCount: number
  }
}

export async function updateItemOrderDisabled(params: { code: string; disabled: boolean }) {
  const res = await apiFetchWithOffline('/api/updateItemOrderDisabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; disabled?: boolean; message?: string }>
}

/** Excel 원가 파일 → 코드가 없는 품목만 신규 등록 */
export async function importItemsFromExcel(file: File) {
  const form = new FormData()
  form.set('file', file)
  const res = await apiFetchWithOffline('/api/importItemsFromExcel', {
    method: 'POST',
    body: form,
  })
  return res.json() as Promise<{ success: boolean; message?: string; added?: number }>
}

// ─── POS 메뉴 관리 ───
export interface PosMenu {
  id: string
  code: string
  name: string
  category: string
  categoryMain?: string
  price: number
  priceDelivery?: number | null
  imageUrl: string
  vatIncluded: boolean
  isActive: boolean
  sortOrder: number
  soldOutDate?: string | null
  /** 옵션 단계별 선택 그룹. 예: ["size","bone"] → 1단계 사이즈, 2단계 뼈/순살 */
  optionSelectionGroups?: string[]
  /** 그룹별 선택 규칙(1단계): required/optional + 최대 1개 선택 */
  optionSelectionConfig?: PosOptionSelectionGroupConfig[]
  /** 주방: null=설정·카테고리 따름, 0=주방 미인쇄, 1~3=해당 주방 */
  kitchenPrinter?: number | null
  /** 조리 시간(분), 예상 완성 시간/KDS 등 활용 */
  cookingTimeMin?: number | null
  /** 반반 메뉴: POS에서 다른 치킨(S 순살) 2개를 골라 한 상으로 주문, 원가는 각 0.5씩 */
  isBanban?: boolean
  /** 반반 메뉴별 허용 맛 메뉴 id 목록 (명시적 whitelist) */
  banbanFlavorMenuIds?: string[]
  /** 프로모션 마스터와 연동된 미러 메뉴 */
  promoId?: string | null
  /** 채널별 메뉴 설명 (미입력 시 default 사용) */
  descriptionDefault?: string
  descriptionDelivery?: string | null
  descriptionTable?: string | null
  /** 메뉴 노출 대상 매장 목록(비어 있으면 호환모드에서 전체 노출 가능) */
  storeCodes?: string[]
  /** 홀(매장 주문) 메뉴 노출 여부 */
  sellHall?: boolean
  /** 배달 주문 메뉴 노출 여부 */
  sellDelivery?: boolean
  /** 포장 주문 메뉴 노출 여부 */
  sellPackaging?: boolean
}

export interface PosOptionSelectionGroupConfig {
  key: string
  label?: string
  /** 단계 노출 채널: all(홀+배달+포장) | hall(홀+포장) | delivery(배달 전용) */
  audience?: 'all' | 'hall' | 'delivery'
  required?: boolean
  minSelect?: number
  maxSelect?: number
}

export interface PosMenuOption {
  id: string
  menuId: string
  /** 메뉴별 고유 옵션 코드 (예: C001-1) */
  optionCode?: string
  name: string
  priceModifier: number
  priceModifierDelivery?: number | null
  priceModifierPackaging?: number | null
  sortOrder: number
  optionType?: 'substitution' | 'additive'
  itemCode?: string | null
  /** 추가형: 연결 소스 메뉴 DB id. 있으면 item_code(레거시)보다 우선 */
  additiveSourceMenuId?: number | null
  quantity?: number
  /** 복합 옵션의 단계별 값. 예: {"size":"M","part":"순살"} */
  optionStepValues?: Record<string, string> | null
  /** 홀에서 판매 */
  sellHall?: boolean
  /** 배달에서 판매 */
  sellDelivery?: boolean
  /** 포장에서 판매 */
  sellPackaging?: boolean
  /** 채널별 옵션 설명 (미입력 시 default 사용) */
  descriptionDefault?: string
  descriptionDelivery?: string | null
  descriptionTable?: string | null
}

export interface PosOptionGroupItem {
  id: string
  groupId: string
  /** 그룹 항목 코드(선택) */
  itemCode?: string
  itemName: string
  sortOrder: number
  basePriceHall: number
  basePriceDelivery?: number | null
  sellHall: boolean
  sellDelivery: boolean
}

export interface PosMenuOptionGroupLink {
  id?: string
  menuId: string
  groupId: string
  sortOrder: number
  sellHall: boolean
  sellDelivery: boolean
  priceHallOverride?: number | null
  priceDeliveryOverride?: number | null
  required?: boolean
  minSelect?: number
  maxSelect?: number
}

export interface PosOptionGroup {
  id: string
  /** 그룹 내부 고유 코드(1차 호환: key 기반 파생) */
  code?: string
  key: string
  name: string
  isActive: boolean
  sortOrder: number
  items: PosOptionGroupItem[]
  link?: PosMenuOptionGroupLink | null
  /** menuId 없이 전체 조회 시: 이 그룹을 링크한 서로 다른 메뉴 수 */
  linkedMenuCount?: number
}

export type PosPackagingChecklistOrderType = 'takeout' | 'delivery' | 'both'

export interface PosMenuPackagingCheckItem {
  id: string
  menuId: string
  optionId?: string | null
  orderType: PosPackagingChecklistOrderType
  itemName: string
  isRequired: boolean
  sortOrder: number
  isActive: boolean
}

export interface PosOrderPackagingChecklistGroup {
  orderItemId: string
  itemName: string
  menuId: string
  menuName?: string
  optionId?: string | null
  optionName?: string | null
  checks: {
    id: string
    itemName: string
    isRequired: boolean
    sortOrder: number
    optionId?: string | null
  }[]
}

export async function getPosMenus(params?: { fresh?: boolean; storeCode?: string | null }) {
  const storeCode = String(params?.storeCode || '').trim()
  const q = new URLSearchParams()
  if (storeCode) q.set('storeCode', storeCode)
  const url = '/api/getPosMenus' + (q.toString() ? `?${q.toString()}` : '')
  const cacheKey = posMenusCatalogCacheKey(storeCode || null)
  if (params?.fresh) {
    const res = await apiFetchWithOffline(url)
    const data = await res.json().catch(() => [])
    return Array.isArray(data) ? (data as PosMenu[]) : []
  }
  return fetchPosCatalogCached<PosMenu[]>(cacheKey, url, [])
}

export async function getPosMenuPackagingChecklist(params: { menuId: string }) {
  const q = new URLSearchParams()
  q.set('menuId', params.menuId)
  const res = await apiFetchWithOffline(`/api/getPosMenuPackagingChecklist?${q.toString()}`)
  return res.json() as Promise<{
    success: boolean
    schemaReady?: boolean
    message?: string
    items: PosMenuPackagingCheckItem[]
  }>
}

export async function savePosMenuPackagingChecklist(params: {
  menuId: string
  items: {
    id?: string
    optionId?: string | null
    orderType: PosPackagingChecklistOrderType
    itemName: string
    isRequired: boolean
    sortOrder: number
    isActive: boolean
  }[]
}) {
  const res = await apiFetchWithOffline('/api/savePosMenuPackagingChecklist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; saved?: number }>
}

export async function getPosPackagingChecklistByOrder(params: { orderId: number }) {
  const q = new URLSearchParams()
  q.set('orderId', String(params.orderId))
  const res = await apiFetchWithOffline(`/api/getPosPackagingChecklistByOrder?${q.toString()}`)
  return res.json() as Promise<{
    success: boolean
    schemaReady?: boolean
    message?: string
    orderType?: 'takeout' | 'delivery' | null
    hasChecklist: boolean
    groups: PosOrderPackagingChecklistGroup[]
    unresolvedMappings: { orderItemId: string; itemName: string }[]
  }>
}

export async function getNextPosMenuCode(mainCategory: string) {
  const q = new URLSearchParams({ mainCategory })
  const res = await apiFetchWithOffline(`/api/getNextPosMenuCode?${q}`)
  return res.json() as Promise<{ code: string | null; message?: string }>
}

export async function getPosMenuCategories() {
  return fetchPosCatalogCached<{ categories: string[]; mainCategories: string[] }>(
    'erp:posCatalog:categories',
    '/api/getPosMenuCategories',
    { categories: [], mainCategories: [] }
  )
}

export interface PosMenuCategoriesConfig {
  mainCategories: string[]
  categoriesByMain: Record<string, string[]>
}

export type DeliveryAppCode = 'grab' | 'lineman' | 'shopee'
export type DeliveryAcceptanceMode = 'manual' | 'auto'

export interface PosDeliveryAppPolicy {
  storeCode: string
  appCode: DeliveryAppCode
  enabled: boolean
  orderAcceptanceMode: DeliveryAcceptanceMode
  autoAcceptEnabled: boolean
  /** 플랫폼 정산 수수료(%) — Grab/LINE 등 익일 NET 입금 대사 (본사 PO 배달 GP와 별도) */
  settlementFeePct?: number | null
  updatedAt?: string
}

export interface PosDeliveryMenuPolicy {
  storeCode: string
  appCode: DeliveryAppCode
  menuId: number
  enabled: boolean
  sortOrder: number
  sellStartTime?: string | null
  sellEndTime?: string | null
  stockQty?: number | null
  soldOut: boolean
  autoStopOnZero: boolean
  imageUrl?: string | null
}

export interface PosDeliveryCategoryOrder {
  storeCode: string
  appCode: DeliveryAppCode
  categoryMain?: string
  category: string
  sortOrder: number
}

export interface PosDeliveryPolicyBundle {
  success?: boolean
  appPolicy: PosDeliveryAppPolicy
  menuPolicies: PosDeliveryMenuPolicy[]
  categoryOrders: PosDeliveryCategoryOrder[]
}

export async function getPosMenuCategoriesConfig() {
  const res = await apiFetchWithOffline('/api/posMenuCategories')
  return res.json() as Promise<PosMenuCategoriesConfig>
}

export async function applyPosMenuCategoryPresets() {
  const res = await apiFetchWithOffline('/api/applyPosMenuCategoryPresets', {
    method: 'POST',
  })
  return res.json() as Promise<{ success: boolean; updated: number; total: number }>
}

export async function savePosMenuCategoriesConfig(params: {
  mainCategories: string[]
  categoriesByMain: Record<string, string[]>
  applyToMenus?: boolean
}) {
  const res = await apiFetchWithOffline('/api/posMenuCategories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    mainCategories: string[]
    categoriesByMain: Record<string, string[]>
    menusUpdated?: number
    message?: string
  }>
}

export async function getPosDeliveryAppPolicies(params: {
  storeCode: string
  appCode: DeliveryAppCode
}) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  q.set('appCode', params.appCode)
  const res = await apiFetchWithOffline(`/api/getPosDeliveryAppPolicies?${q.toString()}`)
  return res.json() as Promise<PosDeliveryPolicyBundle & { success: boolean; message?: string }>
}

export async function savePosDeliveryAppPolicies(params: {
  storeCode: string
  appCode: DeliveryAppCode
  appPolicy?: Partial<PosDeliveryAppPolicy>
  menuPolicies?: PosDeliveryMenuPolicy[]
  categoryOrders?: PosDeliveryCategoryOrder[]
}) {
  const res = await apiFetchWithOffline('/api/savePosDeliveryAppPolicies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type GrabPromoCampaign = {
  merchantID: string
  id: string
  name: string
  section: 'ongoing' | 'upcoming'
  discountType: string
  discountValue: number
  itemIds: string[]
  startTimeUtc: string
  endTimeUtc: string
  startTimeBkk: string
  endTimeBkk: string
}

export type GrabErpPromoForCampaignLookup = {
  promoId: number
  name: string
  campaignNameRef: string
  grabMenuItemId: string
  salePrice: number
  regularPrice: number
  validFrom: string | null
  validTo: string | null
}

export async function getGrabPromoCampaigns(params: { storeCode?: string; merchantID?: string }) {
  const q = new URLSearchParams()
  if (params.storeCode) q.set('storeCode', params.storeCode)
  if (params.merchantID) q.set('merchantID', params.merchantID)
  const res = await apiFetchWithOffline(`/api/grab/debugPromoCampaigns?${q.toString()}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    storeCode?: string
    resolvedFrom?: 'storeCode' | 'merchantID' | 'default'
    resolvedMerchantIDs?: string[]
    todayBkk?: string
    campaignsSuppressed?: boolean
    consumerListPriceMode?: 'sale' | 'regular'
    grabCampaignCount?: number
    grabCampaigns?: GrabPromoCampaign[]
    erpGrabPromos?: GrabErpPromoForCampaignLookup[]
    hint?: string
  }>
}

export async function getPosMenuOptions(params?: {
  menuId?: string
  fresh?: boolean
  forCodeMap?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.menuId) q.set('menuId', params.menuId)
  if (params?.forCodeMap) q.set('forCodeMap', '1')
  const qs = q.toString()
  const url = '/api/getPosMenuOptions' + (qs ? `?${qs}` : '')
  if (params?.fresh) {
    const res = await apiFetchWithOffline(url)
    const data = await res.json().catch(() => [])
    return Array.isArray(data) ? (data as PosMenuOption[]) : []
  }
  const cacheKey = `erp:posCatalog:options:${params?.menuId?.trim() || 'all'}:${params?.forCodeMap ? 'codemap' : 'default'}`
  return fetchPosCatalogCached<PosMenuOption[]>(cacheKey, url, [])
}

export async function getPosOptionGroups(params?: { menuId?: string }) {
  const q = new URLSearchParams()
  if (params?.menuId) q.set("menuId", params.menuId)
  const qs = q.toString()
  const res = await apiFetchWithOffline(
    "/api/getPosOptionGroups" + (qs ? `?${qs}` : "")
  )
  const data = await res.json().catch(() => [])
  return Array.isArray(data) ? (data as PosOptionGroup[]) : []
}

export async function savePosOptionGroup(params: {
  id?: string
  key: string
  name: string
  isActive?: boolean
  sortOrder?: number
  items: Array<{
    id?: string
    itemName: string
    sortOrder: number
    basePriceHall?: number
    basePriceDelivery?: number | null
    sellHall?: boolean
    sellDelivery?: boolean
  }>
}) {
  const res = await apiFetchWithOffline("/api/savePosOptionGroup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: string; message?: string }>
}

export async function deletePosOptionGroup(params: { id: string }) {
  const res = await apiFetchWithOffline("/api/deletePosOptionGroup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function savePosMenuOptionGroupLinks(params: {
  menuId: number
  links: Array<{
    id?: string
    groupId: string
    sortOrder: number
    sellHall?: boolean
    sellDelivery?: boolean
    priceHallOverride?: number | null
    priceDeliveryOverride?: number | null
    required?: boolean
    minSelect?: number
    maxSelect?: number
  }>
}) {
  const res = await apiFetchWithOffline("/api/savePosMenuOptionGroupLinks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function migratePosMenuOptionsToGroupLinks(params?: {
  menuId?: number
  dryRun?: boolean
}) {
  const res = await apiFetchWithOffline("/api/migratePosMenuOptionsToGroupLinks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params || {}),
  })
  return res.json() as Promise<{
    success: boolean
    dryRun?: boolean
    menuCount?: number
    groupsCreated?: number
    itemsCreated?: number
    linksSaved?: number
    message?: string
  }>
}

/** 오프라인 큐의 가짜 성공(JSON)과 구분 — 관리자 원가 분석 등 “즉시 반영”이 필요한 저장용 */
async function parsePosMutationResponse(res: Response): Promise<{ success: boolean; message?: string }> {
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string }
  if (!res.ok) {
    throw new Error(data?.message || `요청 실패 (${res.status})`)
  }
  if (res.headers.get('X-Offline-Queued') === '1') {
    throw new Error(
      data?.message ||
        '네트워크 오류로 서버에 저장되지 않았습니다. 연결을 확인한 뒤 다시 시도하세요.'
    )
  }
  if (data.success === false) {
    throw new Error(data.message || '저장에 실패했습니다.')
  }
  return data as { success: boolean; message?: string }
}

export async function savePosMenuOption(
  params: {
    id?: string
    menuId: number
    optionCode?: string
    name: string
    priceModifier?: number
    priceModifierDelivery?: number | null
    priceModifierPackaging?: number | null
    sortOrder?: number
    optionType?: 'substitution' | 'additive'
    itemCode?: string | null
    additiveSourceMenuId?: number | null
    quantity?: number
    optionStepValues?: Record<string, string> | null
    sellHall?: boolean
    sellDelivery?: boolean
    sellPackaging?: boolean
    descriptionDefault?: string
    descriptionDelivery?: string | null
    descriptionTable?: string | null
  },
  opts?: { requireOnline?: boolean }
) : Promise<{ success: boolean; message?: string; optionCode?: string; remappedOptionCode?: boolean }> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }
  const res = opts?.requireOnline
    ? await apiFetch('/api/savePosMenuOption', init)
    : await apiFetchWithOffline('/api/savePosMenuOption', init)
  if (opts?.requireOnline) {
    const parsed = await parsePosMutationResponse(res)
    return { ...parsed, optionCode: undefined, remappedOptionCode: false }
  }
  return res.json() as Promise<{ success: boolean; message?: string; optionCode?: string; remappedOptionCode?: boolean }>
}

export async function savePosMenuOptionsBulk(
  params: {
    options: Array<{
      id?: string
      menuId: number
      optionCode?: string
      name: string
      priceModifier?: number
      priceModifierDelivery?: number | null
      priceModifierPackaging?: number | null
      sortOrder?: number
      optionType?: "substitution" | "additive"
      itemCode?: string | null
      additiveSourceMenuId?: number | null
      quantity?: number
      optionStepValues?: Record<string, string> | null
      sellHall?: boolean
      sellDelivery?: boolean
      sellPackaging?: boolean
    }>
    storeCode?: string
  },
  opts?: { requireOnline?: boolean }
) : Promise<{
  success: boolean
  message?: string
  remappedCount?: number
  results?: { id?: string; success: boolean; message?: string; optionCode?: string; remapped?: boolean }[]
}> {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }
  const res = opts?.requireOnline
    ? await apiFetch("/api/savePosMenuOptionsBulk", init)
    : await apiFetchWithOffline("/api/savePosMenuOptionsBulk", init)
  if (opts?.requireOnline) {
    const parsed = await parsePosMutationResponse(res)
    return { ...parsed, remappedCount: 0, results: [] }
  }
  return res.json() as Promise<{
    success: boolean
    message?: string
    remappedCount?: number
    results?: { id?: string; success: boolean; message?: string; optionCode?: string; remapped?: boolean }[]
  }>
}

export interface PosMenuIngredient {
  id: string
  menuId: string
  itemCode: string
  ingredientType?: 'food' | 'packaging'
  quantity: number
  lossRate?: number
  optionId?: string | null
  /** 원가 계산기 입력 단위 (g::1, kg::1000 등) */
  quantityUnitKey?: string
}

export async function getPosMenuIngredients(
  params: { menuId: string; optionId?: string },
  opts?: { requireOnline?: boolean }
) {
  const q = new URLSearchParams()
  q.set('menuId', params.menuId)
  if (params.optionId !== undefined) q.set('optionId', params.optionId)
  const url = '/api/getPosMenuIngredients?' + q.toString()
  const res = opts?.requireOnline ? await apiFetch(url) : await apiFetchWithOffline(url)
  if (opts?.requireOnline && !res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(err.message || `재료 조회 실패 (${res.status})`)
  }
  return jsonAsArray<PosMenuIngredient>(await res.json())
}

export async function savePosMenuIngredient(
  params: {
    id?: string
    menuId: number
    itemCode: string
    quantity?: number
    lossRate?: number
    optionId?: number | null
    ingredientType?: 'food' | 'packaging'
  },
  opts?: { requireOnline?: boolean }
) {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }
  const res = opts?.requireOnline
    ? await apiFetch('/api/savePosMenuIngredient', init)
    : await apiFetchWithOffline('/api/savePosMenuIngredient', init)
  if (opts?.requireOnline) {
    return parsePosMutationResponse(res)
  }
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function replacePosMenuIngredients(
  params: {
    menuId: number
    optionId?: number | null
    items: Array<{
      itemCode: string
      quantity: number
      lossRate?: number
      ingredientType?: 'food' | 'packaging'
      quantityUnitKey?: string | null
    }>
  },
  opts?: { requireOnline?: boolean }
) {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }
  const res = opts?.requireOnline
    ? await apiFetch('/api/replacePosMenuIngredients', init)
    : await apiFetchWithOffline('/api/replacePosMenuIngredients', init)
  if (opts?.requireOnline) {
    return parsePosMutationResponse(res)
  }
  return res.json() as Promise<{ success: boolean; message?: string; deleted?: number; inserted?: number }>
}

export interface MenuCostBreakdown {
  itemCode: string
  itemName: string
  quantity: number
  lossRate: number
  costPerUnit: number
  costTotal: number
}

export async function getMenuCost(params: { menuId: string; optionId?: string }) {
  const q = new URLSearchParams()
  q.set('menuId', params.menuId)
  if (params.optionId !== undefined) q.set('optionId', params.optionId)
  const res = await apiFetch('/api/getMenuCost?' + q.toString())
  const raw: unknown = await res.json()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { cost: 0, breakdown: [] }
  }
  const o = raw as Record<string, unknown>
  return {
    cost: Number(o.cost) || 0,
    breakdown: jsonAsArray<MenuCostBreakdown>(o.breakdown),
  }
}

export interface PosMenuCostAnalysisRow {
  menuId: string
  menuCode: string
  menuName: string
  category: string
  categoryMain?: string
  priceHall: number
  priceDelivery: number | null
  /** 가격이 VAT 포함인지 (false면 이미 VAT 제외) */
  vatIncluded?: boolean
  optionId: string | null
  optionCode?: string | null
  optionName: string | null
  optionType?: 'substitution' | 'additive' | null
  costHall: number
  costDelivery: number
  cookingTimeMin?: number | null
  /** 배달앱 수수료(%) — null이면 UI 기본 20% */
  deliveryAppFeePercent?: number | null
  breakdown: {
    itemCode: string
    itemName: string
    unit: string
    costPerUnit: number
    quantity: number
    lossRate: number
    costTotal: number
    source: 'hq' | 'store'
    ingredientType: 'food' | 'packaging'
    quantityUnitKey?: string
  }[]
}

export async function getPosMenuCostAnalysis(params?: { summary?: boolean }): Promise<PosMenuCostAnalysisRow[]> {
  const q = params?.summary ? '?summary=1' : ''
  const res = await apiFetch(`/api/getPosMenuCostAnalysis${q}`)
  const text = await res.text().catch(() => '')
  const headerRows = res.headers.get('X-CM-Pos-Cost-Analysis-Rows')
  const headerErr = res.headers.get('X-CM-Pos-Cost-Analysis-Error')
  const serverCount = headerRows != null && headerRows !== '' ? Number(headerRows) : NaN
  let raw: unknown = null
  try {
    raw = text ? JSON.parse(text) : null
  } catch {
    raw = null
  }
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      /* ignore */
    }
  }
  if (!res.ok) return []
  let data: unknown = raw
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    if (Array.isArray(o.rows)) data = o.rows
    else if (Array.isArray(o.data)) data = o.data
    else if (Array.isArray(o.items)) data = o.items
  }
  const arr = Array.isArray(data) ? (data as PosMenuCostAnalysisRow[]) : []
  if (process.env.NODE_ENV === 'development') {
    if (!Array.isArray(data)) {
      console.warn(
        '[getPosMenuCostAnalysis] 응답이 배열이 아닙니다. Network → Response 본문 확인.',
        typeof raw,
        raw && typeof raw === 'object' ? Object.keys(raw as object).slice(0, 8) : raw
      )
    }
    if (!Number.isNaN(serverCount) && arr.length !== serverCount) {
      console.error(
        '[getPosMenuCostAnalysis] 서버 헤더 X-CM-Pos-Cost-Analysis-Rows=' +
          serverCount +
          ' 인데, 파싱된 배열 길이=' +
          arr.length +
          '. 본문 잘림·JSON 오류 가능. response 본문 앞 200자:',
        text.slice(0, 200)
      )
    }
    if (headerErr === '1' && arr.length === 0) {
      console.error(
        '[getPosMenuCostAnalysis] 서버에서 예외 처리됨(X-CM-Pos-Cost-Analysis-Error=1). API 라우트 터미널 로그(getPosMenuCostAnalysis:) 확인.'
      )
    }
  }
  return arr
}

export interface PosCostAnalysisAuditRow {
  id: number
  actionType: string
  changedAt: string
  actorName: string | null
  actorRole: string | null
  actorStore: string | null
  actorEmployeeCode: string | null
  menuId: number | null
  menuCode: string | null
  menuName: string | null
  optionId: number | null
  optionName: string | null
  optionCode: string | null
  ingredientId: number | null
  itemCode: string | null
  itemName: string | null
  quantity: number
  lossRate: number
  ingredientType: string | null
}

export async function getPosCostAnalysisAudit(params?: {
  limit?: number
  startDate?: string
  endDate?: string
}): Promise<PosCostAnalysisAuditRow[]> {
  const qs = new URLSearchParams()
  if (params?.limit != null) qs.set('limit', String(params.limit))
  if (params?.startDate) qs.set('startDate', params.startDate)
  if (params?.endDate) qs.set('endDate', params.endDate)
  const q = qs.toString() ? `?${qs.toString()}` : ''
  const res = await apiFetch(`/api/getPosCostAnalysisAudit${q}`)
  const data = await res.json().catch(() => [])
  if (!res.ok) return []
  return Array.isArray(data) ? (data as PosCostAnalysisAuditRow[]) : []
}

// ─── 배합(합성품) 원가 — API 테이블명 sauces 유지 ───
export interface SauceRow {
  id?: number
  code: string
  name: string
  unit: string
  totalQuantity: number
  totalCost: number
  overheadPercent: number
  totalWithOverhead: number
  costPerUnit: number
  ingredients: { id?: number; itemCode: string; itemName: string; quantity: number; lossRate: number; costPerUnit: number; costTotal: number; unit: string }[]
  purchaseSource: 'hq' | 'store'
  /** 판매용: 계산기에서 배합 선택·품목 등록 프리필·연결 품목 필수. 매장용: 연결 없음·매장용 전용 추가 경로 */
  usageKind?: 'for_sale' | 'store_use'
  /** usageKind=for_sale 일 때 품목관리 items.code (필수). 매장용은 보통 비움 */
  linkedItemCode?: string
}

let warnedSaucesAnonEmpty = false

/** 읽기 전용: apiFetch 사용(인증·응답 형식 일관). 배열이 아닌 200 응답은 조용히 빈 목록으로 두지 않고 오류 처리 */
export async function getSauces() {
  const res = await apiFetch('/api/sauces')
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error((data as { message?: string })?.message || `배합 목록 조회 실패 (${res.status})`)
  }
  if (!Array.isArray(data)) {
    const msg =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message?: unknown }).message)
        : `배합 API 응답이 배열이 아닙니다 (${typeof data})`
    throw new Error(msg)
  }
  if (
    data.length === 0 &&
    res.headers.get('X-CM-Supabase-Key-Mode') === 'anon' &&
    !warnedSaucesAnonEmpty
  ) {
    warnedSaucesAnonEmpty = true
    console.warn(
      '[getSauces] 배합 0건이고 서버가 anon 키 모드입니다. DB에 데이터가 있어도 RLS 때문에 안 보일 수 있습니다. Vercel/로컬에 SUPABASE_SERVICE_ROLE_KEY를 설정하거나 vercel-app/sql/sauces_rls_anon_read_optional.sql 을 참고하세요.'
    )
  }
  return data as SauceRow[]
}

export async function saveSauce(params: {
  id?: number
  code: string
  name: string
  unit?: string
  overheadPercent?: number
  totalQuantity?: number
  ingredients: { itemCode: string; quantity: number; lossRate?: number }[]
  usageKind?: 'for_sale' | 'store_use'
  linkedItemCode?: string
}) {
  const res = await apiFetchWithOffline('/api/sauces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => ({})) as { success?: boolean; id?: number; message?: string }
  if (!res.ok) {
    throw new Error(data?.message || `저장 실패 (${res.status})`)
  }
  return data
}

export async function deleteSauce(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/sauces/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => ({})) as { success?: boolean; message?: string }
  if (!res.ok) {
    throw new Error(data?.message || `삭제 실패 (${res.status})`)
  }
  return data
}

export async function recalculateSauces() {
  const res = await apiFetchWithOffline('/api/sauces/recalculate', { method: 'POST' })
  const data = await res.json().catch(() => ({})) as { success?: boolean; count?: number; message?: string }
  if (!res.ok) {
    throw new Error(data?.message || `재계산 실패 (${res.status})`)
  }
  return data
}

export async function getNotificationSettings() {
  const res = await apiFetchWithOffline('/api/notificationSettings')
  return res.json() as Promise<{ pushNoticeEnabled: boolean; pushOrderApprovalEnabled: boolean }>
}

export async function updateNotificationSettings(params: {
  pushNoticeEnabled?: boolean
  pushOrderApprovalEnabled?: boolean
}) {
  const res = await apiFetchWithOffline('/api/notificationSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean }>
}

/** 급여 — 위험수당·평가등급 규칙 (system_settings) */
export async function getPayrollHazGradeRules() {
  const res = await apiFetchWithOffline('/api/payrollHazGradeRules')
  const data = (await res.json().catch(() => ({}))) as {
    requireEvalGrade?: boolean
    minEvalGrade?: string
    gradeOptions?: string[]
    canEdit?: boolean
    message?: string
  }
  if (!res.ok) {
    throw new Error(data?.message || `급여 규칙 조회 실패 (${res.status})`)
  }
  return {
    requireEvalGrade: data.requireEvalGrade !== false,
    minEvalGrade: String(data.minEvalGrade || 'B').toUpperCase(),
    gradeOptions: Array.isArray(data.gradeOptions) ? data.gradeOptions : ['S', 'A', 'B', 'C', 'F'],
    canEdit: !!data.canEdit,
  }
}

export async function savePayrollHazGradeRules(params: { requireEvalGrade: boolean; minEvalGrade: string }) {
  const res = await apiFetchWithOffline('/api/payrollHazGradeRules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    requireEvalGrade?: boolean
    minEvalGrade?: string
  }>
}

export async function getCostSettings() {
  const res = await apiFetchWithOffline('/api/costSettings')
  const data = await res.json().catch(() => ({})) as { defaultOverheadPercent?: number; globalOverheadPercent?: number; message?: string }
  if (!res.ok) {
    throw new Error(data?.message || `OH 설정 조회 실패 (${res.status})`)
  }
  return {
    defaultOverheadPercent: data?.defaultOverheadPercent ?? 5,
    globalOverheadPercent: data?.globalOverheadPercent ?? 5,
  }
}

export async function updateCostSettings(params: { globalOverheadPercent?: number; defaultOverheadPercent?: number }) {
  const res = await apiFetchWithOffline('/api/costSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => ({})) as { success?: boolean; message?: string }
  if (!res.ok) {
    throw new Error(data?.message || `OH 설정 저장 실패 (${res.status})`)
  }
  return data
}

export async function deletePosMenuIngredient(
  params: { id: string },
  opts?: { requireOnline?: boolean }
) {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }
  const res = opts?.requireOnline
    ? await apiFetch('/api/deletePosMenuIngredient', init)
    : await apiFetchWithOffline('/api/deletePosMenuIngredient', init)
  if (opts?.requireOnline) {
    return parsePosMutationResponse(res)
  }
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deletePosMenuOption(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deletePosMenuOption', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function savePosMenu(
  params: {
    id?: string
    /** 신규 등록 시 필수. 수정(id 있음) 시 생략 가능(부분 갱신) */
    code?: string
    name?: string
    category?: string
    categoryMain?: string
    price?: number
    priceDelivery?: number | null
    imageUrl?: string
    vatIncluded?: boolean
    isActive?: boolean
    sortOrder?: number
    optionSelectionGroups?: string[]
    optionSelectionConfig?: PosOptionSelectionGroupConfig[]
    kitchenPrinter?: number | null
    cookingTimeMin?: number | null
    deliveryAppFeePercent?: number | null
    isBanban?: boolean
    banbanFlavorMenuIds?: string[]
    descriptionDefault?: string
    descriptionDelivery?: string | null
    descriptionTable?: string | null
    storeCodes?: string[]
    sellHall?: boolean
    sellDelivery?: boolean
    sellPackaging?: boolean
    /**
     * true 이면 image 컬럼만 갱신한다(프로모 연동 메뉴의 사진 단독 변경 등).
     * 서버는 다른 필드 비교를 건너뛴다.
     */
    imageOnly?: boolean
    /** true 이면 설명(description_*)만 갱신한다(프로모 연동 세트의 Grab 설명 등). */
    descriptionOnly?: boolean
  },
  opts?: { requireOnline?: boolean }
) {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }
  const res = opts?.requireOnline
    ? await apiFetch('/api/savePosMenu', init)
    : await apiFetchWithOffline('/api/savePosMenu', init)
  if (opts?.requireOnline) {
    return parsePosMutationResponse(res)
  }
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function syncPosMenuImageCrossChannels(params: {
  storeCode: string
  menuId?: string | number
  menuCode?: string
  imageUrl: string
  source?: 'menu-screen' | 'delivery-ops' | 'unknown'
}) {
  const res = await apiFetchWithOffline('/api/syncPosMenuImageCrossChannels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    normalizedMenuCode?: string
    touchedMenuCount?: number
    touchedDeliveryImageCount?: number
  }>
}

export type ImportPosMenusResult = {
  success: boolean
  message?: string
  inserted?: number
  updated?: number
  skipped?: number
  errors?: string[]
  errorsTruncated?: boolean
}

/** POS 메뉴 일괄 업로드 (코드 기준 갱신·신규). 관리자 전용 — 온라인만. */
export async function importPosMenus(menus: PosMenuUpsertApiBody[]): Promise<ImportPosMenusResult> {
  const res = await apiFetch('/api/importPosMenus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menus }),
  })
  const data = (await res.json().catch(() => ({}))) as ImportPosMenusResult
  if (!res.ok) {
    throw new Error(data.message || `요청 실패 (${res.status})`)
  }
  return data
}

/** getPosMenus IDB 캐시를 서버 목록으로 덮어쓴 뒤 이벤트 알림 (일괄 저장 직후 목록 즉시 반영) */
export async function refreshPosMenusCatalogCache(params?: { storeCode?: string | null }): Promise<void> {
  try {
    const storeCode = String(params?.storeCode || '').trim()
    const q = new URLSearchParams()
    if (storeCode) q.set('storeCode', storeCode)
    const url = '/api/getPosMenus' + (q.toString() ? `?${q.toString()}` : '')
    const cacheKey = posMenusCatalogCacheKey(storeCode || null)
    const res = await apiFetch(url)
    if (!res.ok) return
    const list = (await res.json()) as unknown
    if (!Array.isArray(list)) return
    await setErpCache(cacheKey, list)
    notifyPosCatalogUpdated(cacheKey, list, { storeCode: storeCode || null })
  } catch {
    /* ignore */
  }
}

/** uploadPosMenuImage: 비 JSON 응답(413 HTML 등) 시 message로 구분 */
export const POS_MENU_UPLOAD_TOO_LARGE = '__POS_MENU_UPLOAD_TOO_LARGE__'

export async function uploadPosMenuImage(params: { file: File; menuId?: string | number }) {
  const file = params.file
  const menuIdRaw = params.menuId
  const pres = await apiFetchWithOffline('/api/uploadPosMenuImage/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      fileSize: file.size,
      ...(menuIdRaw != null && String(menuIdRaw).trim() !== ''
        ? { menuId: String(menuIdRaw).trim() }
        : {}),
    }),
  })
  const rawPres = await pres.text()
  let pjson: { success?: boolean; message?: string; signedUrl?: string; publicUrl?: string }
  try {
    pjson = JSON.parse(rawPres) as typeof pjson
  } catch {
    const tooLarge =
      pres.status === 413 ||
      /413|payload too large|entity too large|request entity too large/i.test(rawPres)
    return {
      success: false,
      message: tooLarge ? POS_MENU_UPLOAD_TOO_LARGE : undefined,
      url: undefined,
    }
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return {
      success: false,
      message: pjson.message,
      url: undefined,
    }
  }
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, file, { upsert: false })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    return {
      success: false,
      message: t || `Storage 업로드 실패 (${putRes.status})`,
      url: undefined,
    }
  }
  return {
    success: true,
    message: '업로드되었습니다.',
    url: pjson.publicUrl,
  }
}

/** 고객화면 평상시 배경 이미지·동영상 (pos-menu-images 버킷, customer-display/ 경로) */
export async function uploadCustomerDisplayMedia(params: { storeCode: string; file: File }) {
  const file = params.file
  const storeCode = String(params.storeCode || '').trim()
  const pres = await apiFetchWithOffline('/api/uploadCustomerDisplayMedia/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      fileSize: file.size,
    }),
  })
  const rawPres = await pres.text()
  let pjson: { success?: boolean; message?: string; signedUrl?: string; publicUrl?: string }
  try {
    pjson = JSON.parse(rawPres) as typeof pjson
  } catch {
    const tooLarge =
      pres.status === 413 ||
      /413|payload too large|entity too large|request entity too large/i.test(rawPres)
    return {
      success: false,
      message: tooLarge ? POS_MENU_UPLOAD_TOO_LARGE : undefined,
      url: undefined,
    }
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return {
      success: false,
      message: pjson.message,
      url: undefined,
    }
  }
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, file, { upsert: false })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    return {
      success: false,
      message: t || `Storage 업로드 실패 (${putRes.status})`,
      url: undefined,
    }
  }
  return {
    success: true,
    message: '업로드되었습니다.',
    url: pjson.publicUrl,
  }
}

export async function deletePosMenu(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deletePosMenu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updatePosMenuSoldOut(params: { id: string; soldOut: boolean }) {
  const res = await apiFetchWithOffline('/api/updatePosMenuSoldOut', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── POS 프로모션(세트) ───
export interface PosPromo {
  id: string
  code: string
  /** 캠페인 허브 고유번호(campaign_no) — API가 marketing_campaign_id로 조회해 붙임 */
  marketingCampaignNo?: string | null
  name: string
  category: string
  categoryMain?: string
  price: number
  marketingCampaignId?: string | null
  priceDelivery?: number | null
  vatIncluded: boolean
  isActive: boolean
  sortOrder: number
  channelHall?: boolean
  channelTakeout?: boolean
  channelDelivery?: boolean
  deliveryAppCodes?: string[] | null
  discountPercent?: number | null
  validFrom?: string | null
  validTo?: string | null
  /** Grab 캠페인 시작 시각(방콕 HH:mm) */
  grabCampaignStartTimeBkk?: string | null
  /** Grab 캠페인 종료 시각(방콕 HH:mm) */
  grabCampaignEndTimeBkk?: string | null
  marketingActualCost?: number
  expenseAccrualId?: string | null
  /** 세트 구성 Step 1 가격 기준 (DB 컬럼 compose_pricing_basis, 없으면 hall) */
  composePricingBasis?: 'hall' | 'delivery'
}

export interface PosPromoItem {
  id: string
  promoId: string
  menuId: string
  optionId: string | null
  optionCode?: string | null
  quantity: number
  sortOrder: number
  /** 같은 값끼리 한 선택 그룹(예: drink) */
  choiceGroup?: string | null
  /** 그룹에서 선택해야 하는 개수(예: 1 = 3개 중 1개) */
  choicePickCount?: number | null
}

/** 목록 API: 비 JSON·HTML 오류 페이지·빈 본문 시 빈 배열 (통합 캘린더 등에서 Promise.all 전체 실패 방지) */
async function apiJsonArrayResponse<T>(res: Response): Promise<T[]> {
  if (!res.ok) return []
  try {
    const data = await res.json()
    return Array.isArray(data) ? (data as T[]) : []
  } catch {
    return []
  }
}

export async function getPosPromos(params?: { campaignId?: string; standaloneOnly?: boolean }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  if (params?.standaloneOnly) q.set('standaloneOnly', 'true')
  const res = await apiFetchWithOffline('/api/getPosPromos' + (q.toString() ? '?' + q.toString() : ''))
  return apiJsonArrayResponse<PosPromo>(res)
}

export async function getPosPromoSchemaStatus() {
  const res = await apiFetchWithOffline('/api/posPromoSchemaStatus')
  return res.json() as Promise<{
    posPromosExtended: boolean
    posMenusPromoId: boolean
    ok: boolean
  }>
}

export async function getNextPosPromoCode(params: { campaignId: string }) {
  const q = new URLSearchParams()
  q.set('campaignId', params.campaignId.trim())
  const res = await apiFetchWithOffline('/api/getNextPosPromoCode?' + q.toString())
  return res.json() as Promise<{ code: string | null; message?: string }>
}

export interface PosPromoWithItems extends PosPromo {
  items: {
    menuId: string
    optionId: string | null
    optionCode?: string | null
    quantity: number
    choiceGroup?: string | null
    choicePickCount?: number | null
    /** 서버에서 pos_menus 조인으로 채움 — 주방 슬립이 #ID 대신 이름을 찍도록 */
    menuName?: string
    menuCode?: string
  }[]
}

export async function getPosPromosWithItems(params?: { campaignId?: string; includeInactive?: boolean }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set("campaignId", params.campaignId)
  if (params?.includeInactive) q.set("includeInactive", "true")
  const qs = q.toString()
  const url = '/api/getPosPromosWithItems' + (qs ? `?${qs}` : '')
  const cacheKey = `erp:posCatalog:promos:${params?.campaignId?.trim() || ''}:${params?.includeInactive ? '1' : '0'}`
  return fetchPosCatalogCached<PosPromoWithItems[]>(cacheKey, url, [])
}

export async function getPosPromoItems(params: { promoId: string }) {
  const q = new URLSearchParams()
  q.set('promoId', params.promoId)
  const res = await apiFetchWithOffline('/api/getPosPromoItems?' + q.toString())
  return jsonAsArray<PosPromoItem>(await res.json())
}

export async function savePosPromo(params: {
  id?: string
  /** 비우면 서버가 캠페인 고유번호 기준으로 자동 부여 ({번호}-S01 …) */
  code?: string
  name: string
  category?: string
  categoryMain?: string
  price?: number
  priceDelivery?: number | null
  vatIncluded?: boolean
  isActive?: boolean
  sortOrder?: number
  marketingCampaignId?: string | null
  channelHall?: boolean
  channelTakeout?: boolean
  channelDelivery?: boolean
  deliveryAppCodes?: string[] | null
  discountPercent?: number | null
  validFrom?: string | null
  validTo?: string | null
  grabCampaignStartTimeBkk?: string | null
  grabCampaignEndTimeBkk?: string | null
  marketingActualCost?: number | null
  /** 메뉴 관리 세트: 캠페인 없이 저장 (서버가 SET-1 … 코드 부여) */
  standaloneSetMenu?: boolean
  vendorCode?: string
  userRole?: string
  userName?: string
  composePricingBasis?: 'hall' | 'delivery'
}) {
  const res = await apiFetchWithOffline('/api/savePosPromo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    id?: string
    expenseSyncMessage?: string
  }>
}

export async function savePosPromoItem(params: {
  id?: string
  promoId: number
  menuId: number
  optionId?: number | null
  /** 저장 시점 option_code 스냅샷 — option_id 재매핑·복구용 */
  optionCode?: string | null
  quantity?: number
  sortOrder?: number
  choiceGroup?: string | null
  choicePickCount?: number | null
}) {
  const res = await apiFetchWithOffline('/api/savePosPromoItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deletePosPromoItem(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deletePosPromoItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deletePosPromo(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deletePosPromo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 마케팅 캠페인 ───
export interface MarketingCampaign {
  id: string
  campaignNo?: string
  topic: string
  format: string
  campaignType?: string
  status: string
  startDate?: string | null
  endDate?: string | null
  /** 캠페인 디자인 작업 일정 */
  designStartDate?: string | null
  designEndDate?: string | null
  designNote?: string
  /** 차수별 기간(1차·2차·…) — DB phase_periods */
  phasePeriods?: MarketingCampaignPhasePeriod[]
  branches: string[]
  kpiTarget: number
  kpiUnit: string
  budgetTotal: number
  /** 목록 API에서 함께 내려옴 — 협업·할인 요약 표시용 */
  discountType?: string
  discountValue?: number
  discountPricePromotion?: string
  discountTargetAudience?: string
  /** 캠페인 편집에서 「협업 관리」목록 포함 여부 */
  collabManagement?: boolean
  /** 목록 API에 포함(협업 관리 매장별 조회 등) */
  collabDetail?: MarketingCollabDetail
}

export type { MarketingCollabDetail } from './marketing-collab-detail'

export interface MarketingCampaignDetail extends MarketingCampaign {
  detail: string
  discountType: string
  discountValue: number
  discountPricePromotion: string
  discountTargetAudience: string
  /** 협업 관리 화면 전용 세부 JSON (normalize된 형태) */
  collabDetail?: MarketingCollabDetail
  costAdsOnline: number
  costAdsOffline: number
  costProduction: number
  costFood: number
  costInfluencer: number
  costOther: number
  costOtherLabel: string
  campaignPerformance: string
  conclusion: string
  createdAt?: string
  updatedAt?: string
}

export async function getMarketingCampaigns() {
  const res = await apiFetchWithOffline('/api/marketingCampaigns', { cache: 'no-store' })
  return apiJsonArrayResponse<MarketingCampaign>(res)
}

export async function getMarketingCampaign(id: string) {
  const q = new URLSearchParams({ id })
  const res = await apiFetchWithOffline('/api/marketingCampaigns?' + q.toString())
  return res.json() as Promise<MarketingCampaignDetail | null>
}

export async function saveMarketingCampaignCollabDetail(params: {
  campaignId: string
  collabDetail: Record<string, unknown>
}) {
  const res = await apiFetchWithOffline('/api/marketingCampaignCollabDetail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function toggleMarketingCampaignCollabManagement(params: {
  campaignId: string
  enabled: boolean
}) {
  const res = await apiFetchWithOffline('/api/marketingCampaignCollabManagementToggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: params.campaignId.trim(),
      enabled: params.enabled === true,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getPosCollabCampaigns(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode.trim())
  const res = await apiFetchWithOffline('/api/getPosCollabCampaigns?' + q.toString())
  const data = (await res.json()) as {
    campaigns?: {
      id: string
      topic: string
      campaignNo?: string
      collabDetail: MarketingCollabDetail
    }[]
  }
  return Array.isArray(data.campaigns) ? data.campaigns : []
}

export async function getNextCampaignNumber(): Promise<string | null> {
  const res = await apiFetchWithOffline('/api/marketingCampaigns?nextNumber=1')
  const data = (await res.json()) as { campaignNo?: string }
  return data?.campaignNo ?? null
}

export async function saveMarketingCampaign(params: {
  id?: string
  campaignNo?: string
  topic: string
  format?: string
  campaignType?: string
  status?: string
  detail?: string
  startDate?: string | null
  endDate?: string | null
  designStartDate?: string | null
  designEndDate?: string | null
  designNote?: string
  branches?: string[]
  discountType?: string
  discountValue?: number
  discountPricePromotion?: string
  discountTargetAudience?: string
  costAdsOnline?: number
  costAdsOffline?: number
  costProduction?: number
  costFood?: number
  costInfluencer?: number
  costOther?: number
  costOtherLabel?: string
  budgetTotal?: number
  kpiTarget?: number
  kpiUnit?: string
  campaignPerformance?: string
  conclusion?: string
  collabManagement?: boolean
  phasePeriods?: MarketingCampaignPhasePeriod[]
  userRole?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/marketingCampaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string }>
}

export async function saveMarketingCampaignDesignDates(params: {
  campaignId: string
  designStartDate?: string | null
  designEndDate?: string | null
}) {
  const res = await apiFetchWithOffline('/api/marketingCampaignDesignDates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: params.campaignId.trim(),
      designStartDate: params.designStartDate ?? null,
      designEndDate: params.designEndDate ?? null,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteMarketingCampaign(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteMarketingCampaign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** LINE OA Segment API — 세그먼트 목록 (서버 프록시, X-API-KEY는 env) */
export async function getLineOaSegments(params?: {
  page?: number
  size?: number
  sort?: string
  search?: string
}) {
  const q = new URLSearchParams()
  if (params?.page != null) q.set('page', String(params.page))
  if (params?.size != null) q.set('size', String(params.size))
  if (params?.sort) q.set('sort', params.sort)
  if (params?.search) q.set('search', params.search)
  const suffix = q.toString()
  const res = await apiFetch('/api/lineOa/segments' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<{
    success: boolean
    message?: string
    code?: string
    page?: number
    size?: number
    sort?: string
    data?: unknown
    total?: number
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Segment API — 세그먼트 상세 (서버 프록시, X-API-KEY는 env) */
export async function getLineOaSegmentById(segmentId: number | string) {
  const normalized = String(segmentId ?? '').trim()
  const res = await apiFetch(`/api/lineOa/segments/${encodeURIComponent(normalized)}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    segmentId?: number
    data?: unknown
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Segment API — 세그먼트로 OA Audience 생성 */
export async function createLineOaAudienceFromSegment(segmentId: number | string) {
  const normalized = String(segmentId ?? '').trim()
  const res = await apiFetch(
    `/api/lineOa/segments/${encodeURIComponent(normalized)}/create-oa-audience`,
    { method: 'POST' }
  )
  return res.json() as Promise<{
    success: boolean
    message?: string
    segmentId?: string
    id?: string
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Segment API — OA Audience 생성 상태/오디언스명 조회 */
export async function getLineOaAudienceCreateResult(segmentId: number | string, id: number | string) {
  const normalizedSegmentId = String(segmentId ?? '').trim()
  const normalizedId = String(id ?? '').trim()
  const res = await apiFetch(
    `/api/lineOa/segments/${encodeURIComponent(normalizedSegmentId)}/create-oa-audience/${encodeURIComponent(
      normalizedId
    )}`
  )
  return res.json() as Promise<{
    success: boolean
    message?: string
    segmentId?: string
    id?: string
    data?: unknown
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Segment API — 세그먼트 사용자 목록 CSV 생성 요청 (202 + id, 이후 상태/다운로드는 별도 API) */
export async function requestLineOaSegmentUserListCsv(segmentId: number | string) {
  const normalized = String(segmentId ?? '').trim()
  const res = await apiFetch(`/api/lineOa/segments/${encodeURIComponent(normalized)}/user-list-csv`, {
    method: 'POST',
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    segmentId?: string
    id?: string
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Segment API — CSV 보내기 상태·다운로드 URL (결과 3일, URL 10분 유효 — LINE 문서) */
export async function getLineOaSegmentUserListExportStatus(segmentId: number | string, id: number | string) {
  const normalizedSegmentId = String(segmentId ?? '').trim()
  const normalizedId = String(id ?? '').trim()
  const res = await apiFetch(
    `/api/lineOa/segments/${encodeURIComponent(normalizedSegmentId)}/user-list-csv/${encodeURIComponent(
      normalizedId
    )}`
  )
  return res.json() as Promise<{
    success: boolean
    message?: string
    segmentId?: string
    id?: string
    data?: unknown
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Group API (Deprecated) — 그룹 목록 */
export async function getLineOaGroups(params?: {
  groupIds?: string
  page?: number
  size?: number
  sort?: string
  search?: string
}) {
  const q = new URLSearchParams()
  if (params?.groupIds) q.set('groupIds', params.groupIds)
  if (params?.page != null) q.set('page', String(params.page))
  if (params?.size != null) q.set('size', String(params.size))
  if (params?.sort) q.set('sort', params.sort)
  if (params?.search) q.set('search', params.search)
  const suffix = q.toString()
  const res = await apiFetch('/api/lineOa/groups' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<{
    success: boolean
    message?: string
    code?: string
    page?: number
    size?: number
    sort?: string
    data?: unknown
    total?: number
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Group API — 그룹 생성 */
export async function createLineOaGroup(params: { name: string; retention?: 'P90D' | 'P180D' | 'P365D' }) {
  const res = await apiFetch('/api/lineOa/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; data?: unknown; raw?: unknown; status?: number; body?: unknown }>
}

/** LINE OA Group API — 그룹 단건 조회 */
export async function getLineOaGroupById(id: string) {
  const res = await apiFetch(`/api/lineOa/groups/${encodeURIComponent(id.trim())}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    id?: string
    data?: unknown
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Group API — 그룹 수정 */
export async function patchLineOaGroup(
  id: string,
  params: { name?: string; retention?: 'P90D' | 'P180D' | 'P365D' }
) {
  const res = await apiFetch(`/api/lineOa/groups/${encodeURIComponent(id.trim())}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string; data?: unknown; raw?: unknown; status?: number; body?: unknown }>
}

/** LINE OA Group API — 그룹 삭제 (204 시 본문 없음) */
export async function deleteLineOaGroup(id: string) {
  const res = await apiFetch(`/api/lineOa/groups/${encodeURIComponent(id.trim())}`, { method: 'DELETE' })
  if (res.status === 204) return { success: true as const, status: 204 }
  return res.json() as Promise<{ success: boolean; message?: string; id?: string; raw?: unknown; status?: number; body?: unknown }>
}

/** LINE OA Group API — 사용자 연결(append/overwrite) */
export async function associateLineOaGroupUsers(
  groupId: string,
  params: { mode: 'append' | 'overwrite'; uids: string[] }
) {
  const res = await apiFetch(`/api/lineOa/groups/${encodeURIComponent(groupId.trim())}/users/associate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    groupId?: string
    requestId?: string
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Group API — 사용자 연결 해제 */
export async function dissociateLineOaGroupUsers(groupId: string, params: { uids: string[] }) {
  const res = await apiFetch(`/api/lineOa/groups/${encodeURIComponent(groupId.trim())}/users/dissociate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    groupId?: string
    requestId?: string
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Group API — associate/dissociate 작업 상태 */
export async function getLineOaGroupUserOperation(groupId: string, requestId: string) {
  const res = await apiFetch(
    `/api/lineOa/groups/${encodeURIComponent(groupId.trim())}/users/operations/${encodeURIComponent(
      requestId.trim()
    )}`
  )
  return res.json() as Promise<{
    success: boolean
    message?: string
    groupId?: string
    requestId?: string
    data?: unknown
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Group API V2 — 그룹 목록 (sort: friendCount 등) */
export async function getLineOaGroupV2List(params?: {
  groupIds?: string
  page?: number
  size?: number
  sort?: string
  search?: string
}) {
  const q = new URLSearchParams()
  if (params?.groupIds) q.set('groupIds', params.groupIds)
  if (params?.page != null) q.set('page', String(params.page))
  if (params?.size != null) q.set('size', String(params.size))
  if (params?.sort) q.set('sort', params.sort)
  if (params?.search) q.set('search', params.search)
  const suffix = q.toString()
  const res = await apiFetch('/api/lineOa/group-v2/groups' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<{
    success: boolean
    message?: string
    code?: string
    page?: number
    size?: number
    sort?: string
    data?: unknown
    total?: number
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

export async function createLineOaGroupV2(params: { name: string; retention?: 'P90D' | 'P180D' | 'P365D' }) {
  const res = await apiFetch('/api/lineOa/group-v2/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; data?: unknown; raw?: unknown; status?: number; body?: unknown }>
}

export async function getLineOaGroupV2ById(id: string) {
  const res = await apiFetch(`/api/lineOa/group-v2/groups/${encodeURIComponent(id.trim())}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    id?: string
    data?: unknown
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

export async function patchLineOaGroupV2(
  id: string,
  params: { name?: string; retention?: 'P90D' | 'P180D' | 'P365D' }
) {
  const res = await apiFetch(`/api/lineOa/group-v2/groups/${encodeURIComponent(id.trim())}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string; data?: unknown; raw?: unknown; status?: number; body?: unknown }>
}

export async function deleteLineOaGroupV2(id: string) {
  const res = await apiFetch(`/api/lineOa/group-v2/groups/${encodeURIComponent(id.trim())}`, { method: 'DELETE' })
  if (res.status === 204) return { success: true as const, status: 204 }
  return res.json() as Promise<{ success: boolean; message?: string; id?: string; raw?: unknown; status?: number; body?: unknown }>
}

/** Group V2 — 그룹 사용자 CSV 생성 요청 (202 + id) */
export async function requestLineOaGroupV2GroupedUsersCsv(groupId: string) {
  const res = await apiFetch(
    `/api/lineOa/group-v2/groups/${encodeURIComponent(groupId.trim())}/grouped-users`,
    { method: 'POST' }
  )
  return res.json() as Promise<{
    success: boolean
    message?: string
    groupId?: string
    id?: string
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** Group V2 — CSV 상태·다운로드 URL (결과 약 7일, URL 약 10분 — LINE 문서) */
export async function getLineOaGroupV2GroupedUsersResult(groupId: string, requestId: string) {
  const res = await apiFetch(
    `/api/lineOa/group-v2/groups/${encodeURIComponent(groupId.trim())}/grouped-users/${encodeURIComponent(
      requestId.trim()
    )}/result`
  )
  return res.json() as Promise<{
    success: boolean
    message?: string
    groupId?: string
    requestId?: string
    /** 성공 시 LINE export 상태 문자열, 실패 시 프록시의 HTTP 상태 숫자일 수 있음 */
    status?: string | number
    url?: string
    raw?: unknown
    body?: unknown
  }>
}

export async function getMarketingCampaignCosts(campaignId: string) {
  const q = new URLSearchParams({ campaignId })
  const res = await apiFetchWithOffline(`/api/marketingCampaignCosts?${q}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    campaignId?: string
    topic?: string
    startDate?: string
    endDate?: string
    bankCosts?: number
    pettyCosts?: number
    totalCosts?: number
    linkedCosts?: number
    heuristicCosts?: number
    attributionMode?: 'linked' | 'heuristic' | 'hybrid'
    attributionConfidence?: number
  }>
}

export async function getMarketingCampaignResults(params: { campaignId: string }) {
  const q = new URLSearchParams({ campaignId: params.campaignId })
  const res = await apiFetchWithOffline(`/api/marketingCampaignResults?${q}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    campaignId?: string
    startDate?: string | null
    endDate?: string | null
    dineInOrders?: number
    deliveryOrders?: number
    carryOutOrders?: number
    totalOrders?: number
    dineInSales?: number
    deliverySales?: number
    carryOutSales?: number
    totalSales?: number
    linkedOrders?: number
    fallbackOrders?: number
    attributionMode?: 'linked' | 'heuristic' | 'hybrid'
    attributionConfidence?: number
  }>
}

export async function importMarketingExcel(file: File, options?: { dryRun?: boolean }) {
  const form = new FormData()
  form.set('file', file)
  if (options?.dryRun) form.set('dryRun', '1')
  const res = await apiFetchWithOffline('/api/importMarketingExcel', {
    method: 'POST',
    body: form,
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    campaignsInserted?: number
    adsInserted?: number
    influencersInserted?: number
    timelineAdsInserted?: number
    unmappedAds?: number
    unmappedInfluencers?: number
    dryRun?: boolean
    preview?: {
      detectedSheets?: string[]
      campaignCandidates?: number
      adCandidates?: number
      influencerCandidates?: number
      timelineCandidates?: number
      mappedAds?: number
      mappedInfluencers?: number
      warnings?: string[]
    }
  }>
}

// ─── 마케팅 광고 (ROAS) ───
export interface MarketingAd {
  id: string
  campaignId: string | null
  /** marketing_campaigns.campaign_no */
  campaignNo?: string | null
  contentFormat: string
  contentPillar: string
  contentTopic: string
  /** 상세 메모 (marketing_ads.content_detail) */
  contentDetail?: string
  publishDate: string | null
  /** 집행·노출 종료일 (marketing_ads.period_end_date, 마이그레이션 전에는 null) */
  periodEndDate?: string | null
  platform: string
  postLink: string
  boostBudget: number
  actualSpent: number
  vendorCode?: string
  expenseAccrualId?: string | null
}

export async function getMarketingAds(params?: { campaignId?: string }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  const res = await apiFetchWithOffline('/api/marketingAds' + (q.toString() ? '?' + q.toString() : ''))
  return apiJsonArrayResponse<MarketingAd>(res)
}

export async function saveMarketingAd(params: {
  id?: string
  campaignId?: string | null
  contentFormat?: string
  contentPillar?: string
  contentTopic?: string
  contentDetail?: string
  publishDate?: string | null
  periodEndDate?: string | null
  platform: string
  postLink?: string
  boostBudget?: number
  actualSpent?: number
  vendorCode?: string
  userRole?: string
  userName?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/marketingAds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    id?: string
    expenseSyncMessage?: string
  }>
}

export async function deleteMarketingAd(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteMarketingAd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 마케팅 인플루언서 ───
/** 저장 시점 POS 메뉴 가격 스냅샷 */
export interface InfluencerProvidedMenuSnapshot {
  id: string
  code: string
  name: string
  price: number
  /** 제공 수량 */
  quantity: number
  /** 대분류(검색·표시용, POS categoryMain·category) */
  categoryMain?: string
}

export interface MarketingInfluencer {
  id: string
  campaignId: string | null
  campaignNo?: string | null
  /** SNS 계정·필명 등 ID 성격 */
  name: string
  /** 실명 등 (풀·연락용) */
  contactName?: string
  contactPhone?: string
  providedMenus?: InfluencerProvidedMenuSnapshot[]
  followers: string
  contentFormat: string
  contentTopic: string
  status: string
  branchReview: string
  hireType: string
  budget: number
  /** 실제 지출(지급예정 연동) */
  actualCost: number
  vendorCode?: string
  shootingDate: string | null
  publishDate: string | null
  platformLinks: Record<string, string>
  note: string
  expenseAccrualId?: string | null
}

export async function getMarketingInfluencers(params?: { campaignId?: string }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  const res = await apiFetchWithOffline('/api/marketingInfluencers' + (q.toString() ? '?' + q.toString() : ''))
  return apiJsonArrayResponse<MarketingInfluencer>(res)
}

export async function saveMarketingInfluencer(params: {
  id?: string
  campaignId?: string | null
  name: string
  contactName?: string
  contactPhone?: string
  providedMenus?: InfluencerProvidedMenuSnapshot[]
  followers?: string
  contentFormat?: string
  contentTopic?: string
  status?: string
  branchReview?: string
  hireType?: string
  budget?: number
  actualCost?: number
  shootingDate?: string | null
  publishDate?: string | null
  platformLinks?: Record<string, string>
  note?: string
  vendorCode?: string
  userRole?: string
  userName?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/marketingInfluencers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    id?: string
    expenseSyncMessage?: string
  }>
}

export async function deleteMarketingInfluencer(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteMarketingInfluencer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 마케팅 판촉물 ───
export interface MarketingMaterial {
  id: string
  campaignId: string | null
  campaignNo?: string | null
  type: string
  name: string
  quantity: number
  unitCost: number
  actualCost: number
  vendorCode?: string
  branches: string[]
  isHqWide: boolean
  displayStartDate: string | null
  displayEndDate: string | null
  placementSpots: string[]
  status: string
  note: string
  expenseAccrualId?: string | null
}

export interface MarketingMaterialDeployment {
  id: string
  materialId: string
  campaignId: string | null
  storeName: string
  placementSpot: string
  materialType: string | null
  installedOn: string | null
  removedOn: string | null
  note: string
  updatedAt: string | null
  isActive: boolean
}

export async function getMarketingMaterials(params?: { campaignId?: string }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  const res = await apiFetchWithOffline('/api/marketingMaterials' + (q.toString() ? '?' + q.toString() : ''))
  return apiJsonArrayResponse<MarketingMaterial>(res)
}

export async function saveMarketingMaterial(params: {
  id?: string
  campaignId: string
  type?: string
  name: string
  quantity?: number
  unitCost?: number
  actualCost?: number
  branches?: string[]
  isHqWide?: boolean
  displayStartDate?: string | null
  displayEndDate?: string | null
  placementSpots?: string[]
  status?: string
  note?: string
  vendorCode?: string
  userRole?: string
  userName?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/marketingMaterials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    id?: string
    expenseSyncMessage?: string
  }>
}

export async function getMarketingMaterialDeployments(params?: {
  campaignId?: string
  materialId?: string
  store?: string
  activeOnly?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  if (params?.materialId) q.set('materialId', params.materialId)
  if (params?.store) q.set('store', params.store)
  if (params?.activeOnly) q.set('activeOnly', '1')
  const res = await apiFetchWithOffline('/api/marketingMaterialDeployments' + (q.toString() ? '?' + q.toString() : ''))
  return apiJsonArrayResponse<MarketingMaterialDeployment>(res)
}

export async function saveMarketingMaterialDeployment(params: {
  id?: string
  materialId: string
  campaignId?: string | null
  storeName: string
  placementSpot: string
  materialType?: string | null
  installedOn: string
  removedOn?: string | null
  note?: string
  userRole?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/marketingMaterialDeployments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string }>
}

export async function deleteMarketingMaterialDeployment(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteMarketingMaterialDeployment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteMarketingMaterial(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteMarketingMaterial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface MarketingMaterialGift {
  id: string
  materialId: string
  campaignId: string | null
  storeName: string
  giftName: string
  allocatedQty: number
  distributedQty: number
  remainingQty: number
  ruleNote: string
  updatedAt: string | null
}

export async function getMarketingMaterialGifts(params?: { campaignId?: string; materialId?: string }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  if (params?.materialId) q.set('materialId', params.materialId)
  const res = await apiFetchWithOffline('/api/marketingMaterialGifts' + (q.toString() ? '?' + q.toString() : ''))
  return jsonAsArray<MarketingMaterialGift>(await res.json())
}

export async function saveMarketingMaterialGift(params: {
  id?: string
  materialId: string
  campaignId?: string | null
  storeName: string
  giftName: string
  allocatedQty?: number
  distributedQty?: number
  remainingQty?: number
  ruleNote?: string
  userRole?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/marketingMaterialGifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string }>
}

export async function deleteMarketingMaterialGift(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteMarketingMaterialGift', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getMarketingMaterialLookup(ids: string[]) {
  const uniq = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))].slice(0, 200)
  if (uniq.length === 0) return []
  const res = await apiFetchWithOffline(
    `/api/marketingMaterialLookup?ids=${encodeURIComponent(uniq.join(','))}`
  )
  return jsonAsArray<{ id: string; name: string; campaignId: string | null }>(await res.json())
}

export interface PosAppliedCoupon {
  code: string
  name?: string
  discountAmt: number
  quantity?: number
  couponId?: number
  priority?: number
}

export interface PosCoupon {
  id?: number
  code: string
  name?: string
  discountType: 'percent' | 'amount' | 'fixed' | 'bogo' | 'set_fixed' | 'item_fixed'
  discountValue: number
  startDate?: string | null
  endDate?: string | null
  validFrom?: string | null
  validTo?: string | null
  maxUses?: number | null
  usedCount?: number
  isActive?: boolean
  marketingCampaignId?: string | null
  minOrderAmt?: number
  maxPerOrder?: number
  redemptionMode?: 'reusable_code' | 'single_use_serial' | 'member_issue'
  allowQuantityEntry?: boolean
  stackMode?: 'fixed_only' | 'percent_only' | 'any'
  maxDiscountAmt?: number | null
  setQty?: number
  itemScope?: { menuIds?: string[]; categoryCodes?: string[] }
  priority?: number
  allowWithManualDiscount?: boolean
}

export async function getPosCoupons() {
  const res = await apiFetchWithOffline('/api/getPosCoupons')
  return jsonAsArray<PosCoupon>(await res.json())
}

export async function savePosCoupon(params: {
  id?: number
  code: string
  name?: string
  discountType?: 'percent' | 'amount' | 'fixed' | 'bogo' | 'set_fixed' | 'item_fixed'
  discountValue: number
  startDate?: string | null
  endDate?: string | null
  validFrom?: string | null
  validTo?: string | null
  maxUses?: number | null
  isActive?: boolean
  marketingCampaignId?: string | null
  minOrderAmt?: number
  maxPerOrder?: number
  redemptionMode?: 'reusable_code' | 'single_use_serial' | 'member_issue'
  allowQuantityEntry?: boolean
  stackMode?: 'fixed_only' | 'percent_only' | 'any'
  maxDiscountAmt?: number | null
  setQty?: number
  itemScope?: { menuIds?: string[]; categoryCodes?: string[] }
  priority?: number
  allowWithManualDiscount?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosCoupon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function validatePosCoupon(params: { code: string; subtotal: number }) {
  const q = new URLSearchParams()
  q.set('code', params.code.trim().toUpperCase())
  q.set('subtotal', String(Math.max(0, params.subtotal)))
  const res = await apiFetchWithOffline('/api/validatePosCoupon?' + q.toString())
  return res.json() as Promise<{
    valid: boolean
    message?: string
    couponName?: string
    discountAmt?: number
    discountReason?: string
    quantity?: number
    couponId?: number
  }>
}

export async function validatePosCoupons(params: {
  subtotal: number
  manualDiscountAmt?: number
  collabDiscountAmt?: number
  cartLines?: Array<{
    menuId?: string
    categoryCode?: string
    quantity: number
    lineSubtotal: number
  }>
  applied?: PosAppliedCoupon[]
  appliedCoupons?: PosAppliedCoupon[]
  candidate?: { code: string; quantity?: number; memberIssueId?: number }
  memberId?: number
}) {
  const res = await apiFetchWithOffline('/api/validatePosCoupons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    valid: boolean
    message?: string
    couponName?: string
    discountAmt?: number
    discountReason?: string
    quantity?: number
    couponId?: number
    appliedCoupons?: PosAppliedCoupon[]
    couponDiscountTotal?: number
    couponCode?: string
    couponDiscountAmt?: number
  }>
}

export async function deletePosCoupon(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deletePosCoupon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface PosTableItem {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  /** 층 (1~3) */
  floor?: number
  /** rect | square - 테이블 형태 */
  shape?: string
  /** 좌석 수 (몇 명 앉는 테이블) */
  seats?: number
  /** 테이블 회전 각도 (0, 90, 180, 270) */
  rotation?: number
}

export async function getPosTableLayout(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  const url = '/api/getPosTableLayout?' + q.toString()
  const cacheKey = `erp:posTableLayout:${params.storeCode.trim()}`
  const empty = { layout: [] as PosTableItem[], storeCode: params.storeCode }
  return fetchPosCatalogCached<{ layout: PosTableItem[]; storeCode: string; isFallback?: boolean }>(
    cacheKey,
    url,
    empty
  )
}

export interface PosPrinterSettings {
  storeCode: string
  kitchenMode: 1 | 2 | 3
  kitchen1Categories: string[]
  kitchen2Categories: string[]
  kitchen3Categories?: string[]
  /** 프린터 탭: 메뉴 id → 0 주방 미인쇄, 1~3 주방 (pos_menus.kitchen_printer 보다 우선) */
  kitchenRouteByMenu?: Record<string, 0 | 1 | 2 | 3>
  kitchenRouteByCategory?: Record<string, 0 | 1 | 2 | 3>
  kitchenRouteByCategoryMain?: Record<string, 0 | 1 | 2 | 3>
  autoStockDeduction?: boolean
  deliveryFee?: number
  packagingFee?: number
  cookingFreshMaxMin?: number
  cookingWarningMaxMin?: number
  cookingRuleMode?: 'elapsed' | 'recipe_diff'
  cookingRecipeWarningDiffMin?: number
  cookingRecipeUrgentDiffMin?: number
  cookingDelayBadgeEnabled?: boolean
  cookingDelaySoundEnabled?: boolean
  cookingDelayAlertOverMin?: number
  cardAutoOpen?: boolean
  checkAutoOpen?: boolean
  /** true면 카드 금액만 반영하고 LINKPOS 단말/릴레이 승인 호출을 하지 않음 */
  linkposSkipTerminalForCard?: boolean
  drawerOpenOption?: 'password_and_reason' | 'reason_only' | 'force'
  drawerPinConfigured?: boolean
  logoPrint?: boolean
  receiptPrintTiming?: 'per_payment' | 'final_payment'
  customerReceiptOrderDetails?: boolean
  merchantReceiptOrderDetails?: boolean
  cashPaymentReceipt?: boolean
  signatureLine?: boolean
  receiptBarcode?: boolean
  itemBarcode?: boolean
  qrCodeOption?: 'yes' | 'no' | 'return_points'
  discountSeparatePrint?: boolean
  merchantReceiptPrint?: boolean
  actualOrderDetails?: boolean
  toppingOptionsPrint?: boolean
  autoPrintReceiptOnOrder?: boolean
  autoPrintReceiptOnAddOrder?: boolean
  autoPrintReceiptOnPayment?: boolean
  autoPrintKitchenSlipOnOrder?: boolean
  /** 결제 모달 열기 직전 최종 주문서(홀) 자동 인쇄 */
  autoPrintFinalOrderBeforePayment?: boolean
  receiptBizName?: string
  receiptBizTaxId?: string
  receiptBizAbn?: string
  receiptBizOwner?: string
  receiptBizAddress?: string
  receiptBizPhone?: string
  receiptDesignStyle?: 'badge' | 'simple'
  receiptLogoSize?: 'sm' | 'md' | 'lg'
  receiptShowTitle?: boolean
  receiptShowPaidStamp?: boolean
  receiptShowThankYou?: boolean
  receiptShowCustomerCopy?: boolean
  receiptFooterPrimaryText?: string
  receiptFooterSecondaryText?: string
  receiptLogoImageUrl?: string
  receiptStampImageUrl?: string
  receiptShowStamp?: boolean
  receiptStampOnlyTaxInvoice?: boolean
  receiptMembershipQrImageUrl?: string
  receiptMembershipQrLinkUrl?: string
  receiptMembershipQrText?: string
  receiptShowMembershipQr?: boolean
  receiptPrintLang?: string
  /** 주방 주문서 인쇄 언어(미설정 시 POS 화면 언어) */
  kitchenSlipPrintLang?: string
  /** 주방 주문서 글자 크기 */
  kitchenSlipFontScale?: 'sm' | 'md' | 'lg'
  kitchenSlipShowLineNotes?: boolean
  kitchenSlipShowOrderMemo?: boolean
  /** 주방 주문서 옵션 그룹 노출 정책 (group key -> print enabled) */
  kitchenSlipOptionGroupPrint?: Record<string, boolean>
  /** Windows 하이브리드: 주방 주문서 ESC/POS 절단 (기본 true) */
  escPosCutAfterKitchenHtml?: boolean
  /** Windows 하이브리드: 홀 주문서(주문·터미널) 절단 */
  escPosCutAfterHallOrderHtml?: boolean
  /** Windows 하이브리드: 결제 영수증 절단 */
  escPosCutAfterPaymentReceiptHtml?: boolean
  vatRate?: number
  vatMode?: 'included' | 'separate'
  serviceRate?: number
  serviceMode?: 'included' | 'separate'
  cardRate?: number
  cardMode?: 'included' | 'separate'
  cardBaseMode?: 'card_only' | 'card_plus_vat' | 'card_plus_vat_service'
  otherRate?: number
  otherMode?: 'included' | 'separate'
  /**
   * 카운터(프론트) 포스 — 여러 대 가능. 해당 토큰을 가진 기기에서 주문 수신·자동 인쇄.
   * mainDeviceToken 은 하위 호환용(목록의 첫 토큰과 동일).
   */
  mainDeviceToken?: string | null
  mainDeviceTokens?: string[]
  dualMonitorEnabled?: boolean
  customerDisplayAutoOpen?: boolean
  customerDisplayMonitorPreference?: 'secondary-first' | 'primary-only'
  /** 고객화면 언어: follow-pos=POS 직원 화면 언어 따라감, custom=고객화면만 고정 */
  customerDisplayLangMode?: 'follow-pos' | 'custom'
  /** custom 일 때만 사용 */
  customerDisplayLangOverride?: 'ko' | 'en' | 'th' | 'mm' | 'la' | 'kh' | 'vi' | 'ms' | ''
  customerDisplayTheme?: 'dark' | 'light' | 'brand'
  customerDisplayDefaultState?: 'idle' | 'qr'
  customerDisplayIdleMessage?: string
  customerDisplayPaymentMessage?: string
  customerDisplayQrPayload?: string
  customerDisplayShowOrderSummary?: boolean
  customerDisplayShowOrderTotal?: boolean
  /** 평상시 고객화면 배경: 없음 / 이미지 / 동영상 */
  customerDisplayIdleMediaType?: 'none' | 'image' | 'video'
  customerDisplayIdleMediaUrl?: string
}

export async function getPosPrinterSettings(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  const url = '/api/getPosPrinterSettings?' + q.toString()
  const cacheKey = `erp:posPrinterSettings:${params.storeCode.trim()}`
  const fallback: PosPrinterSettings = {
    storeCode: params.storeCode,
    kitchenMode: 1,
    kitchen1Categories: [],
    kitchen2Categories: [],
  }
  const readCachedOrFallback = async () => {
    try {
      const cached = await getFromErpCache<PosPrinterSettings>(cacheKey)
      return cached ?? fallback
    } catch {
      return fallback
    }
  }

  try {
    const res = await apiFetch(url, { cache: 'no-store' })
    if (!res.ok) return readCachedOrFallback()
    const data = (await res.json()) as PosPrinterSettings
    try {
      await setErpCache(cacheKey, data)
      notifyPosCatalogUpdated(cacheKey, data)
    } catch {
      /* ignore cache write errors */
    }
    return data
  } catch {
    return readCachedOrFallback()
  }
}

export async function verifyPosDrawerPin(params: { storeCode: string; pin: string }) {
  const res = await apiFetch('/api/verifyPosDrawerPin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; skipped?: boolean }
}

export async function savePosDrawerPin(params: {
  storeCode: string
  newPin?: string
  currentPin?: string
  clearPin?: boolean
}) {
  const res = await apiFetch('/api/savePosDrawerPin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; cleared?: boolean }
}

export async function savePosPrinterSettings(params: {
  storeCode: string
  kitchenMode: 1 | 2 | 3
  kitchen1Categories: string[]
  kitchen2Categories: string[]
  kitchen3Categories?: string[]
  kitchenRouteByMenu?: Record<string, 0 | 1 | 2 | 3>
  kitchenRouteByCategory?: Record<string, 0 | 1 | 2 | 3>
  kitchenRouteByCategoryMain?: Record<string, 0 | 1 | 2 | 3>
  autoStockDeduction?: boolean
  deliveryFee?: number
  packagingFee?: number
  cookingFreshMaxMin?: number
  cookingWarningMaxMin?: number
  cookingRuleMode?: 'elapsed' | 'recipe_diff'
  cookingRecipeWarningDiffMin?: number
  cookingRecipeUrgentDiffMin?: number
  cookingDelayBadgeEnabled?: boolean
  cookingDelaySoundEnabled?: boolean
  cookingDelayAlertOverMin?: number
  cardAutoOpen?: boolean
  checkAutoOpen?: boolean
  linkposSkipTerminalForCard?: boolean
  drawerOpenOption?: 'password_and_reason' | 'reason_only' | 'force'
  drawerPinConfigured?: boolean
  logoPrint?: boolean
  receiptPrintTiming?: 'per_payment' | 'final_payment'
  customerReceiptOrderDetails?: boolean
  merchantReceiptOrderDetails?: boolean
  cashPaymentReceipt?: boolean
  signatureLine?: boolean
  receiptBarcode?: boolean
  itemBarcode?: boolean
  qrCodeOption?: 'yes' | 'no' | 'return_points'
  discountSeparatePrint?: boolean
  merchantReceiptPrint?: boolean
  actualOrderDetails?: boolean
  toppingOptionsPrint?: boolean
  autoPrintReceiptOnOrder?: boolean
  autoPrintReceiptOnAddOrder?: boolean
  autoPrintReceiptOnPayment?: boolean
  autoPrintKitchenSlipOnOrder?: boolean
  autoPrintFinalOrderBeforePayment?: boolean
  receiptBizName?: string
  receiptBizTaxId?: string
  receiptBizAbn?: string
  receiptBizOwner?: string
  receiptBizAddress?: string
  receiptBizPhone?: string
  receiptDesignStyle?: 'badge' | 'simple'
  receiptLogoSize?: 'sm' | 'md' | 'lg'
  receiptShowTitle?: boolean
  receiptShowPaidStamp?: boolean
  receiptShowThankYou?: boolean
  receiptShowCustomerCopy?: boolean
  receiptFooterPrimaryText?: string
  receiptFooterSecondaryText?: string
  receiptLogoImageUrl?: string
  receiptStampImageUrl?: string
  receiptShowStamp?: boolean
  receiptStampOnlyTaxInvoice?: boolean
  receiptMembershipQrImageUrl?: string
  receiptMembershipQrLinkUrl?: string
  receiptMembershipQrText?: string
  receiptShowMembershipQr?: boolean
  receiptPrintLang?: string
  /** 주방 주문서 인쇄 언어(미설정 시 POS 화면 언어) */
  kitchenSlipPrintLang?: string
  kitchenSlipFontScale?: 'sm' | 'md' | 'lg'
  kitchenSlipShowLineNotes?: boolean
  kitchenSlipShowOrderMemo?: boolean
  kitchenSlipOptionGroupPrint?: Record<string, boolean>
  escPosCutAfterKitchenHtml?: boolean
  escPosCutAfterHallOrderHtml?: boolean
  escPosCutAfterPaymentReceiptHtml?: boolean
  vatRate?: number
  vatMode?: 'included' | 'separate'
  serviceRate?: number
  serviceMode?: 'included' | 'separate'
  cardRate?: number
  cardMode?: 'included' | 'separate'
  cardBaseMode?: 'card_only' | 'card_plus_vat' | 'card_plus_vat_service'
  otherRate?: number
  otherMode?: 'included' | 'separate'
  dualMonitorEnabled?: boolean
  customerDisplayAutoOpen?: boolean
  customerDisplayMonitorPreference?: 'secondary-first' | 'primary-only'
  customerDisplayLangMode?: 'follow-pos' | 'custom'
  customerDisplayLangOverride?: 'ko' | 'en' | 'th' | 'mm' | 'la' | 'kh' | 'vi' | 'ms' | ''
  customerDisplayTheme?: 'dark' | 'light' | 'brand'
  customerDisplayDefaultState?: 'idle' | 'qr'
  customerDisplayIdleMessage?: string
  customerDisplayPaymentMessage?: string
  customerDisplayQrPayload?: string
  customerDisplayShowOrderSummary?: boolean
  customerDisplayShowOrderTotal?: boolean
  customerDisplayIdleMediaType?: 'none' | 'image' | 'video'
  customerDisplayIdleMediaUrl?: string
}) {
  const res = await apiFetchWithOffline('/api/savePosPrinterSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const queued = res.headers.get('X-Offline-Queued') === '1'
  const text = await res.text()
  let data: { success?: boolean; message?: string } = {}
  try {
    if (text) data = JSON.parse(text) as { success?: boolean; message?: string }
  } catch {
    return {
      success: false,
      message: text ? text.slice(0, 240) : `HTTP ${res.status}`,
      queued,
    }
  }
  const shouldWriteOptimisticCache = queued || res.ok
  const cacheKey = `erp:posPrinterSettings:${String(params.storeCode || '').trim()}`
  if (shouldWriteOptimisticCache && cacheKey !== 'erp:posPrinterSettings:') {
    try {
      const prev = await getFromErpCache<PosPrinterSettings>(cacheKey)
      const p = params as Partial<PosPrinterSettings>
      const kitchenMode: 1 | 2 | 3 = p.kitchenMode ?? prev?.kitchenMode ?? 1
      const optimistic: PosPrinterSettings = {
        ...(prev || ({} as PosPrinterSettings)),
        ...p,
        storeCode: params.storeCode,
        kitchenMode,
      }
      await setErpCache(cacheKey, optimistic)
      notifyPosCatalogUpdated(cacheKey, optimistic)
    } catch {
      /* ignore cache write errors */
    }
  }
  if (queued) return { success: true, queued: true }
  if (!res.ok) {
    return { success: false, message: data.message || `HTTP ${res.status}`, queued: false }
  }
  return {
    success: data.success !== false,
    message: data.message,
    queued: false,
  }
}

export async function clearPosMainDevice(params: { storeCode: string; deviceToken?: string }) {
  const res = await apiFetchWithOffline('/api/clearPosMainDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode: params.storeCode, deviceToken: params.deviceToken }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function registerPosMainDevice(params: { storeCode: string; deviceToken: string }) {
  const res = await apiFetchWithOffline('/api/registerPosMainDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode: params.storeCode, deviceToken: params.deviceToken }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface PosDeviceItem {
  deviceToken: string
  role: 'main' | 'order'
  lastSeenAt: string
  createdAt: string
  isMain: boolean
  displayLabel: string | null
  clientHint: string | null
}

export async function getPosDevices(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  const res = await apiFetchWithOffline('/api/getPosDevices?' + q.toString())
  const data = await res.json() as { success: boolean; message?: string; devices?: PosDeviceItem[] }
  return { ...data, devices: data.devices ?? [] }
}

export async function registerPosDevice(params: {
  storeCode: string
  deviceToken: string
  role: 'main' | 'order'
  /** 브라우저 UA·OS 등 (선택). 접속 시마다 갱신되면 목록에서 단말 구분에 도움 */
  clientHint?: string
}) {
  const res = await apiFetchWithOffline('/api/registerPosDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: params.storeCode,
      deviceToken: params.deviceToken,
      role: params.role,
      ...(params.clientHint != null && String(params.clientHint).trim()
        ? { clientHint: String(params.clientHint).trim().slice(0, 240) }
        : {}),
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updatePosDeviceDisplayLabel(params: {
  storeCode: string
  deviceToken: string
  displayLabel: string
}) {
  const res = await apiFetchWithOffline('/api/updatePosDeviceDisplayLabel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: params.storeCode,
      deviceToken: params.deviceToken,
      displayLabel: params.displayLabel,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function revokePosDevice(params: { storeCode: string; deviceToken: string }) {
  const res = await apiFetchWithOffline('/api/revokePosDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode: params.storeCode, deviceToken: params.deviceToken }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function setPosMainDevice(params: { storeCode: string; deviceToken: string }) {
  const res = await apiFetchWithOffline('/api/setPosMainDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode: params.storeCode, deviceToken: params.deviceToken }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function savePosTableLayout(params: {
  storeCode: string
  layout: PosTableItem[]
}) {
  const res = await apiFetchWithOffline('/api/savePosTableLayout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface PosDeliveryApp {
  id: number
  code: string
  name: string
  matchKeywords: string[]
  displayOrder: number
  enabled: boolean
  dineOutEnabled: boolean
  accentColor: string | null
  storeCode: string | null
}

export async function getPosDeliveryApps(params?: { storeCode?: string; includeDisabled?: boolean }) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.includeDisabled) q.set('includeDisabled', 'true')
  const qs = q.toString()
  const url = '/api/getPosDeliveryApps' + (qs ? `?${qs}` : '')
  const cacheKey = `erp:posDeliveryApps:${params?.storeCode?.trim() || ''}:${params?.includeDisabled ? '1' : '0'}`
  return fetchPosCatalogCached<PosDeliveryApp[]>(cacheKey, url, [])
}

export async function savePosDeliveryApps(params: {
  storeCode?: string
  items: Array<{
    id?: number
    code: string
    name: string
    matchKeywords?: string[]
    displayOrder?: number
    enabled?: boolean
    dineOutEnabled?: boolean
    accentColor?: string | null
  }>
}) {
  const res = await apiFetchWithOffline('/api/savePosDeliveryApps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface GrabStoreIntegrationSnapshot {
  id: number
  grabMerchantID: string
  partnerMerchantID: string
  integrationStatus: string
  lastRequestID: string | null
  lastMessage: string | null
  payload: unknown
  createdAt: string | null
  updatedAt: string | null
}

export async function getGrabStoreIntegrations(params?: {
  grabMerchantID?: string
  partnerMerchantID?: string
  status?: string
  limit?: number
}) {
  const q = new URLSearchParams()
  if (params?.grabMerchantID) q.set('grabMerchantID', params.grabMerchantID)
  if (params?.partnerMerchantID) q.set('partnerMerchantID', params.partnerMerchantID)
  if (params?.status) q.set('status', params.status)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const qs = q.toString()
  const url = '/api/getGrabStoreIntegrations' + (qs ? `?${qs}` : '')
  const res = await apiFetch(url)
  const json = await res.json()
  return Array.isArray(json) ? (json as GrabStoreIntegrationSnapshot[]) : []
}

export interface PosMenuScreenConfig {
  storeCode: string | null
  scope?: 'dine-in' | 'delivery' | 'takeout'
  mainCategoryFontSize: number
  categoryFontSize: number
  menuTileFontSize: number
  menuTileCols: number
  menuListFontSize: number
  menuListPageSize: number
  kioskGroupFontSize: number
  updatedAt?: string | null
}

export async function getPosMenuScreenConfig(params?: {
  storeCode?: string
  scope?: 'dine-in' | 'delivery' | 'takeout'
}) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.scope) q.set('scope', params.scope)
  const qs = q.toString()
  const url = '/api/getPosMenuScreenConfig' + (qs ? `?${qs}` : '')
  const cacheKey = `erp:posMenuScreenConfig:${params?.storeCode?.trim() || 'default'}:${params?.scope || 'dine-in'}`
  const fallback: PosMenuScreenConfig = {
    storeCode: params?.storeCode?.trim() || null,
    scope: params?.scope || 'dine-in',
    mainCategoryFontSize: 18,
    categoryFontSize: 15,
    menuTileFontSize: 13,
    menuTileCols: 4,
    menuListFontSize: 14,
    menuListPageSize: 8,
    kioskGroupFontSize: 16,
  }
  return fetchPosCatalogCached<PosMenuScreenConfig>(cacheKey, url, fallback)
}

export async function savePosMenuScreenConfig(params: {
  storeCode?: string | null
  scope?: 'dine-in' | 'delivery' | 'takeout'
  mainCategoryFontSize: number
  categoryFontSize: number
  menuTileFontSize: number
  menuTileCols: number
  menuListFontSize: number
  menuListPageSize: number
  kioskGroupFontSize: number
}) {
  const res = await apiFetchWithOffline('/api/savePosMenuScreenConfig', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface PosMenuBoardConfig {
  id: number
  storeCode: string
  boardType: 'dine_in' | 'delivery' | 'table_order' | 'tablet' | 'kiosk'
  boardName: string
  groupGridCols: number
  groupGridRows: number
  menuGridCols: number
  menuGridRows: number
  resolutionWidth: number
  resolutionHeight: number
  groupCount: number
  menuCount: number
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export async function getPosMenuBoards(params?: {
  storeCode?: string
  boardType?: 'dine_in' | 'delivery' | 'table_order' | 'tablet' | 'kiosk'
}) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.boardType) q.set('boardType', params.boardType)
  const res = await apiFetchWithOffline('/api/getPosMenuBoards?' + q.toString())
  return jsonAsArray<PosMenuBoardConfig>(await res.json())
}

export async function savePosMenuBoard(params: {
  id?: number
  storeCode: string
  boardType: 'dine_in' | 'delivery' | 'table_order' | 'tablet' | 'kiosk'
  boardName: string
  groupGridCols?: number
  groupGridRows?: number
  menuGridCols?: number
  menuGridRows?: number
  resolutionWidth?: number
  resolutionHeight?: number
  groupCount?: number
  menuCount?: number
  isActive?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosMenuBoard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deletePosMenuBoard(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deletePosMenuBoard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getPosPaymentSettings(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  const res = await apiFetchWithOffline('/api/getPosPaymentSettings?' + q.toString())
  return res.json() as Promise<{
    storeCode: string
    cardKeys: string[]
    qrKeys: string[]
    otherKeys: string[]
    deliveryKeys?: string[]
  }>
}

export interface PosPaymentMethodItem {
  id: string
  storeCode: string | null
  category: 'card' | 'qr' | 'delivery' | 'other'
  name: string
  hidden: boolean
  sortOrder: number
}

export async function getPosPaymentMethodItems(params: { storeCode?: string }) {
  const q = new URLSearchParams()
  if (params.storeCode?.trim()) q.set('storeCode', params.storeCode.trim())
  const qs = q.toString()
  const url = '/api/getPosPaymentMethodItems' + (qs ? `?${qs}` : '')
  const cacheKey = `erp:posPaymentMethodItems:${params.storeCode?.trim() || 'default'}`
  return fetchPosCatalogCached<PosPaymentMethodItem[]>(cacheKey, url, [])
}

export async function savePosPaymentMethodItem(params: {
  id?: string
  storeCode?: string | null
  category: 'card' | 'qr' | 'delivery' | 'other'
  name: string
  hidden?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosPaymentMethodItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: string; message?: string }>
}

export async function deletePosPaymentMethodItem(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deletePosPaymentMethodItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: params.id }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function savePosPaymentSettings(params: {
  storeCode: string
  cardKeys: string[]
  qrKeys: string[]
}) {
  const res = await apiFetchWithOffline('/api/savePosPaymentSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface PosOrderItem {
  id: string
  name: string
  price: number
  qty: number
  /** 주문 저장 시점 메뉴별 할인 스냅샷(손님 영수증 우선 표시) */
  lineDiscountAmt?: number
  /** 일부 `items_json`·연동은 quantity 만 사용 (서버/클라이언트에서 qty 와 병용 해석) */
  quantity?: number
  /** 줄 단위 메모 (주방·영수증) */
  note?: string
  servedAt?: string | null
  servedBy?: string | null
  cancelledAt?: string | null
  cancelledBy?: string | null
  cancelReason?: string | null
  orderType?: string
  deliveryAppCode?: string
  promoId?: string
  promoCode?: string
  promoItems?: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]
  setChildrenState?: Record<
    string,
    {
      servedAt?: string | null
      servedBy?: string | null
      packedAt?: string | null
      packedBy?: string | null
    }
  >
  menuId1?: string
  optionId1?: string
  optionCode1?: string
  menuId2?: string
  optionId2?: string
  optionCode2?: string
}

export interface PosOrder {
  id: number
  orderNo: string
  storeCode: string
  orderType: string
  /** pos_orders.order_type (메모·채널 추론 전 DB 값) — 테이블 점유 매칭용 */
  dbOrderType?: string
  tableName: string
  memo: string
  discountAmt?: number
  discountReason?: string
  serviceAmt?: number
  serviceReason?: string
  deliveryFee?: number
  packagingFee?: number
  cardFeeAmt?: number
  cardFeeMode?: 'included' | 'separate'
  cardRate?: number
  paymentCash?: number
  /** 현금 받은 금액(손님 영수증 거스름 표시) */
  paymentCashTendered?: number
  paymentCard?: number
  paymentQr?: number
  paymentQrType?: 'THAI_QR' | 'CREDIT_CARD'
  paymentOther?: number
  /** payment_other 세부(트루머니·위챗·관리자 지갑 등). 합계는 payment_other 와 일치 */
  paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
  /** 배달앱(Grab/Line Man/Shopee 등) 플랫폼 결제 금액 */
  paymentDeliveryApp?: number
  /** grab | lineman | shopee | dine_in */
  deliveryPaymentChannel?: string
  /** pos_orders.delivery_app_code — POS 수동 배달·연동 주문의 플랫폼 구분 */
  deliveryAppCode?: string
  memberId?: number
  memberNo?: string
  couponCode?: string
  couponDiscountAmt?: number
  appliedCoupons?: PosAppliedCoupon[]
  pointUsed?: number
  pointEarned?: number
  /** 홀 주문 인원(포장/배달 등은 0) */
  guestCount?: number
  items: PosOrderItem[]
  subtotal: number
  vat: number
  total: number
  status: string
  createdAt: string
  /** 결제·수정 시각(DB updated_at). 결제 완료 시각 추정에 사용 */
  updatedAt?: string
  /** 최초 결제 완료 시각(DB paid_at). 영수증 관리 결제일시 표시용 */
  paidAt?: string
  linkposProvider?: string
  linkposMode?: string
  linkposTxCode?: string
  linkposBankId?: string
  linkposResponseCode?: string
  linkposApprovalCode?: string
  linkposTraceNo?: string
  linkposRefNo?: string
  linkposTerminalId?: string
  linkposMerchantId?: string
  linkposReference1?: string
  linkposRequestedAmount?: number
  linkposApprovedAmount?: number
  linkposRequestedAt?: string
  linkposRespondedAt?: string
}

export async function getPosTodaySales(params?: {
  storeCode?: string
  startStr?: string
  endStr?: string
  /** true면 IDB 즉시 반환 없이 네트워크 조회를 기다림(헤더 새로고침 등) */
  forceNetwork?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.startStr) q.set('startStr', params.startStr)
  if (params?.endStr) q.set('endStr', params.endStr)
  const qs = q.toString()
  const url = '/api/getPosTodaySales' + (qs ? `?${qs}` : '')
  const cacheKey = `erp:posTodaySales:${params?.storeCode?.trim() || ''}:${params?.startStr?.trim() || ''}:${params?.endStr?.trim() || ''}`
  const fallback = {
    completedCount: 0,
    completedTotal: 0,
    completedCash: 0,
    pendingCount: 0,
  }
  return fetchPosCatalogCached<{
    completedCount: number
    completedTotal: number
    completedCash: number
    pendingCount: number
  }>(cacheKey, url, fallback, { forceNetwork: Boolean(params?.forceNetwork) })
}

export async function getPosReversalJournals(params: {
  startStr: string
  endStr: string
  storeCode?: string
}) {
  const q = new URLSearchParams()
  q.set('startStr', params.startStr)
  q.set('endStr', params.endStr)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  const res = await apiFetchWithOffline('/api/getPosReversalJournals?' + q.toString())
  const data = (await res.json()) as {
    success?: boolean
    rows?: {
      id: number
      accountingDate: string
      posOrderId: number
      storeCode: string
      memo: string
      postedAt: string
    }[]
    message?: string
  }
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `HTTP ${res.status}`)
  }
  return Array.isArray(data.rows) ? data.rows : []
}

export async function getPosOrders(params?: {
  startStr?: string
  endStr?: string
  /** 단일 영업일(YYYY-MM-DD) 조회 시 POS 영업일 경계(설정된 시작 시각~익일 동시각)로 UTC 구간 적용 */
  posBizDayScope?: boolean
  storeCode?: string
  status?: string
  strictStore?: boolean
  /** 임시 디버그: getPosOrders 상세 서버 로그 출력 */
  debugPosOrders?: boolean
  sinceId?: number
  /** 단건 조회(결제 영수증 동기화 등). 지정 시 날짜·sinceId 없이 id 우선 조회 */
  orderId?: number
  /** status가 paid 또는 completed 인 행만 (OR). 메인 기기 결제 영수증 폴링 등 */
  statusPaidLike?: boolean
  orderBy?: 'created_at.desc' | 'id.desc' | 'updated_at.desc'
  /** 목록 조회 시 행 수 상한(서버에서 최대 2000으로 캡) */
  limit?: number
  /** 메인 POS 폴링용 — linkpos 등 대형 컬럼 제외 select */
  pollMinimal?: boolean
}): Promise<PosOrder[]> {
  const q = new URLSearchParams()
  if (params?.orderId != null && params.orderId > 0) q.set('orderId', String(params.orderId))
  if (params?.startStr) q.set('startStr', params.startStr)
  if (params?.endStr) q.set('endStr', params.endStr)
  if (params?.posBizDayScope) q.set('posBizDayScope', '1')
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.status) q.set('status', params.status)
  if (params?.strictStore) q.set('strictStore', '1')
  if (params?.debugPosOrders) q.set('debugPosOrders', '1')
  if (params?.sinceId != null && params.sinceId > 0) q.set('sinceId', String(params.sinceId))
  if (params?.statusPaidLike) q.set('statusPaidLike', '1')
  if (params?.orderBy) q.set('orderBy', params.orderBy)
  if (params?.limit != null && params.limit > 0) q.set('limit', String(params.limit))
  if (params?.pollMinimal) q.set('pollMinimal', '1')
  const res = await apiFetchWithOffline('/api/getPosOrders?' + q.toString())
  if (res.status === 204) return []
  const data = await res.json().catch(() => null)
  if (!Array.isArray(data)) return []
  return data as PosOrder[]
}

export type PosBusinessDayStartDto = { hour: number; minute: number }

export type PosBusinessDaySettingsDto = PosBusinessDayStartDto & {
  endHour: number
  endMinute: number
  scope?: 'store_override' | 'org_default'
  storeCode?: string | null
  hasStoreOverride?: boolean
  globalHour?: number
  globalMinute?: number
  globalEndHour?: number
  globalEndMinute?: number
  defaultHour?: number
  defaultMinute?: number
  defaultEndHour?: number
  defaultEndMinute?: number
}

export async function getPosBusinessDaySettings(storeCode?: string | null): Promise<PosBusinessDaySettingsDto> {
  const q = storeCode?.trim() ? `?storeCode=${encodeURIComponent(String(storeCode).trim())}` : ''
  const res = await fetch('/api/posBusinessDaySettings' + q, { cache: 'no-store' })
  const j = (await res.json().catch(() => null)) as Partial<PosBusinessDaySettingsDto> | null
  const hour = Number(j?.hour)
  const minute = Number(j?.minute ?? 0)
  const base =
    !Number.isFinite(hour)
      ? { hour: POS_BUSINESS_DAY_DEFAULT_START.hour, minute: POS_BUSINESS_DAY_DEFAULT_START.minute }
      : { hour: Math.min(23, Math.max(0, Math.trunc(hour))), minute: Math.min(59, Math.max(0, Math.trunc(minute))) }
  const ehRaw = Number(j?.endHour)
  const emRaw = Number(j?.endMinute ?? 0)
  const end =
    !Number.isFinite(ehRaw)
      ? { hour: base.hour, minute: base.minute }
      : {
          hour: Math.min(23, Math.max(0, Math.trunc(ehRaw))),
          minute: Math.min(59, Math.max(0, Math.trunc(emRaw))),
        }
  const def = POS_BUSINESS_DAY_DEFAULT_HOURS.start
  const defEnd = POS_BUSINESS_DAY_DEFAULT_HOURS.end
  return {
    ...base,
    endHour: end.hour,
    endMinute: end.minute,
    scope: j?.scope === 'store_override' ? 'store_override' : 'org_default',
    storeCode: j?.storeCode ?? null,
    hasStoreOverride: Boolean(j?.hasStoreOverride),
    globalHour: Number.isFinite(Number(j?.globalHour)) ? Math.trunc(Number(j?.globalHour)) : def.hour,
    globalMinute: Number.isFinite(Number(j?.globalMinute)) ? Math.min(59, Math.max(0, Math.trunc(Number(j?.globalMinute)))) : def.minute,
    globalEndHour: Number.isFinite(Number(j?.globalEndHour)) ? Math.trunc(Number(j?.globalEndHour)) : defEnd.hour,
    globalEndMinute: Number.isFinite(Number(j?.globalEndMinute))
      ? Math.min(59, Math.max(0, Math.trunc(Number(j?.globalEndMinute))))
      : defEnd.minute,
    defaultHour: def.hour,
    defaultMinute: def.minute,
    defaultEndHour: defEnd.hour,
    defaultEndMinute: defEnd.minute,
  }
}

export async function savePosBusinessDaySettings(params: {
  hour: number
  minute: number
  endHour?: number
  endMinute?: number
  /** 없으면 전사 기본값(본사만) */
  storeCode?: string | null
  /** true 이면 해당 매장 덮어쓰기 제거 */
  resetStoreOverride?: boolean
}): Promise<{ success: boolean; message?: string }> {
  const body: Record<string, unknown> = {}
  if (params.resetStoreOverride) {
    body.reset = true
    body.storeCode = params.storeCode ?? ''
  } else {
    body.hour = params.hour
    body.minute = params.minute
    body.endHour = params.endHour ?? params.hour
    body.endMinute = params.endMinute ?? params.minute
    if (params.storeCode != null && String(params.storeCode).trim()) body.storeCode = String(params.storeCode).trim()
  }
  const res = await fetch('/api/posBusinessDaySettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  const j = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string }
  return { success: Boolean(j?.success), message: j?.message }
}

export interface PosSettlement {
  id?: number
  storeCode: string
  settleDate: string
  cashActual: number | null
  /** 돈통 시제 권종별 장 수(키 1000,500,…). DB `cash_actual_denoms` */
  cashActualDenoms?: Record<string, number> | null
  cashAmt?: number
  cardAmt: number
  cardBreakdown?: Record<string, number>
  qrAmt: number
  qrBreakdown?: Record<string, number>
  deliveryAppAmt: number
  deliveryAppBreakdown?: Record<string, number>
  /** 매장 홀에서 배달앱 탭·Dine in 채널 (플랫폼 배달과 별도) */
  dineInDeliveryAmt?: number
  dineInDeliveryBreakdown?: Record<string, number>
  otherAmt: number
  otherBreakdown?: Record<string, number>
  memo: string
  closed: boolean
}

export interface PosCloseRun {
  id: number
  status: 'draft' | 'validated' | 'locked' | 'posted'
  checks: Record<string, unknown>
  totals: Record<string, unknown>
  settlementRef: number | null
  postedJournalEntryId: number | null
  validatedAt: string | null
  finalizedAt: string | null
}

export interface PosPaymentAttempt {
  id: number
  orderId: number | null
  orderNo: string
  storeCode: string
  localTxId: string
  provider: string
  mode: string
  txCode: string
  retryOfAttemptId?: number | null
  retryOfLocalTxId?: string
  bankId: string
  requestAmount: number
  approvedAmount: number
  responseCode: string
  approvalCode: string
  traceNo: string
  terminalId: string
  merchantId: string
  responseText: string
  status: string
  errorReason: string
  createdAt: string
}

export interface PosLinkposTenderRule {
  id: number
  storeCode: string
  matchKeyword: string
  tenderGroup: 'card' | 'qr'
  tenderKey: string
  priority: number
  isActive: boolean
  createdAt: string
}

export async function getPosSettlement(params: {
  settleDate: string
  storeCode?: string
}) {
  const q = new URLSearchParams()
  q.set('settleDate', params.settleDate)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  const res = await apiFetchWithOffline('/api/getPosSettlement?' + q.toString(), { cache: 'no-store' })
  return res.json() as Promise<{
    systemTotal: number
    systemSubtotal?: number
    systemVat?: number
    /** 완료 주문 `payment_cash` 합계 — 결산 현금 줄 자동 채움용 */
    systemCashFromOrders?: number
    /** 해당 결산일(trans_date)·매장 시재 거래 순액(입금+, 출금-/매출출금-) — 마감 예상 돈통용 */
    tillNetForSettleDate?: number
    linkpos?: {
      approvedCount: number
      failedCount: number
      requestedTotal: number
      approvedTotal: number
      cardReportedTotal: number
      diffVsApproved: number
      autoCardBreakdown?: Record<string, number>
      autoQrBreakdown?: Record<string, number>
      autoDeliveryAppBreakdown?: Record<string, number>
      autoDineInDeliveryBreakdown?: Record<string, number>
      autoOtherBreakdown?: Record<string, number>
    }
    settlement: PosSettlement | PosSettlement[] | null
    closeRun?: PosCloseRun | null
  }>
}

export async function getPosPaymentAttempts(params?: {
  startStr?: string
  endStr?: string
  storeCode?: string
  localTxId?: string
  status?: 'all' | 'approved' | 'declined' | 'failed'
  limit?: number
}) {
  const q = new URLSearchParams()
  if (params?.startStr) q.set('startStr', params.startStr)
  if (params?.endStr) q.set('endStr', params.endStr)
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.localTxId) q.set('localTxId', params.localTxId)
  if (params?.status) q.set('status', params.status)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline('/api/getPosPaymentAttempts?' + q.toString())
  const data = await res.json().catch(() => null)
  if (!Array.isArray(data)) return []
  return data as PosPaymentAttempt[]
}

export async function getPosLinkposTenderRules(params?: {
  storeCode?: string
  includeShared?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.includeShared != null) q.set('includeShared', params.includeShared ? 'true' : 'false')
  const res = await apiFetchWithOffline('/api/getPosLinkposTenderRules?' + q.toString())
  const data = await res.json().catch(() => null)
  if (!Array.isArray(data)) return []
  return data as PosLinkposTenderRule[]
}

export async function savePosLinkposTenderRule(params: {
  id?: number
  storeCode: string
  matchKeyword: string
  tenderGroup: 'card' | 'qr'
  tenderKey: string
  priority?: number
  isActive?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosLinkposTenderRule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deletePosLinkposTenderRule(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deletePosLinkposTenderRule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type PosChannelSettlementChannel = 'card' | 'grab' | 'lineman' | 'shopee' | 'delivery_all'

export interface PosChannelSettlementRow {
  id: number
  storeCode: string
  settleDate: string
  channel: PosChannelSettlementChannel
  gross: number
  fee: number
  net: number
  feeSource?: string | null
  memo?: string | null
  bankTransactionId?: number | null
  journalEntryId?: number | null
}

export async function getPosChannelSettlementGross(params: {
  storeCode: string
  settleDate: string
  channel: PosChannelSettlementChannel
}) {
  const q = new URLSearchParams({
    storeCode: params.storeCode,
    settleDate: params.settleDate,
    channel: params.channel,
  })
  const res = await apiFetchWithOffline(`/api/getPosChannelSettlementGross?${q}`)
  return res.json() as Promise<{
    success: boolean
    gross?: number
    orderCount?: number
    cardFeeTotal?: number
    suggestedFee?: number | null
    suggestedFeeSource?: string | null
    platformFeePct?: number | null
    platformAppCode?: string | null
    message?: string
  }>
}

export async function getPosChannelSettlements(params: { storeCode: string; settleDate: string }) {
  const q = new URLSearchParams({
    storeCode: params.storeCode,
    settleDate: params.settleDate,
  })
  const res = await apiFetchWithOffline(`/api/getPosChannelSettlements?${q}`)
  return res.json() as Promise<{
    success: boolean
    settlements?: PosChannelSettlementRow[]
    message?: string
  }>
}

export async function savePosChannelSettlement(params: {
  storeCode: string
  settleDate: string
  channel: PosChannelSettlementChannel
  gross: number
  net: number
  fee?: number
  feeSource?: string
  memo?: string
  bankTransactionId?: number
  repost?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosChannelSettlement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    settlementId?: number
    journalEntryId?: number | null
    alreadyPosted?: boolean
    message?: string
  }>
}

export async function importPosChannelSettlements(params: {
  rows: {
    storeCode: string
    settleDate: string
    channel: PosChannelSettlementChannel
    gross: number
    net: number
    fee?: number
    memo?: string
    feeSource?: string
  }[]
  repost?: boolean
}) {
  const res = await apiFetchWithOffline('/api/importPosChannelSettlements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    processed?: number
    failed?: number
    results?: { index: number; ok: boolean; code?: string; channel?: string; settleDate?: string }[]
    message?: string
  }>
}

export async function savePosSettlement(params: {
  storeCode?: string
  settleDate: string
  cashActual?: number | null
  cashActualDenoms?: Record<string, number> | null
  cashAmt?: number
  cardAmt?: number
  cardBreakdown?: Record<string, number>
  qrAmt?: number
  qrBreakdown?: Record<string, number>
  deliveryAppAmt?: number
  deliveryAppBreakdown?: Record<string, number>
  dineInDeliveryAmt?: number
  dineInDeliveryBreakdown?: Record<string, number>
  otherAmt?: number
  otherBreakdown?: Record<string, number>
  memo?: string
  closed?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosSettlement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function validatePosClose(params: {
  storeCode: string
  settleDate: string
}) {
  const res = await apiFetchWithOffline('/api/posClose/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: params.storeCode,
      businessDate: params.settleDate,
      settleDate: params.settleDate,
    }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    result?: {
      status: 'validated' | 'draft'
      diffTotal: number
      hasSettlement: boolean
    }
  }>
}

export async function finalizePosClose(params: {
  storeCode: string
  settleDate: string
}) {
  const res = await apiFetchWithOffline('/api/posClose/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: params.storeCode,
      businessDate: params.settleDate,
      settleDate: params.settleDate,
    }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    result?: {
      status: 'validated' | 'draft'
      postedJournalEntryId: number | null
      finalized: boolean
    }
  }>
}

export async function updatePosOrder(params: {
  id: number
  items: PosOrderItem[]
  /** 결제 단말 매장 — 주문 store_code와 시재 store_code 불일치 시 영업 시작 폴백 */
  terminalStoreCode?: string
  tableName?: string
  memo?: string
  discountAmt?: number
  discountReason?: string
  serviceAmt?: number
  serviceReason?: string
  paymentCash?: number
  paymentCashTendered?: number
  paymentCard?: number
  paymentQr?: number
  paymentQrType?: 'THAI_QR' | 'CREDIT_CARD'
  paymentOther?: number
  paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
  paymentDeliveryApp?: number
  deliveryPaymentChannel?: string | null
  memberId?: number
  memberNo?: string
  couponCode?: string
  couponDiscountAmt?: number
  appliedCoupons?: PosAppliedCoupon[]
  pointUsed?: number
  pointEarned?: number
  guestCount?: number
  linkposPayment?: LinkposPaymentSummary | null
  pricingAdjustments?: {
    vatRate?: number
    vatMode?: 'included' | 'separate'
    serviceRate?: number
    serviceMode?: 'included' | 'separate'
    cardRate?: number
    cardMode?: 'included' | 'separate'
    cardBaseMode?: 'card_only' | 'card_plus_vat' | 'card_plus_vat_service'
    otherRate?: number
    otherMode?: 'included' | 'separate'
  }
}) {
  const res = await apiFetchWithOffline('/api/updatePosOrder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 영수증 관리: 당일(방콕) 결제 반영 주문의 결제 수단 분해 정정(필요 시 total·과세 스냅샷 비율 조정). 오프라인 시 큐 동기화 필요 */
export async function correctPosOrderPayment(params: {
  id: number
  reason: string
  /** 생략 시 기존 주문 total 유지(결제 분할만 정정) */
  total?: number
  paymentCash: number
  paymentCard: number
  paymentQr: number
  paymentOther: number
  /** 생략 시 기존 DB breakdown 을 새 payment_other 에 맞게 재검증·유지 */
  paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
  paymentDeliveryApp: number
  deliveryPaymentChannel?: string | null
}) {
  const res = await apiFetchWithOffline('/api/correctPosOrderPayment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 홀 주문: 빈 테이블로 이동 (table_name만 변경) */
export async function posDineInTableMove(params: { orderId: number; targetTableName: string }) {
  const res = await apiFetchWithOffline('/api/posDineInTableActions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'move',
      orderId: params.orderId,
      targetTableName: params.targetTableName,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/**
 * 홀 주문 합석: keep는 매장(dine_in)만. absorb는 매장 또는 포장(takeout) — 포장은 이 테이블 청구서로만 합침.
 * keep에 absorb 품목·인원 등을 합치고 absorb는 cancelled + `[ORDER_MERGED …]` 메모. 결제 반영된 주문은 합석 불가(API).
 */
export async function posDineInTableMerge(params: { keepOrderId: number; absorbOrderId: number }) {
  const res = await apiFetchWithOffline('/api/posDineInTableActions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'merge',
      keepOrderId: params.keepOrderId,
      absorbOrderId: params.absorbOrderId,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type PosOrderStatusUpdateResult = {
  success: boolean
  message?: string
  retryAfterQueue?: boolean
  statusAlreadyApplied?: boolean
  failedSideEffects?: string[]
}

export type PosOrderAuditTrailRow = {
  id: number
  changedAt: string
  orderId: number
  orderNo: string
  storeCode: string
  actionType: string
  changedBy: string
  changedByRole: string
  changedByStore: string
  changedByEmployeeCode: string
  changedByEmployeeId: number | null
  changeSource: string
  reason: string
  beforeJson: Record<string, unknown> | null
  afterJson: Record<string, unknown> | null
  changedFields: Array<{ field: string; before: unknown; after: unknown }>
}

export async function getPosOrderAuditTrail(params: {
  startStr: string
  endStr: string
  employee?: string
  orderNo?: string
  store?: string
  limit?: number
}) {
  const q = new URLSearchParams()
  q.set('startStr', params.startStr)
  q.set('endStr', params.endStr)
  if (params.employee) q.set('employee', params.employee)
  if (params.orderNo) q.set('orderNo', params.orderNo)
  if (params.store) q.set('store', params.store)
  if (params.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline(`/api/getPosOrderAuditTrail?${q.toString()}`)
  const json = (await res.json().catch(() => ({}))) as { rows?: Record<string, unknown>[] }
  const rows = Array.isArray(json.rows) ? json.rows : []
  return rows.map((r) => ({
    id: Number(r.id || 0),
    changedAt: String(r.changed_at || ''),
    orderId: Number(r.order_id || 0),
    orderNo: String(r.order_no || ''),
    storeCode: String(r.store_code || ''),
    actionType: String(r.action_type || ''),
    changedBy: String(r.changed_by || ''),
    changedByRole: String(r.changed_by_role || ''),
    changedByStore: String(r.changed_by_store || ''),
    changedByEmployeeCode: String(r.changed_by_employee_code || ''),
    changedByEmployeeId:
      r.changed_by_employee_id != null && Number.isFinite(Number(r.changed_by_employee_id))
        ? Number(r.changed_by_employee_id)
        : null,
    changeSource: String(r.change_source || ''),
    reason: String(r.reason || ''),
    beforeJson:
      r.before_json && typeof r.before_json === 'object' && !Array.isArray(r.before_json)
        ? (r.before_json as Record<string, unknown>)
        : null,
    afterJson:
      r.after_json && typeof r.after_json === 'object' && !Array.isArray(r.after_json)
        ? (r.after_json as Record<string, unknown>)
        : null,
    changedFields: Array.isArray(r.changed_fields_json)
      ? (r.changed_fields_json as Array<{ field: string; before: unknown; after: unknown }>)
      : [],
  })) as PosOrderAuditTrailRow[]
}

export async function updatePosOrderStatus(params: {
  id: number
  status: string
  grabState?: string
  /** 취소·환불 시 pos_orders.memo 에 감사 로그 한 줄 추가 */
  memoAppend?: string
  retrySideEffects?: boolean
}) {
  const res = await apiFetchWithOffline('/api/updatePosOrderStatus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<PosOrderStatusUpdateResult>
}

export type PosKitchenPrintJobClaim = {
  id: number
  order_id: number
  payload_json: Record<string, unknown> | null
}

export async function claimKitchenPrintJob(params: {
  storeCode: string
  workerId?: string
}): Promise<{ success: boolean; job: PosKitchenPrintJobClaim | null; message?: string }> {
  const res = await apiFetchWithOffline('/api/posPrintJobs/claimKitchen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; job: PosKitchenPrintJobClaim | null; message?: string }>
}

export async function markKitchenPrintJob(params: {
  jobId: number
  status: 'printed' | 'failed'
  reason?: string
}): Promise<{ success: boolean; message?: string }> {
  const res = await apiFetchWithOffline('/api/posPrintJobs/markKitchen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function grabMarkOrderReadyApi(params: { orderID: string; markStatus: 1 | 2 }) {
  const res = await apiFetchWithOffline('/api/grab/markOrderReady', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function grabCancelOrderByStoreApi(params: {
  orderID: string
  storeCode?: string
  merchantID?: string
  cancelCode?: 1001 | 1002 | 1003 | 1004
}) {
  const res = await apiFetchWithOffline('/api/grab/cancelOrderByStore', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function markPosOrderItemServed(params: {
  id: number
  itemId: string
  served: boolean
  mode?: 'served' | 'packed'
  childKey?: string
  servedBy?: string
  cancelled?: boolean
  cancelledBy?: string
  cancelReason?: string
}) {
  const res = await apiFetchWithOffline('/api/markPosOrderItemServed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    servedCount?: number
    totalCount?: number
    cancelledCount?: number
    childServedCount?: number
    childTotalCount?: number
  }>
}

export type LinkposPaymentSummary = {
  provider: 'kbtg_linkpos'
  mode: 'hypercom'
  txCode: '20' | '26' | '50'
  bankId: string
  responseCode: string
  approvalCode?: string
  traceNo?: string
  refNo?: string
  terminalId?: string
  merchantId?: string
  reference1: string
  requestedAmount: number
  approvedAmount: number
  requestedAt: string
  respondedAt: string
}

export type KbankQrGenerateResult = {
  success: boolean
  partnerTransactionId?: string
  statusCode?: string | null
  statusMessage?: string | null
  requestedQrType?: string | null
  sentQrTypeCode?: string | null
  bankQrTypeCode?: string | null
  bankSof?: string | null
  displayQrType?: 'THAI_QR' | 'CREDIT_CARD' | null
  displayQrTypeSource?: 'bank_qr_type' | 'bank_sof' | 'emv_payload' | 'requested' | null
  qrTypeMismatch?: boolean
  terminalIdIncluded?: boolean
  requestMessage?: Record<string, unknown> | null
  responseMessage?: unknown
  data?: Record<string, unknown>
  message?: string
}

export type KbankQrCheckStatusResult = {
  success: boolean
  partnerTransactionId?: string | null
  originalTransactionId?: string | null
  refId?: string | null
  statusCode?: string | null
  statusMessage?: string | null
  status?: string | null
  data?: Record<string, unknown>
  message?: string
}

export type KbankQrActionResult = {
  success: boolean
  partnerTransactionId?: string | null
  originalTransactionId?: string | null
  refId?: string | null
  statusCode?: string | null
  statusMessage?: string | null
  data?: Record<string, unknown>
  message?: string
}

const LOCAL_LINKPOS_TX_ENDPOINTS = [
  'http://127.0.0.1:18181/linkpos/transaction',
  'http://localhost:18181/linkpos/transaction',
  'http://127.0.0.1:17888/linkpos/transaction',
  'http://localhost:17888/linkpos/transaction',
]

async function postJsonWithTimeout(
  url: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(800, timeoutMs))
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return { ok: false, error: String(data?.message || `HTTP ${res.status}`) }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: String(e) }
  } finally {
    clearTimeout(timer)
  }
}

export async function executeLinkposPayment(params: {
  amount: number
  bankId: string
  reference1: string
  reference2?: string
  storeCode: string
  timeoutMs?: number
}) {
  if (!isLinkposCardApiEnabled()) {
    return {
      success: true as const,
      payment: null as LinkposPaymentSummary | null,
      source: 'disabled' as const,
    }
  }

  const timeoutMs = Math.max(2000, Number(params.timeoutMs ?? 12000))
  const payload = {
    action: 'sale',
    amount: Number(params.amount),
    bankId: String(params.bankId || ''),
    reference1: String(params.reference1 || '').slice(0, 20),
    reference2: String(params.reference2 || '').slice(0, 20),
    storeCode: String(params.storeCode || ''),
    protocol: 'hypercom_v2',
  }

  // Hybrid #1: POS 로컬 브리지 우선
  for (const endpoint of LOCAL_LINKPOS_TX_ENDPOINTS) {
    const r = await postJsonWithTimeout(endpoint, payload, timeoutMs)
    if (!r.ok) continue
    if (r.data?.success) {
      return {
        success: true,
        payment: (r.data.payment || null) as LinkposPaymentSummary | null,
        source: 'local' as const,
      }
    }
  }

  // Hybrid #2: 서버 중계 fallback
  const res = await apiFetchWithOffline('/api/linkpos/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.success) {
    return {
      success: false,
      message: String(data?.message || data?.code || `HTTP ${res.status}`),
      source: 'server' as const,
    }
  }
  return {
    success: true,
    payment: (data.payment || null) as LinkposPaymentSummary | null,
    source: 'server' as const,
  }
}

export async function executeLinkposDisplayQr(params: {
  qrPayload: string
  amount?: number
  reference1?: string
  reference2?: string
  storeCode?: string
  timeoutMs?: number
}): Promise<{ success: boolean; source?: 'local'; message?: string }> {
  if (!isLinkposCardApiEnabled()) {
    return { success: false, message: 'linkpos_card_api_disabled' }
  }
  const qrPayload = String(params.qrPayload || '').trim()
  if (!qrPayload) return { success: false, message: 'qr_payload_required' }
  const timeoutMs = Math.max(800, Number(params.timeoutMs ?? 2000))
  const payload = {
    action: 'display_qr',
    qrPayload,
    amount: Number(params.amount ?? 0),
    reference1: String(params.reference1 || '').slice(0, 20),
    reference2: String(params.reference2 || '').slice(0, 20),
    storeCode: String(params.storeCode || ''),
    protocol: 'hypercom_v2',
  }
  for (const endpoint of LOCAL_LINKPOS_TX_ENDPOINTS) {
    const r = await postJsonWithTimeout(endpoint, payload, timeoutMs)
    if (!r.ok) continue
    if (r.data?.success) return { success: true, source: 'local' as const }
  }
  return { success: false, message: 'linkpos_display_qr_not_supported' }
}

export async function executeKbankGenerateQr(params: {
  amount: number
  qrType?: string
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  reference1?: string
  reference2?: string
  reference3?: string
  reference4?: string
  terminalId?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrGenerateResult> {
  const terminalId = String(params.terminalId || '').trim()
  const payload = {
    ...(params.payload || {}),
    ...(terminalId ? { terminalId } : {}),
  }
  const res = await apiFetch('/api/pos/kbank/generate-qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      ...(terminalId ? { terminalId } : {}),
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const meta = {
    requestedQrType: data.requestedQrType != null ? String(data.requestedQrType) : null,
    sentQrTypeCode: data.sentQrTypeCode != null ? String(data.sentQrTypeCode) : null,
    bankQrTypeCode: data.bankQrTypeCode != null ? String(data.bankQrTypeCode) : null,
    bankSof: data.bankSof != null ? String(data.bankSof) : null,
    displayQrType:
      data.displayQrType === 'CREDIT_CARD' || data.displayQrType === 'THAI_QR'
        ? (data.displayQrType as 'THAI_QR' | 'CREDIT_CARD')
        : null,
    displayQrTypeSource:
      data.displayQrTypeSource === 'bank_qr_type' ||
      data.displayQrTypeSource === 'bank_sof' ||
      data.displayQrTypeSource === 'emv_payload' ||
      data.displayQrTypeSource === 'requested'
        ? (data.displayQrTypeSource as 'bank_qr_type' | 'bank_sof' | 'emv_payload' | 'requested')
        : null,
    qrTypeMismatch: data.qrTypeMismatch === true,
    terminalIdIncluded: data.terminalIdIncluded === true,
    requestMessage:
      data.requestMessage && typeof data.requestMessage === 'object'
        ? (data.requestMessage as Record<string, unknown>)
        : null,
    responseMessage: data.responseMessage ?? null,
  }
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
      ...meta,
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
    ...meta,
  }
}

export async function executeKbankCheckStatus(params: {
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  originalTransactionId?: string
  refId?: string
  terminalId?: string
  txnNo?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrCheckStatusResult> {
  const res = await apiFetch('/api/pos/kbank/check-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      originalTransactionId: String(data.originalTransactionId || params.originalTransactionId || ''),
      refId: String(data.refId || params.refId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      status: String(data.status || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    originalTransactionId: String(data.originalTransactionId || ''),
    refId: String(data.refId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    status: String(data.status || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
  }
}

export async function executeKbankCancelQr(params: {
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  partnerTxnUid?: string
  originalTransactionId?: string
  origPartnerTxnUid?: string
  refId?: string
  terminalId?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrActionResult> {
  const terminalId = String(params.terminalId || '').trim()
  const origPartnerTxnUid = String(
    params.origPartnerTxnUid || params.originalTransactionId || params.partnerTransactionId || ''
  ).trim()
  const payload = {
    ...(params.payload || {}),
    ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
    ...(terminalId ? { terminalId } : {}),
    ...(String(params.partnerTxnUid || '').trim()
      ? { partnerTxnUid: String(params.partnerTxnUid).trim() }
      : {}),
  }
  const res = await apiFetch('/api/pos/kbank/cancel-qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      origPartnerTxnUid: origPartnerTxnUid || undefined,
      originalTransactionId: origPartnerTxnUid || params.originalTransactionId || undefined,
      ...(terminalId ? { terminalId } : {}),
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      originalTransactionId: String(data.originalTransactionId || params.originalTransactionId || ''),
      refId: String(data.refId || params.refId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    originalTransactionId: String(data.originalTransactionId || ''),
    refId: String(data.refId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
  }
}

export async function executeKbankVoidPayment(params: {
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  partnerTxnUid?: string
  originalTransactionId?: string
  origPartnerTxnUid?: string
  refId?: string
  terminalId?: string
  txnNo?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrActionResult> {
  const terminalId = String(params.terminalId || '').trim()
  const txnNo = String(params.txnNo || '').trim()
  const origPartnerTxnUid = String(
    params.origPartnerTxnUid || params.originalTransactionId || params.partnerTransactionId || ''
  ).trim()
  const payload = {
    ...(params.payload || {}),
    ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
    ...(terminalId ? { terminalId } : {}),
    ...(txnNo ? { txnNo } : {}),
    ...(String(params.partnerTxnUid || '').trim()
      ? { partnerTxnUid: String(params.partnerTxnUid).trim() }
      : {}),
  }
  const res = await apiFetch('/api/pos/kbank/void-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      origPartnerTxnUid: origPartnerTxnUid || undefined,
      originalTransactionId: origPartnerTxnUid || params.originalTransactionId || undefined,
      txnNo: txnNo || undefined,
      ...(terminalId ? { terminalId } : {}),
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      originalTransactionId: String(data.originalTransactionId || params.originalTransactionId || ''),
      refId: String(data.refId || params.refId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    originalTransactionId: String(data.originalTransactionId || ''),
    refId: String(data.refId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
  }
}

export async function executeKbankSettlement(params: {
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  partnerTxnUid?: string
  originalTransactionId?: string
  refId?: string
  terminalId?: string
  qrType?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrActionResult> {
  const terminalId = String(params.terminalId || '').trim()
  const qrType = String(params.qrType || 'THAI_QR').trim()
  const payload = {
    ...(params.payload || {}),
    ...(terminalId ? { terminalId } : {}),
    qrType,
    ...(String(params.partnerTxnUid || '').trim()
      ? { partnerTxnUid: String(params.partnerTxnUid).trim() }
      : {}),
  }
  const res = await apiFetch('/api/pos/kbank/settlement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      qrType,
      ...(terminalId ? { terminalId } : {}),
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      originalTransactionId: String(data.originalTransactionId || params.originalTransactionId || ''),
      refId: String(data.refId || params.refId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    originalTransactionId: String(data.originalTransactionId || ''),
    refId: String(data.refId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
  }
}

export async function executeLinkposPaymentServer(params: {
  amount: number
  bankId: string
  reference1: string
  reference2?: string
  storeCode: string
  orderId?: number
  retryOfAttemptId?: number
  retryOfLocalTxId?: string
  timeoutMs?: number
}) {
  if (!isLinkposCardApiEnabled()) {
    return {
      success: false as const,
      message: 'linkpos_card_api_disabled',
      source: 'disabled' as const,
    }
  }

  const payload = {
    action: 'sale',
    amount: Number(params.amount),
    bankId: String(params.bankId || ''),
    reference1: String(params.reference1 || '').slice(0, 20),
    reference2: String(params.reference2 || '').slice(0, 20),
    storeCode: String(params.storeCode || ''),
    orderId: params.orderId != null ? Number(params.orderId) : undefined,
    retryOfAttemptId: params.retryOfAttemptId != null ? Number(params.retryOfAttemptId) : undefined,
    retryOfLocalTxId: params.retryOfLocalTxId ? String(params.retryOfLocalTxId).slice(0, 20) : undefined,
    protocol: 'hypercom_v2',
    timeoutMs: params.timeoutMs != null ? Number(params.timeoutMs) : undefined,
  }
  const res = await apiFetchWithOffline('/api/linkpos/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.success) {
    return {
      success: false,
      message: String(data?.message || data?.code || `HTTP ${res.status}`),
      source: 'server' as const,
    }
  }
  return {
    success: true,
    payment: (data.payment || null) as LinkposPaymentSummary | null,
    source: 'server' as const,
  }
}

export async function savePosOrder(params: {
  storeCode?: string
  /** 주문 접수·결제한 담당자(담당자별 조회용) */
  createdBy?: string
  orderType?: string
  tableName?: string
  memo?: string
  discountAmt?: number
  discountReason?: string
  serviceAmt?: number
  serviceReason?: string
  deliveryFee?: number
  packagingFee?: number
  paymentCash?: number
  paymentCashTendered?: number
  paymentCard?: number
  paymentQr?: number
  paymentOther?: number
  paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
  paymentDeliveryApp?: number
  deliveryPaymentChannel?: string | null
  memberId?: number
  memberNo?: string
  couponCode?: string
  couponDiscountAmt?: number
  appliedCoupons?: PosAppliedCoupon[]
  pointUsed?: number
  pointEarned?: number
  /** 홀 dine_in 시 권장. 미입력 시 0 */
  guestCount?: number
  /** 배달 주문 시 pos_orders.delivery_app_code (예: grab, lineman) */
  deliveryAppCode?: string
  /**
   * 클라이언트 멱등 키(선택). 있으면 `X-Idempotency-Key`·바디 `localOrderNo`로 전달되어 동일 제출 중복 저장을 막는다.
   */
  localOrderNo?: string
  /**
   * 결제 합계가 total 에 도달할 때 저장 직후 주문 상태 (오프라인 동기화 시 updatePosOrderStatus 생략용).
   * 서버에서 payment 합계·total 로 검증 후 적용.
   */
  closeStatus?: 'paid' | 'completed'
  /** 카드 승인 완료 메타 (KBTG LINKPOS) */
  linkposPayment?: LinkposPaymentSummary | null
  /** KBank QR 생성 시 발급된 partnerTransactionId (주문 저장 후 결제 시도 연결용) */
  kbankPartnerTransactionId?: string | null
  pricingAdjustments?: {
    vatRate?: number
    vatMode?: 'included' | 'separate'
    serviceRate?: number
    serviceMode?: 'included' | 'separate'
    cardRate?: number
    cardMode?: 'included' | 'separate'
    cardBaseMode?: 'card_only' | 'card_plus_vat' | 'card_plus_vat_service'
    otherRate?: number
    otherMode?: 'included' | 'separate'
  }
  items: PosOrderItem[]
}) {
  const idem = String(params.localOrderNo ?? '').trim()
  const res = await apiFetchWithOffline('/api/savePosOrder', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idem ? { 'X-Idempotency-Key': idem } : {}),
    },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; orderId?: number; orderNo?: string; message?: string }>
}

export interface PosTaxInvoiceRecipientRow {
  id: string
  /** 전 매장 공유 마스터는 `__shared__` */
  store_code: string
  member_id: number | null
  member_no: string | null
  customer_type: 'person' | 'company'
  name: string
  tax_id: string
  branch_no: string
  phone: string
  phone_normalized: string
  email: string
  address: string
  is_active: boolean
  notes: string | null
  source: string | null
  created_at: string
  updated_at: string
  last_used_at: string | null
}

/** 세금계산서 수취인 검색·목록 (관리자·POS) */
export async function getPosTaxInvoiceRecipients(params: {
  userStore: string
  userRole: string
  storeCode?: string
  q?: string
  by?: 'phone' | 'taxId' | 'name' | 'memberNo'
  limit?: number
}) {
  const q = new URLSearchParams()
  q.set('userStore', params.userStore)
  q.set('userRole', params.userRole)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  if (params.q) q.set('q', params.q)
  if (params.by) q.set('by', params.by)
  if (params.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetch(`/api/posTaxInvoiceRecipients?${q}`)
  return res.json() as Promise<{
    success: boolean
    rows?: PosTaxInvoiceRecipientRow[]
    message?: string
  }>
}

/** 세금계산서 수취인 upsert (POS 결제 등) — 오프라인 시 큐 */
export async function upsertPosTaxInvoiceRecipient(params: {
  userStore: string
  userRole: string
  storeCode: string
  memberId?: number | null
  memberNo?: string | null
  customerType: 'person' | 'company'
  name: string
  taxId: string
  branchNo: string
  phone: string
  email: string
  address: string
  source?: string
}) {
  const res = await apiFetchWithOffline('/api/posTaxInvoiceRecipients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    row?: PosTaxInvoiceRecipientRow
    message?: string
  }>
}

/** 관리자: 수취인 수정·비활성화 */
export async function patchPosTaxInvoiceRecipient(params: {
  userStore: string
  userRole: string
  id: string
  is_active?: boolean
  notes?: string | null
  name?: string
  taxId?: string
  branchNo?: string
  phone?: string
  email?: string
  address?: string
  customerType?: 'person' | 'company'
  member_id?: number | null
  member_no?: string | null
}) {
  const res = await apiFetch('/api/posTaxInvoiceRecipients', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    row?: PosTaxInvoiceRecipientRow
    message?: string
  }>
}

export async function getLineMembers(params?: { q?: string; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const suffix = q.toString()
  const res = await apiFetchWithOffline('/api/members/line' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<Array<{
    member: Member
    identity: {
      id: number
      providerUserId: string
      displayName: string
      pictureUrl: string
      status: string
      linkedAt: string
      lastSeenAt: string
    }
  }>>
}

export async function linkMemberLine(params: {
  memberId: number
  lineUserId: string
  displayName?: string
  pictureUrl?: string
}) {
  const res = await apiFetchWithOffline(`/api/members/${params.memberId}/link-line`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function unlinkMemberLine(params: { memberId: number; lineUserId?: string }) {
  const res = await apiFetchWithOffline(`/api/members/${params.memberId}/unlink-line`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getLineMessagingStatus() {
  const res = await apiFetchWithOffline('/api/members/line-messaging-status')
  return res.json() as Promise<{
    channelAccessTokenConfigured: boolean
    channelSecretConfigured: boolean
  }>
}

export async function syncLineMembers(params?: { limit?: number }) {
  const res = await apiFetchWithOffline('/api/members/line-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: params?.limit ?? 2000 }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    scanned?: number
    synced?: number
    syncedWithProfile?: number
    syncedStubOnly?: number
    failed?: number
    hasNextCursor?: boolean
    nextCursor?: string
    errors?: string[]
  }>
}

export async function importLineCrmFile(params: { file: File }) {
  const form = new FormData()
  form.set('file', params.file)
  const res = await apiFetchWithOffline('/api/members/line-import', {
    method: 'POST',
    body: form,
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    jobId?: string
    reportType?: 'customer' | 'point' | 'coupon'
    rowCount?: number
    successCount?: number
    failedCount?: number
  }>
}

export async function resetLineMemberList() {
  const res = await apiFetchWithOffline('/api/members/line-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    deactivatedLineIdentities?: number
    deactivatedLineMembers?: number
    deletedImportRows?: number
    deletedImportJobs?: number
  }>
}

export async function getMemberPoints(params?: { memberId?: number; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.memberId) q.set('memberId', String(params.memberId))
  if (params?.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline('/api/member-points?' + q.toString())
  return res.json() as Promise<Array<{
    id: number
    memberId: number
    orderId: number | null
    kind: string
    points: number
    amount: number
    note: string
    createdAt: string
  }>>
}

export async function adjustMemberPoints(params: { memberId: number; points: number; note?: string }) {
  const res = await apiFetchWithOffline('/api/member-points/adjust', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getMemberTiers() {
  const res = await apiFetchWithOffline('/api/member-tiers')
  const data = (await res.json()) as
    | Array<{
        code: string
        name: string
        min_amount: number
        min_points: number
        point_rate: number
        sort_order: number
        benefits_ko?: string | null
        benefits_en?: string | null
        benefits_th?: string | null
      }>
    | {
        tiers?: Array<{
          code: string
          name: string
          min_amount: number
          min_points: number
          point_rate: number
          sort_order: number
          benefits_ko?: string | null
          benefits_en?: string | null
          benefits_th?: string | null
        }>
        upgradeBasis?: 'amount' | 'points'
      }
  if (Array.isArray(data)) return data
  return data.tiers || []
}

export async function getMemberTierPolicy() {
  const res = await apiFetchWithOffline('/api/member-tiers/policy')
  return res.json() as Promise<{ success: boolean; upgradeBasis?: 'amount' | 'points'; message?: string }>
}

export async function saveMemberTierPolicy(params: { upgradeBasis: 'amount' | 'points' }) {
  const res = await apiFetchWithOffline('/api/member-tiers/policy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; upgradeBasis?: 'amount' | 'points'; message?: string }>
}

export async function saveMemberTier(params: {
  code: string
  name: string
  minAmount: number
  minPoints?: number
  pointRate: number
  sortOrder?: number
  benefitsKo?: string
  benefitsEn?: string
  benefitsTh?: string
}) {
  const res = await apiFetchWithOffline('/api/member-tiers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function recalculateMemberTier(params?: { memberId?: number }) {
  const res = await apiFetchWithOffline('/api/member-tiers/recalculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
  })
  return res.json() as Promise<{ success: boolean; updated?: number; message?: string }>
}

export async function getMemberVisits(params?: { memberId?: number; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.memberId) q.set('memberId', String(params.memberId))
  if (params?.limit != null) q.set('limit', String(params.limit))
  const suffix = q.toString()
  const res = await apiFetchWithOffline('/api/member-visits' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<Array<{
    orderId: number
    memberId: number
    memberNo: string
    storeCode: string
    orderNo: string
    total: number
    visitedAt: string
  }>>
}

export async function getMemberCoupons(params?: {
  memberId?: number
  limit?: number
  status?: string
  couponCode?: string
  q?: string
}) {
  const q = new URLSearchParams()
  if (params?.memberId) q.set('memberId', String(params.memberId))
  if (params?.limit != null) q.set('limit', String(params.limit))
  if (params?.status) q.set('status', params.status)
  if (params?.couponCode) q.set('couponCode', params.couponCode)
  if (params?.q) q.set('q', params.q)
  const suffix = q.toString()
  const res = await apiFetchWithOffline('/api/member-coupons' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<Array<{
    id: number
    memberId: number
    memberNo?: string
    memberName?: string
    couponCode: string
    couponName?: string
    discountType?: string
    discountValue?: number
    minOrderAmt?: number
    validTo?: string
    issuedAt: string
    expiresAt?: string
    usedAt: string
    orderId: number | null
    status: string
    campaignId?: number | null
    campaignName?: string
  }>>
}

export async function issueMemberCoupon(params: { memberId: number; couponCode: string }) {
  const res = await apiFetchWithOffline('/api/member-coupons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface Member {
  id: number
  memberNo: string
  name: string
  fullName?: string
  birthDate?: string
  gender?: string
  nationality?: string
  phone: string
  email: string
  joinChannel?: string
  referredByMemberId?: number
  referralCode?: string
  consentMarketing?: boolean
  consentPrivacy?: boolean
  consentAt?: string
  source: string
  status: string
  lineLinked: boolean
  lineUserId?: string
  lineDisplayName?: string
  tierCode?: string
  pointBalance?: number
  lifetimeAmount?: number
  lastLineEventType?: string
  lastLineEventAt?: string
  lastUpdateReason?: string
  lastVisitedAt?: string
  createdAt?: string
  updatedAt?: string
}

export async function getMembersCursor(params?: { q?: string; afterId?: number; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.afterId != null) q.set('afterId', String(params.afterId))
  if (params?.limit != null) q.set('limit', String(params.limit))
  const suffix = q.toString()
  const res = await apiFetchWithOffline('/api/members/cursor' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<{ success: boolean; rows: Member[]; nextCursor: number | null; message?: string }>
}

export async function getMembers(params?: { q?: string; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const suffix = q.toString()
  const url = '/api/members' + (suffix ? `?${suffix}` : '')
  const searchQ = params?.q?.trim() || ''
  if (searchQ) {
    const res = await apiFetchWithOffline(url)
    const data = await res.json().catch(() => [])
    return Array.isArray(data) ? (data as Member[]) : []
  }
  const cacheKey = `erp:posMembers::${params?.limit ?? 'default'}`
  const list = await fetchPosCatalogCached<unknown>(cacheKey, url, [])
  return Array.isArray(list) ? (list as Member[]) : []
}

export async function createMember(params: {
  name: string
  phone?: string
  email?: string
  birthDate?: string
  gender?: string
  nationality?: string
  joinChannel?: string
  referralCode?: string
  referredByMemberId?: number
  source?: string
  lineUserId?: string
  lineDisplayName?: string
  linePictureUrl?: string
}) {
  const res = await apiFetchWithOffline('/api/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; code?: string; message?: string; member?: Member }>
}

export async function updateMember(params: {
  id: number
  name?: string
  fullName?: string
  lineDisplayName?: string
  birthDate?: string
  gender?: string
  nationality?: string
  joinChannel?: string
  referralCode?: string
  referredByMemberId?: number
  phone?: string
  email?: string
  consentMarketing?: boolean
  consentPrivacy?: boolean
  consentAt?: string
  status?: string
}) {
  const res = await apiFetchWithOffline(`/api/members/${params.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      fullName: params.fullName,
      lineDisplayName: params.lineDisplayName,
      birthDate: params.birthDate,
      gender: params.gender,
      nationality: params.nationality,
      joinChannel: params.joinChannel,
      referralCode: params.referralCode,
      referredByMemberId: params.referredByMemberId,
      phone: params.phone,
      email: params.email,
      consentMarketing: params.consentMarketing,
      consentPrivacy: params.consentPrivacy,
      consentAt: params.consentAt,
      status: params.status,
    }),
  })
  return res.json() as Promise<{ success: boolean; code?: string; message?: string; member?: Member }>
}

export async function registerLineMember(params: {
  lineUserId: string
  displayName?: string
  pictureUrl?: string
  phone?: string
  email?: string
  name?: string
}) {
  const res = await apiFetchWithOffline('/api/members/line-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; member?: Member }>
}

export async function saveVendor(params: {
  code: string
  name: string
  gps_name?: string
  sales_outlet?: string
  contact?: string
  phone?: string
  email?: string
  address?: string
  tax_no?: string
  type?: string
  memo?: string
  direct_settlement?: boolean
  editingCode?: string
}) {
  const res = await apiFetchWithOffline('/api/saveVendor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteVendor(params: { code: string }) {
  const res = await apiFetchWithOffline('/api/deleteVendor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 입고 관리 (Inbound) ───
export interface InboundHistoryItem {
  date: string
  vendor: string
  name: string
  spec: string
  qty: number
  po_no?: string | null
  invoice_no?: string | null
  invoice_received?: boolean
  amount: number
  vatAmount?: number
  inbound_batch_id?: number | null
  po_created_at?: string | null
  code?: string
  purchaseSource?: 'hq' | 'store'
  /** 통장 매입 지급만 등록된 건(stock_logs 없음) */
  bank_transaction_id?: number
  row_kind?: 'stock' | 'bank_purchase_payment'
}

export interface InboundBatchDetail {
  id: number
  location: string
  vendorName: string
  vendorCode?: string | null
  batchDate: string
  totalAmount: number
  purchaseOrderId?: number | null
  poNo?: string | null
  invoiceNo?: string | null
  invoicePhotoUrl?: string | null
  items: { code: string; name: string; spec: string; qty: number; unitCost: number; amount: number }[]
}

export async function getInboundBatch(batchId: number) {
  const res = await apiFetchWithOffline(`/api/getInboundBatch?batchId=${batchId}`)
  return res.json() as Promise<InboundBatchDetail>
}

export async function updateInboundBatch(params: {
  batchId: number
  vendorName?: string
  vendorCode?: string
  poNo?: string
  invoiceNo?: string
  invoiceReceived?: boolean
  purchaseOrderId?: number | null
}) {
  const res = await apiFetchWithOffline('/api/updateInboundBatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteInboundBatch(batchId: number) {
  const res = await apiFetchWithOffline('/api/deleteInboundBatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function registerInboundBatch(
  list: {
    date?: string
    vendor: string
    code: string
    name?: string
    spec?: string
    qty: number | string
    cost?: number | string
  }[],
  storeName?: string,
  options?: { vendorCode?: string; purchaseOrderId?: number; poNo?: string; invoiceNo?: string }
) {
  const res = await apiFetchWithOffline('/api/registerInboundBatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      list,
      storeName: storeName || undefined,
      vendorCode: options?.vendorCode || undefined,
      purchaseOrderId: options?.purchaseOrderId || undefined,
      poNo: options?.poNo || undefined,
      invoiceNo: options?.invoiceNo || undefined,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getInboundHistory(params: {
  startStr: string
  endStr: string
  vendorFilter?: string
  /** 드롭다운 미선택 시 거래처명 부분 검색 */
  vendorSearch?: string
  /** 품목 코드·품목명 부분 검색 */
  itemSearch?: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
    ...(params.vendorFilter ? { vendorFilter: params.vendorFilter } : {}),
    ...(params.vendorSearch?.trim() ? { vendorSearch: params.vendorSearch.trim() } : {}),
    ...(params.itemSearch?.trim() ? { itemSearch: params.itemSearch.trim() } : {}),
    ...(params.storeFilter ? { storeFilter: params.storeFilter } : {}),
  })
  const res = await apiFetchWithOffline(`/api/getInboundHistory?${q}`)
  return jsonAsArray<InboundHistoryItem>(await res.json())
}

export async function getInboundForStore(params: {
  storeName: string
  startStr: string
  endStr: string
  vendorFilter?: string
  vendorSearch?: string
  itemSearch?: string
}) {
  const q = new URLSearchParams({
    storeName: params.storeName,
    startStr: params.startStr,
    endStr: params.endStr,
    ...(params.vendorFilter ? { vendorFilter: params.vendorFilter } : {}),
    ...(params.vendorSearch?.trim() ? { vendorSearch: params.vendorSearch.trim() } : {}),
    ...(params.itemSearch?.trim() ? { itemSearch: params.itemSearch.trim() } : {}),
  })
  const res = await apiFetchWithOffline(`/api/getInboundForStore?${q}`)
  return jsonAsArray<InboundHistoryItem>(await res.json())
}

// ─── 출고 관리 (Outbound) ───
export interface OutboundHistoryItem {
  outboundLocation?: string
  date: string
  target: string
  type: 'Force' | 'Outbound'
  name: string
  code: string
  spec: string
  qty: number
  amount: number
  orderRowId?: string
  deliveryStatus?: string
  deliveryDate?: string
  orderDate?: string
  invoiceNo?: string
  receiveImageUrl?: string
  receiveImageUrls?: string[]
  receivedIndices?: number[]
  originalOrderQty?: number
  /** 수량 변경 이력 [원본, 승인후?, 수령후] - 3단계 표기용 */
  qtyStages?: number[]
  totalOrderItems?: number
  /** 미수령 품목 여부 (부분 배송 시 누락 품목) */
  isUnreceived?: boolean
  /** stock_logs.id — 출고 로그 단가 수정용 */
  stockLogId?: number
  /** 주문 cart line_remarks — 송장 품목 하단 */
  lineRemarks?: string
}

export type DeleteOutboundPreview = {
  success: boolean
  dryRun?: boolean
  targetCount?: number
  mode?: 'order' | 'force'
  orderId?: number
  referenceNo?: string
  orderIds?: number[]
  forceOutboundIds?: number[]
  stores?: string[]
  restoreByLocation?: Record<string, number>
  receivableDeleteByStore?: Record<string, number>
  projectedOutstandingByStore?: Record<string, number>
  /** 출고 로그 없이 승인만 된 주문 — 반려 취소 경로 */
  orderCancelWithoutOutboundLogs?: boolean
  conflicts?: { kind: 'journal_exists' | 'over_receive'; message: string; store?: string; orderId?: number }[]
  message?: string
}

export async function previewDeleteOutbound(params: {
  mode: 'order' | 'force'
  orderId?: number
  referenceNo?: string
  stockLogIds?: number[]
}) {
  const res = await apiFetchWithOffline('/api/deleteOutbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: params.mode,
      ...(params.orderId ? { orderId: params.orderId } : {}),
      ...(params.referenceNo ? { referenceNo: params.referenceNo } : {}),
      ...(params.stockLogIds?.length ? { stockLogIds: params.stockLogIds } : {}),
      dryRun: true,
    }),
  })
  return res.json() as Promise<DeleteOutboundPreview>
}

export async function deleteOutbound(params: {
  mode: 'order' | 'force'
  reason: string
  orderId?: number
  referenceNo?: string
  stockLogIds?: number[]
  idempotencyKey?: string
}) {
  const res = await apiFetchWithOffline('/api/deleteOutbound', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.idempotencyKey ? { 'x-idempotency-key': params.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      mode: params.mode,
      reason: params.reason,
      ...(params.orderId ? { orderId: params.orderId } : {}),
      ...(params.referenceNo ? { referenceNo: params.referenceNo } : {}),
      ...(params.stockLogIds?.length ? { stockLogIds: params.stockLogIds } : {}),
      ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
    }),
  })
  return res.json() as Promise<{
    success: boolean
    duplicated?: boolean
    message?: string
    deletedCount?: number
    orderCancelWithoutOutboundLogs?: boolean
    warnings?: string[]
    preview?: DeleteOutboundPreview
    conflicts?: { kind: 'journal_exists' | 'over_receive'; message: string; store?: string; orderId?: number }[]
  }>
}

export async function forceOutboundBatch(
  list: {
    date?: string
    deliveryDate?: string
    store: string
    code: string
    name?: string
    spec?: string
    qty: number | string
  }[],
  options?: { processorName?: string; referenceNo?: string }
) {
  const ref = String(options?.referenceNo ?? '').trim()
  const useObj = Boolean(options?.processorName) || ref.length > 0
  const payload = useObj
    ? {
        list,
        ...(options?.processorName ? { processorName: options.processorName } : {}),
        ...(ref ? { referenceNo: ref } : {}),
      }
    : list
  const res = await apiFetchWithOffline('/api/forceOutboundBatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 강제출고 수령 완료 처리 */
export async function updateForceOutboundReceived(params: { date: string; vendorTarget: string }) {
  const res = await apiFetchWithOffline('/api/updateForceOutboundReceived', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: params.date, vendorTarget: params.vendorTarget }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getCombinedOutboundHistory(params: {
  startStr: string
  endStr: string
  vendorFilter?: string
  typeFilter?: string
  /** 출고 로그 품목코드·품목명 부분 검색 */
  itemSearch?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.vendorFilter) q.set('vendorFilter', params.vendorFilter)
  if (params.typeFilter) q.set('typeFilter', params.typeFilter)
  if (params.itemSearch?.trim()) q.set('itemSearch', params.itemSearch.trim())
  const res = await apiFetchWithOffline(`/api/getCombinedOutboundHistory?${q}`)
  return jsonAsArray<OutboundHistoryItem>(await res.json())
}

export type OutboundStoreMonthAmountCell = {
  subtotal: number
  vat: number
  grandTotal: number
}

export type OutboundStoreMonthMatrixResult = {
  year: number
  months: string[]
  stores: string[]
  cells: Record<string, Record<string, OutboundStoreMonthAmountCell>>
  rowTotals: Record<string, OutboundStoreMonthAmountCell>
  colTotals: Record<string, OutboundStoreMonthAmountCell>
  grandTotal: OutboundStoreMonthAmountCell
  hitRowCap: boolean
  lineCount: number
}

/** 출고 관리 — 매장×월별 금액 행렬 (공급가·VAT·합계, stock_logs 기준) */
export async function getOutboundStoreMonthMatrix(params: {
  year: number
  storeFilter?: string
  knownStores?: string[]
}) {
  const q = new URLSearchParams({ year: String(params.year) })
  if (params.storeFilter?.trim()) q.set('storeFilter', params.storeFilter.trim())
  if (params.knownStores?.length) q.set('knownStores', params.knownStores.join(','))
  const res = await apiFetchWithOffline(`/api/getOutboundStoreMonthMatrix?${q}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<OutboundStoreMonthMatrixResult>
}

/** 출고 로그(stock_logs) 확정 단가·수량 수정 — 본사 권한, orders 미변경 */
export async function patchStockLogInvoiceUnitPrice(params: {
  stockLogId: number
  invoiceUnitPrice: number
  /** 절대수량(양수). 지정 시 stock_logs.qty 갱신(부호는 기존 행 유지) */
  qtyAbs?: number
}) {
  const res = await apiFetchWithOffline('/api/patchStockLogInvoiceUnitPrice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stockLogId: params.stockLogId,
      invoiceUnitPrice: params.invoiceUnitPrice,
      ...(params.qtyAbs != null ? { qtyAbs: params.qtyAbs } : {}),
    }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    receivableSync?: { ran: boolean; ok?: boolean; message?: string }
  }>
}

/** 주문 수령 사진 온디맨드 조회 (출고 내역에서 사진 클릭 시) */
export async function getOrderReceivePhoto(orderId: string) {
  const res = await apiFetchWithOffline(`/api/getOrderReceivePhoto?orderId=${encodeURIComponent(orderId)}`)
  const data = (await res.json()) as { urls?: string[] }
  return { urls: data.urls ?? [] }
}

/** e-Tax 인보이스 XML 생성 */
export interface EtaxGroupInput {
  date: string
  target: string
  type: string
  orderRowId?: string
  invoiceNo?: string
  items: { name: string; code?: string; spec?: string; qty: number; amount: number }[]
  totalAmt: number
}

export async function generateEtaxXmlApi(groups: EtaxGroupInput[], sign = false) {
  const res = await apiFetchWithOffline('/api/generateEtaxXml', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groups, sign }),
  })
  return res.json() as Promise<{
    success?: boolean
    error?: string
    count?: number
    results?: { refKey: string; invoiceNo: string }[]
    xml?: string | null
    xmls?: { refKey: string; invoiceNo: string; xml: string }[]
  }>
}

export interface WarehouseOutboundRow {
  store: string
  code: string
  name: string
  spec: string
  qty: number
  deliveryDate: string
  source: 'Order' | 'Force'
}

export interface GetOutboundByWarehouseResult {
  byWarehouse: Record<string, WarehouseOutboundRow[]>
  warehouseOrder: string[]
  period: { start: string; end: string }
  filterBy: 'order' | 'delivery'
}

export async function getOutboundByWarehouse(params: {
  startStr: string
  endStr: string
  filterBy?: 'order' | 'delivery'
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.filterBy) q.set('filterBy', params.filterBy)
  const res = await apiFetchWithOffline(`/api/getOutboundByWarehouse?${q}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<GetOutboundByWarehouseResult>
}

export interface InvoiceDataCompany {
  companyName: string
  address: string
  taxId: string
  phone: string
  bankInfo: string
  projectName?: string
}

export interface InvoiceDataClient {
  companyName: string
  address: string
  taxId: string
  phone: string
}

export async function getInvoiceData() {
  const res = await apiFetchWithOffline('/api/getInvoiceData')
  return res.json() as Promise<{ company: InvoiceDataCompany; clients: Record<string, InvoiceDataClient> }>
}

/** 출고 인보이스: 주문별 BILL TO 매칭용 후보 문자열(store_name + cart vendor) */
export async function getInvoiceOrderBillToCandidates(orderIds: number[]) {
  const res = await apiFetchWithOffline('/api/getInvoiceOrderBillToCandidates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderIds }),
  })
  return res.json() as Promise<{
    map: Record<string, string[]>
    taxInvoiceClientMap: Record<string, InvoiceDataClient>
  }>
}

export type InvoiceSettings = Record<string, string>

export async function getInvoiceSettings() {
  const res = await apiFetchWithOffline('/api/getInvoiceSettings')
  return res.json() as Promise<InvoiceSettings>
}

export async function updateInvoiceSettings(settings: InvoiceSettings) {
  const res = await apiFetchWithOffline('/api/updateInvoiceSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type InvoicePrintOverrideRef = {
  refType: string
  refId: number
  docKind?: "invoice" | "tax"
}

export type InvoicePrintOverridePayload = InvoicePrintOverrideRef & {
  issueDate?: string
  dueDate?: string
  referenceNo?: string
  documentNo?: string
  shipTo?: string
}

export async function getInvoicePrintOverrides(refs: InvoicePrintOverrideRef[]) {
  const res = await apiFetchWithOffline('/api/getInvoicePrintOverrides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refs }),
  })
  return res.json() as Promise<{
    success: boolean
    map: Record<
      string,
      {
        issueDate?: string
        dueDate?: string
        referenceNo?: string
        documentNo?: string
        shipTo?: string
        updatedAt?: string
      }
    >
    message?: string
  }>
}

export async function updateInvoicePrintOverrides(items: InvoicePrintOverridePayload[]) {
  const res = await apiFetchWithOffline('/api/updateInvoicePrintOverrides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  return res.json() as Promise<{ success: boolean; saved?: number; message?: string }>
}

// ─── 직원 관리 (Employees) ───
export interface AdminEmployeeItem {
  row: number
  store: string
  name: string
  /** Mr./Mrs./Ms./Miss — nick과 별도 저장 */
  nameTitle?: string
  /** 직원 코드(휴가·표시용). 형식 AA999, 비우면 매장별 자동 부여 */
  employeeCode?: string
  nick: string
  phone: string
  job: string
  birth: string
  nation: string
  join: string
  resign: string
  /** 재직 상태. 미전달 시 resign 기준으로 서버 추론 */
  employmentStatus?: 'active' | 'leave' | 'resigned' | 'suspended'
  /** 소프트 삭제 시각 (있으면 목록에서 제외) */
  deletedAt?: string
  salType: string
  salAmt: number
  pw: string
  role: string
  email: string
  idNumber: string
  idCardPhoto: string
  taxId: string
  ssoNumber: string
  /** true면 급여 SSO 공제 0 + PND3용 3% 원천세 대상 */
  ssoExempt?: boolean
  address: string
  bankName: string
  accountNumber: string
  positionAllowance: number
  riskAllowance: number
  /** 근면수당(바트/월). 0=미적용. 비어 있으면 서버/폼 기본 500 */
  attendanceAllowance: number
  grade: string
  photo: string
  /** 가맹점주 추가 매장 (대표 store 제외) */
  extraStores?: string[]
}

export type FranchiseeMultiStoreSettings = {
  enabled: boolean
  maxStores: number
}

export async function getEmployeeJobCatalog() {
  const res = await apiFetchWithOffline('/api/employeeJobCatalog')
  const data = await res.json()
  return {
    catalog: (data.catalog || []) as string[],
    jobsInUseOutsideCatalog: (data.jobsInUseOutsideCatalog || []) as string[],
    canEdit: Boolean(data.canEdit),
  }
}

export async function saveEmployeeJobCatalog(jobs: string[]) {
  const res = await apiFetchWithOffline('/api/employeeJobCatalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobs }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type FranchiseeMultiStoreSettingsResponse = {
  success?: boolean
  settings?: FranchiseeMultiStoreSettings
  message?: string
}

/** 네트워크 단절·DNS 등으로 fetch 자체가 실패할 때 TypeError를 삼키고 호출부 런타임 오류를 막음 */
export async function getFranchiseeMultiStoreSettings(): Promise<FranchiseeMultiStoreSettingsResponse> {
  try {
    const res = await apiFetch('/api/franchiseeMultiStoreSettings')
    const data = (await res.json().catch(() => ({}))) as FranchiseeMultiStoreSettingsResponse
    return data && typeof data === 'object' ? data : {}
  } catch {
    return { success: false, message: 'network_unavailable' }
  }
}

export type FranchiseeMultiStoreRosterItem = {
  row: number
  store: string
  name: string
  nick: string
  role: string
  extraStores: string[]
}

export type FranchiseeMultiStoreRosterResponse = {
  success?: boolean
  settings?: FranchiseeMultiStoreSettings
  roster?: FranchiseeMultiStoreRosterItem[]
  stores?: string[]
  saved?: number
  message?: string
}

export async function getFranchiseeMultiStoreRoster(): Promise<FranchiseeMultiStoreRosterResponse> {
  try {
    const res = await apiFetch('/api/franchiseeMultiStoreRoster')
    const data = (await res.json().catch(() => ({}))) as FranchiseeMultiStoreRosterResponse
    const out = data && typeof data === 'object' ? data : {}
    if (!res.ok && out.success !== false) {
      return { success: false, message: out.message || `HTTP ${res.status}` }
    }
    return out
  } catch {
    return { success: false, message: 'network_unavailable' }
  }
}

export async function saveFranchiseeMultiStoreRoster(
  assignments: { employeeId: number; extraStores: string[] }[],
  options?: { syncSettings?: FranchiseeMultiStoreSettings }
): Promise<FranchiseeMultiStoreRosterResponse> {
  try {
    const res = await apiFetch('/api/franchiseeMultiStoreRoster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignments,
        ...(options?.syncSettings
          ? {
              settings: {
                enabled: options.syncSettings.enabled === true,
                maxStores: options.syncSettings.maxStores,
              },
            }
          : {}),
      }),
    })
    const data = (await res.json().catch(() => ({}))) as FranchiseeMultiStoreRosterResponse
    const out = data && typeof data === 'object' ? data : {}
    if (!res.ok && out.success !== false) {
      return { success: false, message: out.message || `HTTP ${res.status}` }
    }
    return out
  } catch {
    return { success: false, message: 'network_unavailable' }
  }
}

export async function saveFranchiseeMultiStoreSettings(
  settings: FranchiseeMultiStoreSettings
): Promise<FranchiseeMultiStoreSettingsResponse> {
  try {
    const res = await apiFetch('/api/franchiseeMultiStoreSettings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    const data = (await res.json().catch(() => ({}))) as FranchiseeMultiStoreSettingsResponse
    return data && typeof data === 'object' ? data : {}
  } catch {
    return { success: false, message: 'network_unavailable' }
  }
}

export async function getAdminEmployeeList(params: {
  userStore: string
  userRole: string
  forPettyTransfer?: boolean
  search?: string
  status?: string
  store?: string
  job?: string
  page?: number
  pageSize?: number
}) {
  const q = new URLSearchParams({
    userStore: params.userStore,
    userRole: params.userRole,
  })
  if (params.forPettyTransfer) q.set('forPettyTransfer', '1')
  if (params.search) q.set('search', params.search)
  if (params.status) q.set('status', params.status)
  if (params.store) q.set('store', params.store)
  if (params.job) q.set('job', params.job)
  if (params.page && Number.isFinite(params.page)) q.set('page', String(Math.trunc(params.page)))
  if (params.pageSize && Number.isFinite(params.pageSize)) q.set('pageSize', String(Math.trunc(params.pageSize)))
  const res = await apiFetchWithOffline(`/api/getAdminEmployeeList?${q}`)
  const data = await res.json()
  return {
    list: (data.list || []) as AdminEmployeeItem[],
    stores: (data.stores || []) as string[],
    jobOptions: (data.jobOptions || []) as string[],
    _debug: data._debug as Record<string, unknown> | undefined,
  }
}

export async function getEmployeeLatestGrades() {
  const res = await apiFetchWithOffline('/api/getEmployeeLatestGrades')
  return res.json() as Promise<
    Record<
      string,
      {
        grade: string
        kitchenGrade?: string
        serviceGrade?: string
        managerGrade?: string
        latestAny?: string
      }
    >
  >
}

export async function saveAdminEmployee(params: {
  d: (Partial<AdminEmployeeItem> & { row: number }) & { changeReason?: string }
  userStore: string
  userRole: string
  userName?: string
  /** 본사만: 가맹점주 추가 매장 */
  extraStores?: string[]
}) {
  const res = await apiFetchWithOffline('/api/saveAdminEmployee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteAdminEmployee(params: {
  r: number
  userStore: string
  userRole: string
  reason?: string
}) {
  const res = await apiFetchWithOffline('/api/deleteAdminEmployee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface EmployeeInputAuditChange {
  field: string
  oldValue: string
  newValue: string
}

export interface EmployeeInputAuditRow {
  id: number
  actionType: string
  changedAt: string
  actorName: string | null
  actorRole: string | null
  actorStore: string | null
  actorEmployeeCode: string | null
  employeeId: number | null
  employeeCode: string | null
  employeeName: string | null
  employeeStore: string | null
  changeReason: string | null
  changes: EmployeeInputAuditChange[]
  changeCount: number
}

export async function getEmployeeInputAudit(params?: {
  limit?: number
  startDate?: string
  endDate?: string
}): Promise<EmployeeInputAuditRow[]> {
  const qs = new URLSearchParams()
  if (params?.limit != null) qs.set('limit', String(params.limit))
  if (params?.startDate) qs.set('startDate', params.startDate)
  if (params?.endDate) qs.set('endDate', params.endDate)
  const q = qs.toString() ? `?${qs.toString()}` : ''
  const res = await apiFetch(`/api/getEmployeeInputAudit${q}`)
  const data = await res.json().catch(() => [])
  if (!res.ok) return []
  return Array.isArray(data) ? (data as EmployeeInputAuditRow[]) : []
}

export interface StoreJobHeadcountRow {
  store: string
  job: string
  target_count: number
  updated_at?: string
}

export async function getStoreJobHeadcount(params?: { store?: string }) {
  const q = new URLSearchParams()
  if (params?.store) q.set('store', params.store)
  const qs = q.toString()
  const res = await apiFetchWithOffline(`/api/getStoreJobHeadcount${qs ? `?${qs}` : ''}`)
  const data = await res.json()
  return {
    list: (data.list || []) as StoreJobHeadcountRow[],
    _note: data._note as string | undefined,
  }
}

export async function saveStoreJobHeadcount(params: { store: string; rows: { job: string; target_count: number }[] }) {
  const res = await apiFetchWithOffline('/api/saveStoreJobHeadcount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 평가 항목 조회 (kitchen | service | manager) */
export async function getEvaluationItems(params: {
  type: 'kitchen' | 'service' | 'manager'
  activeOnly?: boolean
}) {
  const q = new URLSearchParams({
    type: params.type,
    activeOnly: String(params.activeOnly === true),
  })
  const res = await apiFetchWithOffline(`/api/getEvaluationItems?${q}`)
  return res.json() as Promise<
    { id: string | number; main: string; sub: string; name: string; use?: boolean; sort_order?: number }[]
  >
}

/** evaluation_results 에 저장된 매장명 목록 (RPC 미배포 시 빈 배열) */
export async function getEvaluationDistinctStores(): Promise<{ stores: string[] }> {
  const res = await apiFetchWithOffline('/api/getEvaluationDistinctStores')
  if (!res.ok) return { stores: [] }
  return res.json() as Promise<{ stores: string[] }>
}

/** 평가 이력 조회 */
/** GET /api/getWarningLettersFromEvaluations — 평가 JSON에서 펼친 경고서 행 목록 */
export type WarningLetterRegistryRow = {
  id: number
  store_name: string
  employee_name: string
  incident_date: string | null
  incident_type: string
  details: string
  warning_letter_url: string | null
  evaluator_name: string
  approval_status: 'draft' | 'pending' | 'approved' | 'rejected'
  approved_by: string | null
  approved_at: string | null
  rejected_reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type WarningLetterIncidentItem = {
  source?: 'evaluation' | 'registry'
  registryId?: number
  /** 직접 등록 건 등록자(표시명) — 재상신 버튼 노출 판단 등 */
  createdBy?: string
  approvalStatus?: 'draft' | 'pending' | 'approved' | 'rejected'
  rejectedReason?: string
  evaluationId: string
  evalDate: string
  evalType: 'kitchen' | 'service' | 'manager' | 'standalone'
  store: string
  employeeName: string
  evaluator: string
  finalGrade: string
  incidentIndex: number
  incidentType: string
  incidentDate: string
  details: string
  warningLetterChecked: boolean
  warningLetterUrl: string
}

export function mapWarningRegistryRowToIncident(row: WarningLetterRegistryRow): WarningLetterIncidentItem {
  const st = row.approval_status
  return {
    source: 'registry',
    registryId: row.id,
    createdBy: row.created_by ? String(row.created_by) : undefined,
    evaluationId: '',
    evalDate: String(row.incident_date || row.created_at || '').slice(0, 10),
    evalType: 'standalone',
    store: row.store_name,
    employeeName: row.employee_name,
    evaluator: row.evaluator_name,
    finalGrade: '',
    incidentIndex: 0,
    incidentType: row.incident_type,
    incidentDate: String(row.incident_date || '').slice(0, 10),
    details: row.details,
    warningLetterChecked:
      st === 'approved' || Boolean(String(row.warning_letter_url || '').trim()),
    warningLetterUrl: String(row.warning_letter_url || '').trim(),
    approvalStatus: st,
    rejectedReason: row.rejected_reason ? String(row.rejected_reason) : '',
  }
}

export async function getWarningLettersFromEvaluations(params: {
  type: string
  start?: string
  end?: string
  store?: string
  employee?: string
  evaluator?: string
  /** false면 내용 있는 전체 행. 기본 true = 발부·첨부 있는 행만 */
  warningsOnly?: boolean
}) {
  const q = new URLSearchParams()
  q.set('type', params.type || 'all')
  if (params.start) q.set('start', params.start)
  if (params.end) q.set('end', params.end)
  if (params.store) q.set('store', params.store)
  if (params.employee) q.set('employee', params.employee)
  if (params.evaluator) q.set('evaluator', params.evaluator)
  if (params.warningsOnly === false) q.set('warningsOnly', '0')
  const res = await apiFetchWithOffline(`/api/getWarningLettersFromEvaluations?${q}`)
  const data = (await res.json().catch(() => ({}))) as {
    items?: WarningLetterIncidentItem[]
    truncated?: boolean
    pageCap?: number
    error?: string
  }
  if (!res.ok) throw new Error(data.error || '조회 실패')
  return {
    items: Array.isArray(data.items) ? data.items : [],
    truncated: Boolean(data.truncated),
    pageCap: typeof data.pageCap === 'number' ? data.pageCap : undefined,
  }
}

export async function getWarningLetterRegistry(params: {
  start?: string
  end?: string
  store?: string
  employee?: string
  evaluator?: string
  approval?: string
}) {
  const q = new URLSearchParams()
  if (params.start) q.set('start', params.start)
  if (params.end) q.set('end', params.end)
  if (params.store) q.set('store', params.store)
  if (params.employee) q.set('employee', params.employee)
  if (params.evaluator) q.set('evaluator', params.evaluator)
  if (params.approval) q.set('approval', params.approval)
  const res = await apiFetchWithOffline(`/api/getWarningLetterRegistry?${q}`)
  const data = (await res.json().catch(() => ({}))) as {
    items?: WarningLetterRegistryRow[]
    summary?: { draft: number; pending: number; approved: number; rejected: number }
    truncated?: boolean
    pageCap?: number
    error?: string
  }
  if (!res.ok) throw new Error(data.error || '조회 실패')
  return {
    items: Array.isArray(data.items) ? data.items : [],
    summary: data.summary ?? { draft: 0, pending: 0, approved: 0, rejected: 0 },
    truncated: Boolean(data.truncated),
    pageCap: typeof data.pageCap === 'number' ? data.pageCap : undefined,
  }
}

export async function saveWarningLetterRegistry(body: {
  id?: number
  store_name: string
  employee_name: string
  incident_date: string
  incident_type?: string
  details?: string
  warning_letter_url?: string
  evaluator_name?: string
}) {
  const res = await apiFetchWithOffline('/api/saveWarningLetterRegistry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function presignWarningLetterRegistryUpload(params: {
  storeName: string
  fileName: string
  contentType: string
  fileSize: number
}) {
  const res = await apiFetchWithOffline('/api/uploadWarningLetterRegistry/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeName: params.storeName,
      fileName: params.fileName,
      contentType: params.contentType,
      fileSize: params.fileSize,
    }),
  })
  return res.json() as Promise<{
    success: boolean
    signedUrl?: string
    publicUrl?: string
    storagePath?: string
    message?: string
  }>
}

/** presign 후 Supabase Storage에 직접 PUT (Vercel 경유 없음) */
export async function uploadWarningLetterRegistryFile(file: File, storeName: string): Promise<{ publicUrl: string }> {
  const presign = await presignWarningLetterRegistryUpload({
    storeName,
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    fileSize: file.size,
  })
  if (!presign.success || !presign.signedUrl || !presign.publicUrl) {
    throw new Error(presign.message || 'presign failed')
  }
  const put = await fetch(presign.signedUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  })
  if (!put.ok) {
    const errText = await put.text().catch(() => '')
    throw new Error(errText || `upload failed (${put.status})`)
  }
  return { publicUrl: presign.publicUrl }
}

export async function warningLetterRegistryAction(body: {
  id: number
  action: 'submit' | 'approve' | 'reject' | 'reopen'
  rejectedReason?: string
}) {
  const res = await apiFetchWithOffline('/api/warningLetterRegistryAction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteWarningLetterRegistry(body: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteWarningLetterRegistry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type EvaluationResultById = {
  id: string
  date: string
  store: string
  employeeName: string
  evaluator: string
  finalGrade: string
  memo: string
  totalScore: string
  jsonData?: string | Record<string, unknown>
  evalType: 'kitchen' | 'service' | 'manager'
}

/** 평가 1건 불러오기(이력·경고서에서 수정 폼으로 열기) */
export async function getEvaluationResultById(id: string) {
  const q = new URLSearchParams()
  q.set('id', String(id || '').trim())
  const res = await apiFetchWithOffline(`/api/getEvaluationResultById?${q}`)
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<EvaluationResultById>
  if (!res.ok) throw new Error(String(data?.error || '조회 실패'))
  return data as EvaluationResultById
}

export async function getEvaluationHistory(params: {
  type: string
  start?: string
  end?: string
  store?: string
  employee?: string
  evaluator?: string
}) {
  const q = new URLSearchParams()
  q.set('type', params.type || 'kitchen')
  if (params.start) q.set('start', params.start)
  if (params.end) q.set('end', params.end)
  if (params.store) q.set('store', params.store)
  if (params.employee) q.set('employee', params.employee)
  if (params.evaluator) q.set('evaluator', params.evaluator)
  const res = await apiFetchWithOffline(`/api/getEvaluationHistory?${q}`)
  return res.json() as Promise<
    {
      id: string
      date: string
      store: string
      employeeName: string
      evaluator: string
      finalGrade: string
      totalScore: string
      memo: string
      jsonData?: string
    }[]
  >
}

/** 평가 결과 1건 삭제 — 서버에서 JWT·매장 권한 검사 */
export async function deleteEvaluationResult(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteEvaluationResult', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: params.id }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || '삭제 실패')
  return data as { ok?: boolean }
}

export type EvaluationAnalyticsPayload = {
  summary: {
    totalEvaluations: number
    uniqueEmployees: number
    avgTotalScore: number | null
  }
  gradeDistribution: Record<string, number>
  byStore: {
    store: string
    evaluations: number
    uniqueEmployees: number
    avgScore: number | null
  }[]
  byType: {
    evalType: string
    evaluations: number
    uniqueEmployees: number
    avgScore: number | null
  }[]
  byMonth: { yearMonth: string; evaluations: number; avgScore: number | null }[]
  byEvaluator: { evaluator: string; evaluations: number; avgScore: number | null }[]
  sectionAverages?: Record<string, number | null>
  source: 'rpc' | 'fallback'
  coverage?: {
    activeEmployeesInPeriod: number
    evaluatedEmployees: number
    unevaluatedEmployees: number
    unevaluated: { store: string; name: string; nick: string; job: string }[]
  } | null
}

/** 직원 평가 집계 (분석 탭) */
export async function getEvaluationAnalytics(params: {
  start: string
  end: string
  type?: string
  store?: string
}) {
  const q = new URLSearchParams()
  q.set('start', params.start.slice(0, 10))
  q.set('end', params.end.slice(0, 10))
  q.set('type', (params.type || 'all').trim())
  if (params.store && params.store !== 'All') q.set('store', params.store.trim())
  const res = await apiFetchWithOffline(`/api/getEvaluationAnalytics?${q}`)
  const text = await res.text()
  if (!res.ok) {
    const { message, redirectToAdminLogin } = parseEvalAnalyticsErrorResponse(res.status, text)
    throw attachEvalAnalyticsRedirectFlag(new Error(message || '집계 조회 실패'), redirectToAdminLogin)
  }
  return JSON.parse(text) as EvaluationAnalyticsPayload
}

/** 직원 평가 집계 AI 요약 (본사·회계, OPENAI_API_KEY 필요) */
export async function summarizeEvaluationAnalytics(params: {
  start: string
  end: string
  type?: string
  store?: string
}) {
  const res = await apiFetchWithOffline('/api/summarizeEvaluationAnalytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start: params.start.slice(0, 10),
      end: params.end.slice(0, 10),
      type: (params.type || 'all').trim(),
      store: (params.store || 'All').trim(),
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    const { message, redirectToAdminLogin } = parseEvalAnalyticsErrorResponse(res.status, text)
    throw attachEvalAnalyticsRedirectFlag(new Error(message || '요약 실패'), redirectToAdminLogin)
  }
  return JSON.parse(text) as { summary: string; source: string }
}

/** 평가 항목 일괄 수정 */
export async function updateEvaluationItems(params: {
  type: 'kitchen' | 'service' | 'manager'
  updates: { id: string | number; main?: string; sub?: string; name?: string; use?: boolean; sort_order?: number }[]
}) {
  const res = await apiFetchWithOffline('/api/updateEvaluationItems', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: params.type,
      updates: params.updates,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || '수정 실패')
  }
  return res.text() as Promise<string>
}

/** 평가 항목 추가 */
export async function addEvaluationItem(params: {
  type: 'kitchen' | 'service' | 'manager'
  mainCat?: string
  subCat?: string
  itemName?: string
}) {
  const res = await apiFetchWithOffline('/api/addEvaluationItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || '추가 실패')
  }
  return res.text() as Promise<string>
}

/** 평가 항목 삭제 */
export async function deleteEvaluationItem(params: {
  type: 'kitchen' | 'service' | 'manager'
  itemId: string | number
}) {
  const res = await apiFetchWithOffline('/api/deleteEvaluationItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: params.type,
      itemId: params.itemId,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || '삭제 실패')
  }
  return res.text() as Promise<string>
}

/** 평가 결과 저장 — 서버에서 JWT로 본사·회계·해당 매장 매니저/가맹점주만 허용 */
export async function saveEvaluationResult(params: {
  type: 'kitchen' | 'service' | 'manager'
  id?: string
  date: string
  store: string
  employeeName: string
  evaluator: string
  finalGrade: string
  memo: string
  jsonData: unknown
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/saveEvaluationResult', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text || '저장 실패')
  return text as 'SAVED' | 'UPDATED'
}

// ─── 매장 점검 ───
export interface ChecklistItem {
  id: number
  main: string
  sub: string
  name: string
  use?: boolean
}

export async function getChecklistItems(activeOnly = true) {
  return getChecklistItemsWithCache(activeOnly)
}

export async function saveCheckResult(params: {
  id?: string
  date: string
  store: string
  inspector: string
  summary: string
  memo: string
  jsonData: string | unknown
}) {
  const res = await apiFetchWithOffline('/api/saveCheckResult', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.msg || '저장 실패')
  return data.result as 'SAVED' | 'UPDATED'
}

export interface CheckHistoryItem {
  id: string
  date: string
  store: string
  inspector: string
  result: string
  memo?: string
  json?: string
}

export async function getCheckHistory(params: {
  startStr: string
  endStr: string
  store?: string
  inspector?: string
}) {
  return getCheckHistoryWithCache(params)
}

export async function deleteCheckHistory(id: string) {
  const res = await apiFetchWithOffline('/api/deleteCheckHistory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.msg || '삭제 실패')
  return true
}

export async function updateChecklistItems(updates: { id: string | number; main?: string; sub?: string; name?: string; use?: boolean; sort_order?: number }[]) {
  const res = await apiFetchWithOffline('/api/updateChecklistItems', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.msg || '저장 실패')
  return true
}

export async function addChecklistItem(params: { main?: string; sub?: string; name?: string }) {
  const res = await apiFetchWithOffline('/api/addChecklistItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; id?: number; message?: string }
  if (!res.ok || !data.success) throw new Error(data.message || '추가 실패')
  return data
}

export async function deleteChecklistItem(id: string | number) {
  const res = await apiFetchWithOffline('/api/deleteChecklistItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string }
  if (!res.ok || !data.success) throw new Error(data.message || '삭제 실패')
  return true
}

// ─── 매장 방문 현황 ───
export interface StoreVisitHistoryItem {
  date: string
  time: string
  name: string
  store: string
  type: string
  purpose: string
  duration?: number
}

export async function getStoreVisitHistory(params: {
  startStr: string
  endStr: string
  store?: string
  employeeName?: string
  department?: string
  purpose?: string
}) {
  const q = new URLSearchParams({
    start: params.startStr,
    end: params.endStr,
    ...(params.store && params.store !== 'All' && { store: params.store }),
    ...(params.employeeName && params.employeeName !== 'All' && { employeeName: params.employeeName }),
    ...(params.department && params.department !== 'All' && { department: params.department }),
    ...(params.purpose && { purpose: params.purpose }),
  })
  const res = await apiFetchWithOffline(`/api/getStoreVisitHistory?${q}`)
  return jsonAsArray<StoreVisitHistoryItem>(await res.json())
}

export interface StoreVisitTodaySnapshotActive {
  name: string
  department: string
  store: string
  purpose: string
  startedAt: string
}

export interface StoreVisitTodaySnapshotSegment {
  name: string
  department: string
  store: string
  purpose: string
  startAt: string
  endAt: string | null
  ongoing: boolean
}

export interface StoreVisitTodaySnapshotByStore {
  store: string
  activeCount: number
  segmentsTodayCount: number
}

export async function getStoreVisitTodaySnapshot(params?: { userStore?: string; userRole?: string }) {
  const q = new URLSearchParams()
  if (params?.userStore) q.set("userStore", params.userStore)
  if (params?.userRole) q.set("userRole", params.userRole)
  const qs = q.toString()
  const res = await apiFetchWithOffline(`/api/getStoreVisitTodaySnapshot${qs ? `?${qs}` : ""}`)
  return res.json() as Promise<{
    today: string
    active: StoreVisitTodaySnapshotActive[]
    segments: StoreVisitTodaySnapshotSegment[]
    byStore: StoreVisitTodaySnapshotByStore[]
    error?: string
  }>
}

export interface StoreVisitStatsItem {
  label: string
  minutes: number
}

export async function getStoreVisitStats(params: { startStr: string; endStr: string }) {
  const q = new URLSearchParams({ start: params.startStr, end: params.endStr })
  const res = await apiFetchWithOffline(`/api/getStoreVisitStats?${q}`)
  return res.json() as Promise<{
    byDept: StoreVisitStatsItem[]
    byEmployee: StoreVisitStatsItem[]
    byStore: StoreVisitStatsItem[]
    byPurpose: StoreVisitStatsItem[]
  }>
}

export interface VisitRecord {
  id: number
  employee: string
  department: string
  store: string
  purpose: string
  date: string
  durationMin: number
}

export async function getStoreVisitRecords(params: {
  startStr: string
  endStr: string
  store?: string
  employeeName?: string
  department?: string
  purpose?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
    ...(params.userStore && { userStore: params.userStore }),
    ...(params.userRole && { userRole: params.userRole }),
    ...(params.store && params.store !== "__ALL__" && { store: params.store }),
    ...(params.employeeName && params.employeeName !== "__ALL__" && { employeeName: params.employeeName }),
    ...(params.department && params.department !== "__ALL__" && { department: params.department }),
    ...(params.purpose && params.purpose !== "__ALL__" && { purpose: params.purpose }),
  })
  const res = await apiFetchWithOffline(`/api/getStoreVisitRecords?${q}`)
  return jsonAsArray<VisitRecord>(await res.json())
}

// ─── 컴플레인 일지 ───
export interface ComplaintLogItem {
  row?: number
  id?: number
  number: string
  date: string
  time: string
  store: string
  writer: string
  customer: string
  contact: string
  visitPath: string
  platform: string
  type: string
  menu: string
  title: string
  content: string
  severity: string
  action: string
  status: string
  handler: string
  doneDate: string
  photoUrl: string
  remark: string
}

export async function getComplaintLogList(params: {
  startStr?: string
  endStr?: string
  store?: string
  visitPath?: string
  typeFilter?: string
  statusFilter?: string
}) {
  const q = new URLSearchParams()
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  if (params.store) q.set('store', params.store)
  if (params.visitPath) q.set('visitPath', params.visitPath)
  if (params.typeFilter) q.set('typeFilter', params.typeFilter)
  if (params.statusFilter) q.set('statusFilter', params.statusFilter)
  const res = await apiFetchWithOffline(`/api/getComplaintLogList?${q}`)
  return jsonAsArray<ComplaintLogItem>(await res.json())
}

export async function saveComplaintLog(data: Record<string, unknown>) {
  const res = await apiFetchWithOffline('/api/saveComplaintLog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateComplaintLog(rowOrId: string | number, data: Record<string, unknown>) {
  const res = await apiFetchWithOffline('/api/updateComplaintLog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rowOrId, data }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 매장 수리·수선 신고 ───
export interface StoreRepairTicketItem {
  row?: number
  id?: number
  ticketNumber: string
  store: string
  reporter: string
  category: string
  priority: string
  area: string
  title: string
  description: string
  photoUrls: string[]
  status: string
  handler: string
  reportedAt: string
  startedAt: string
  completedAt: string
  resolutionNote: string
  vendorName: string
  vendorCode?: string
  estimatedCost: number | null
  actualCost: number | null
}

export async function getStoreRepairTicketList(params: {
  startStr?: string
  endStr?: string
  store?: string
  status?: string
  category?: string
  priority?: string
  q?: string
}) {
  const q = new URLSearchParams()
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  if (params.store) q.set('store', params.store)
  if (params.status) q.set('status', params.status)
  if (params.category) q.set('category', params.category)
  if (params.priority) q.set('priority', params.priority)
  if (params.q) q.set('q', params.q)
  const res = await apiFetchWithOffline(`/api/getStoreRepairTicketList?${q}`)
  return jsonAsArray<StoreRepairTicketItem>(await res.json())
}

export async function saveStoreRepairTicket(data: Record<string, unknown>) {
  const res = await apiFetchWithOffline('/api/saveStoreRepairTicket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  return res.json() as Promise<{ success: boolean; message?: string; ticketNumber?: string }>
}

export async function updateStoreRepairTicket(rowOrId: string | number, data: Record<string, unknown>) {
  const res = await apiFetchWithOffline('/api/updateStoreRepairTicket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rowOrId, data }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 오프라인 큐 미사용 — 파일은 Supabase로 직접 PUT */
export async function uploadStoreRepairPhoto(store: string, file: File) {
  const { guessStoreRepairUploadContentType } = await import('@/lib/store-repair-media')
  const { apiFetch } = await import('./api/fetch')
  const pres = await apiFetch('/api/uploadStoreRepairPhoto/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store,
      fileName: file.name,
      contentType: guessStoreRepairUploadContentType(file),
      fileSize: file.size,
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return { success: false, url: undefined, message: pjson.message || '업로드 준비 실패' }
  }
  const ct = guessStoreRepairUploadContentType(file)
  const body =
    file.type === ct ? file : new File([file], file.name || 'upload', { type: ct, lastModified: file.lastModified })
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, body, { upsert: false })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    return { success: false, url: undefined, message: t || `Storage 업로드 실패 (${putRes.status})` }
  }
  return { success: true, url: pjson.publicUrl, message: undefined }
}

/** SSO 제출 증빙 파일 업로드 (브라우저 -> Supabase Storage 직접 PUT) */
export async function uploadSsoEvidenceFile(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
  file: File
}) {
  const { apiFetch } = await import('./api/fetch')
  const pres = await apiFetch('/api/uploadSsoEvidence/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userRole: params.userRole,
      yearMonth: params.yearMonth,
      storeFilter: params.storeFilter || '',
      fileName: params.file.name,
      contentType: params.file.type || 'application/octet-stream',
      fileSize: params.file.size,
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return { success: false, url: undefined, message: pjson.message || '업로드 준비 실패' }
  }
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, params.file, { upsert: false })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    return { success: false, url: undefined, message: t || `Storage 업로드 실패 (${putRes.status})` }
  }
  return { success: true, url: pjson.publicUrl, message: undefined }
}

/** E-Tax Time Stamp 증빙 파일 업로드 (브라우저 -> Supabase Storage 직접 PUT) */
export async function uploadEtaxEvidenceFile(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
  file: File
}) {
  const { apiFetch } = await import('./api/fetch')
  const pres = await apiFetch('/api/uploadEtaxEvidence/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userRole: params.userRole,
      yearMonth: params.yearMonth,
      storeFilter: params.storeFilter || '',
      fileName: params.file.name,
      contentType: params.file.type || 'application/octet-stream',
      fileSize: params.file.size,
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return { success: false, url: undefined, message: pjson.message || '업로드 준비 실패' }
  }
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, params.file, { upsert: false })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    return { success: false, url: undefined, message: t || `Storage 업로드 실패 (${putRes.status})` }
  }
  return { success: true, url: pjson.publicUrl, message: undefined }
}

export function getExportEtaxTimestampAuditCsvUrl(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    storeFilter: params.storeFilter || 'All',
  })
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportEtaxTimestampAuditCsv?${q}`
  }
  return `/api/exportEtaxTimestampAuditCsv?${q}`
}

export interface StoreRepairProgressLog {
  id?: number
  ticketId?: number
  author: string
  note: string
  photoUrls: string[]
  createdAt: string
}

export async function getStoreRepairProgressLogs(ticketId: number) {
  const res = await apiFetchWithOffline(`/api/getStoreRepairProgressLogs?ticketId=${ticketId}`)
  return jsonAsArray<StoreRepairProgressLog>(await res.json())
}

export async function addStoreRepairProgressLog(data: {
  ticketId: number
  author: string
  note: string
  photoUrls?: string[]
}) {
  const res = await apiFetchWithOffline('/api/addStoreRepairProgressLog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 시스템 설정 ───
export interface HeadOfficeInfo {
  companyName: string
  taxId: string
  address: string
  phone: string
  bankInfo: string
}

export async function getHeadOfficeInfo() {
  const res = await apiFetchWithOffline('/api/getHeadOfficeInfo')
  return res.json() as Promise<HeadOfficeInfo>
}

/** Vercel 서버의 Supabase 조회 상한(설정 화면 표시용, 비밀값 없음) */
export interface AdminRouteLimitResolved {
  path: string
  line: number
  kind: string
  value: number
  apiLabel: string
  effectiveValue: number | null
  effectiveDisplay: string
}

export interface AdminTableUsageRow {
  table: string
  rowCount: number | null
  error?: string
  capFromPaging: number
  defaultMaxRows: number
  exceedsPagingCap: boolean
  exceedsDefaultMaxRows: boolean
}

export interface AdminDataLimits {
  selectPageCap: number
  envSupabaseSelectPageSizeMax: string | null
  selectAllPagesMaxPages: number
  selectAllPagesDefaultMaxRows: number
  selectFilterAllPagesMaxPages: number
  selectFilterAllPagesMaxRowsCeiling: number
  selectFilterAllPagesMinStride: number
  fetchedAt: string
  /** scripts/extract-api-limits.mjs 생성 시각 (UTC) */
  limitsExtractedAt: string
  /** 코드에서 추출한 limit/pageSize/maxRows/maxDuration 지점 수 */
  limitsExtractedCount: number
  routeLimits: AdminRouteLimitResolved[]
  tableUsage: AdminTableUsageRow[]
}

export async function getAdminDataLimits(): Promise<AdminDataLimits> {
  const res = await apiFetch('/api/getAdminDataLimits')
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `getAdminDataLimits ${res.status}`)
  }
  return res.json() as Promise<AdminDataLimits>
}

export async function saveHeadOfficeInfo(data: HeadOfficeInfo) {
  const res = await apiFetchWithOffline('/api/saveHeadOfficeInfo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 본사 발주 (Purchase Order) ───
export interface PurchaseLocation {
  name: string
  address: string
  location_code: string
}

export interface VendorForPurchase {
  code: string
  name: string
  address?: string
  taxId?: string
  phone?: string
  bankAccountNo?: string | null
  salesOutlet?: string | null
  /** vendors.gps_name — 매장 표시명, 회계 PO 매장-법인 매칭용 */
  gpsName?: string | null
}

export interface ItemByVendor {
  code: string
  name: string
  spec: string
  price: number
  cost: number
  category: string
  image: string
  outbound_location?: string
  taxType?: 'taxable' | 'exempt' | 'zero'
}

export async function getPurchaseLocations() {
  const res = await apiFetchWithOffline('/api/getPurchaseLocations')
  return jsonAsArray<PurchaseLocation>(await res.json())
}

export async function getVendorsForPurchase() {
  return getVendorsForPurchaseWithCache()
}

export async function getVendorsForSales() {
  return getVendorsForSalesWithCache()
}

/** 회계 PO·로열티 청구: 매출처(가맹 법인) 전체 필드 — getVendorsForPurchase에는 매출처가 없음 */
export async function getVendorsForSalesFranchiseMaster(): Promise<VendorForPurchase[]> {
  const res = await apiFetch('/api/getVendorsForSales?detail=1')
  if (!res.ok) return []
  const data = (await res.json()) as unknown
  return Array.isArray(data) ? (data as VendorForPurchase[]) : []
}

export async function getItemsByVendor(
  vendorCode: string,
  vendorName?: string,
  outboundLocation?: string,
  /** 출고지 표시명 — 품목에 code 대신 name이 저장된 경우 매칭용 */
  outboundLocationName?: string
) {
  const q = new URLSearchParams({ vendorCode })
  if (vendorName?.trim()) q.set('vendorName', vendorName.trim())
  if (outboundLocation?.trim()) q.set('outboundLocation', outboundLocation.trim())
  if (outboundLocationName?.trim()) q.set('outboundLocationName', outboundLocationName.trim())
  const res = await apiFetchWithOffline(`/api/getItemsByVendor?${q}`)
  return jsonAsArray<ItemByVendor>(await res.json())
}

export interface ItemVendorRow {
  vendorCode: string
  priority?: number
  unitPrice?: number | null
  minOrderQty?: number | null
  memo?: string | null
}

export async function getItemVendors(itemCode: string) {
  const q = new URLSearchParams({ itemCode })
  const res = await apiFetchWithOffline(`/api/getItemVendors?${q}`)
  return jsonAsArray<ItemVendorRow>(await res.json())
}

export async function saveItemVendors(params: {
  itemCode: string
  vendors: { vendorCode: string; priority?: number; unitPrice?: number | null; minOrderQty?: number | null; memo?: string | null }[]
}) {
  const res = await apiFetchWithOffline('/api/saveItemVendors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getHqStockByLocation(locationCode: string) {
  const q = new URLSearchParams({ locationCode })
  const res = await apiFetchWithOffline(`/api/getHqStockByLocation?${q}`)
  return res.json() as Promise<Record<string, number>>
}

export async function savePurchaseOrder(params: {
  vendorCode: string
  vendorName: string
  locationName: string
  locationAddress: string
  locationCode: string
  cart: { code: string; name: string; price: number; cost?: number; qty: number; store?: string; taxType?: string }[]
  userName: string
  withholdingTaxAmount?: number
  withholdingTaxRate?: number
  relatedStore?: string
  storeVendorCode?: string
  storeVendorName?: string
  poFormatLabel?: string
  /** 귀속 월 YYYY-MM + billingKind 있으면 동일 초안 PO가 있으면 갱신 */
  billingMonthYm?: string
  billingKind?: 'royalty' | 'delivery_gp' | 'grab_gp' | 'all'
  /** 본사 발주일 YYYY-MM-DD(방콕). cart_json meta + created_at·PO번호 일자 반영 */
  orderDate?: string
  /** 세금계산서·내부 참조번호 — cart_json meta */
  referenceNo?: string
  /** 공급사 견적/제안서 — cart_json meta (public URL) */
  quotationFileUrl?: string
  quotationFileName?: string
}) {
  const res = await apiFetchWithOffline('/api/savePurchaseOrder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    id?: number
    poNo?: string
    updated?: boolean
    message?: string
  }>
}

/** 본사 PO 견적서: presign 후 Supabase Storage에 직접 PUT */
export async function uploadPoQuotationFile(params: { file: File }) {
  const { apiFetch } = await import('./api/fetch')
  const pres = await apiFetch('/api/uploadPoQuotation/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: params.file.name,
      contentType: params.file.type || 'application/octet-stream',
      fileSize: params.file.size,
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return { success: false, publicUrl: undefined, message: pjson.message || '업로드 준비 실패' }
  }
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, params.file, { upsert: true })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    return { success: false, publicUrl: undefined, message: t || `Storage 업로드 실패 (${putRes.status})` }
  }
  return { success: true, publicUrl: pjson.publicUrl, message: undefined }
}

export type PoBillingSettingApiRow = {
  store_name?: string
  royalty_pct?: number
  delivery_gp_pct?: number
  grab_gp_pct?: number
  label_royalty?: string | null
  label_delivery_gp?: string | null
  label_grab_gp?: string | null
  updated_at?: string
}

export async function getPoBillingSettings() {
  const res = await apiFetch('/api/getPoBillingSettings')
  return res.json() as Promise<{ success: boolean; list: PoBillingSettingApiRow[]; message?: string }>
}

export async function savePoBillingSettings(
  rows: {
    store_name: string
    royalty_pct: number
    delivery_gp_pct: number
    grab_gp_pct: number
    label_royalty?: string | null
    label_delivery_gp?: string | null
    label_grab_gp?: string | null
  }[]
): Promise<{ success: boolean; saved?: number; message?: string }> {
  // 오프라인 래퍼(apiFetchWithOffline)는 실패 시에도 { success: true }를 반환할 수 있어,
  // 청구 비율은 반드시 서버·DB 반영 여부를 알 수 있게 일반 fetch만 사용한다.
  const res = await apiFetch('/api/savePoBillingSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  })
  let data: { success?: boolean; saved?: number; message?: string } = {}
  try {
    data = (await res.json()) as typeof data
  } catch {
    /* empty body 등 */
  }
  if (!res.ok) {
    return {
      success: false,
      message: data.message || `저장 요청 실패 (${res.status})`,
    }
  }
  return {
    success: !!data.success,
    saved: data.saved,
    message: data.message,
  }
}

export async function getPoBillingDraft(params: {
  store: string
  startStr: string
  endStr: string
  labelRoyalty?: string
  labelDelivery?: string
  labelGrab?: string
  /** 기본 all — royalty | delivery_gp | grab_gp 는 해당 유형만 */
  mode?: 'all' | 'royalty' | 'delivery_gp' | 'grab_gp'
}) {
  const q = new URLSearchParams({
    store: params.store,
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.labelRoyalty) q.set('labelRoyalty', params.labelRoyalty)
  if (params.labelDelivery) q.set('labelDelivery', params.labelDelivery)
  if (params.labelGrab) q.set('labelGrab', params.labelGrab)
  if (params.mode && params.mode !== 'all') q.set('mode', params.mode)
  const res = await apiFetch(`/api/getPoBillingDraft?${q}`)
  return res.json() as Promise<{
    success: boolean
    snapshot?: { totalSales: number; deliverySales: number; grabSales: number }
    settings?: { royalty_pct: number; delivery_gp_pct: number; grab_gp_pct: number }
    lines?: { code: string; name: string; price: number; qty: number; taxType: string }[]
    truncated?: boolean
    message?: string
  }>
}

export interface PurchaseOrderRow {
  id?: number
  po_no?: string
  vendor_code?: string
  vendor_name?: string
  location_name?: string
  location_address?: string
  location_code?: string
  cart_json?: string
  subtotal?: number
  vat?: number
  total?: number
  user_name?: string
  status?: string
  created_at?: string
  withholding_tax_amount?: number
  withholding_tax_rate?: number
  invoice_received?: boolean
  invoice_no?: string
}

export async function getPurchaseOrders(params?: {
  vendorCode?: string
  poId?: number
  startDate?: string
  endDate?: string
}) {
  return getPurchaseOrdersWithCache(params) as Promise<PurchaseOrderRow[]>
}

export async function updatePurchaseOrderInvoice(params: {
  poId: number
  invoiceReceived?: boolean
  invoiceNo?: string
  withholdingTaxAmount?: number
  withholdingTaxRate?: number
}) {
  const res = await apiFetchWithOffline('/api/updatePurchaseOrderInvoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function processPurchaseOrderApproval(params: { poId: number }) {
  const res = await apiFetchWithOffline('/api/processPurchaseOrderApproval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function processPurchaseOrderCancel(params: { poId: number }) {
  const res = await apiFetchWithOffline('/api/processPurchaseOrderCancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getMenuPermission(store: string, name: string) {
  const q = new URLSearchParams({ store, name })
  const res = await apiFetchWithOffline(`/api/getMenuPermission?${q}`)
  return res.json() as Promise<Record<string, number>>
}

export async function setMenuPermission(
  store: string,
  name: string,
  permissions: Record<string, number>
) {
  const res = await apiFetchWithOffline('/api/setMenuPermission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, name, perm: permissions }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type CompanyHybridDocumentListItem = {
  id: number
  store: string
  related_type: string
  related_id: string | null
  doc_type: string | null
  category_id: number | null
  title: string
  source: string
  external_url: string | null
  public_url: string | null
  storage_path: string | null
  file_name: string | null
  file_size: number | null
  mime: string | null
  valid_from: string | null
  valid_to: string | null
  note: string | null
  metadata?: Record<string, unknown> | null
  created_by_name: string | null
  created_by_store: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type CompanyHybridDocumentCategory = {
  id: number
  store: string
  name: string
  sort_order: number
  parent_category_id: number | null
  created_at?: string
}

/** 문서 관리 API: UI에서 401 시 알림 대신 로그인 이동용 */
type CompanyHybridHttpMeta = { httpStatus: number }

export async function getCompanyHybridDocuments(params: {
  store: string
  relatedType?: string
  relatedId?: string
  /** 생략·'all' = 전체, 'uncategorized' = 미분류, 숫자 문자열 = 해당 카테고리 */
  categoryId?: string
  searchTitle?: string
  /** 제목 정렬 — 미지정 시 등록일 최신순 */
  sortTitle?: 'asc' | 'desc'
  /** 공문(metadata.correspondence) 유무: all | yes | no */
  corrPresence?: 'all' | 'yes' | 'no'
  corrDirection?: 'outbound' | 'inbound'
  corrStatus?: 'draft' | 'sent' | 'filed' | 'replied'
  corrCounterpartySearch?: string
}): Promise<
  { success: boolean; list: CompanyHybridDocumentListItem[]; message?: string } & CompanyHybridHttpMeta
> {
  const q = new URLSearchParams({ store: params.store })
  if (params.relatedType) q.set('relatedType', params.relatedType)
  if (params.relatedId) q.set('relatedId', params.relatedId)
  if (params.categoryId && params.categoryId !== 'all') {
    const c = params.categoryId
    q.set('categoryId', c === 'uncategorized' ? 'none' : c)
  }
  if (params.searchTitle?.trim()) q.set('searchTitle', params.searchTitle.trim())
  if (params.sortTitle === 'asc' || params.sortTitle === 'desc') q.set('sortTitle', params.sortTitle)
  if (params.corrPresence && params.corrPresence !== 'all') q.set('corrPresence', params.corrPresence)
  if (params.corrDirection) q.set('corrDirection', params.corrDirection)
  if (params.corrStatus) q.set('corrStatus', params.corrStatus)
  if (params.corrCounterpartySearch?.trim()) q.set('corrCounterpartySearch', params.corrCounterpartySearch.trim())
  const res = await apiFetchWithOffline(`/api/getCompanyHybridDocuments?${q}`)
  const data = (await res.json()) as { success: boolean; list: CompanyHybridDocumentListItem[]; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function getCompanyHybridDocumentCategories(params: {
  store: string
}): Promise<
  { success: boolean; list: CompanyHybridDocumentCategory[]; message?: string } & CompanyHybridHttpMeta
> {
  const res = await apiFetchWithOffline(
    `/api/getCompanyHybridDocumentCategories?${new URLSearchParams({ store: params.store })}`
  )
  const data = (await res.json()) as { success: boolean; list: CompanyHybridDocumentCategory[]; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function saveCompanyHybridDocumentCategory(
  body: { store: string; name: string; sortOrder?: number; id?: number; parentCategoryId?: number | null }
): Promise<{ success: boolean; id?: number; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/saveCompanyHybridDocumentCategory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { success: boolean; id?: number; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function deleteCompanyHybridDocumentCategory(
  body: { id: number }
): Promise<{ success: boolean; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/deleteCompanyHybridDocumentCategory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { success: boolean; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function saveCompanyHybridDocument(
  body: Record<string, unknown>
): Promise<{ success: boolean; id?: number; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/saveCompanyHybridDocument', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { success: boolean; id?: number; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function deleteCompanyHybridDocument(params: {
  id: number
}): Promise<{ success: boolean; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/deleteCompanyHybridDocument', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as { success: boolean; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function presignCompanyHybridDocumentUpload(params: {
  store: string
  fileName: string
  contentType: string
  fileSize: number
}): Promise<
  {
    success: boolean
    signedUrl?: string
    publicUrl?: string
    storagePath?: string
    message?: string
  } & CompanyHybridHttpMeta
> {
  const res = await apiFetchWithOffline('/api/uploadCompanyHybridDocument/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as {
    success: boolean
    signedUrl?: string
    publicUrl?: string
    storagePath?: string
    message?: string
  }
  return { ...data, httpStatus: res.status }
}

export async function completeCompanyHybridDocumentUpload(
  body: Record<string, unknown>
): Promise<{ success: boolean; id?: number; url?: string; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/uploadCompanyHybridDocument/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { success: boolean; id?: number; url?: string; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function recordCompanyHybridDocumentView(params: {
  id: number
}): Promise<{ success: boolean; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/recordCompanyHybridDocumentView', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as { success: boolean; message?: string }
  return { ...data, httpStatus: res.status }
}
