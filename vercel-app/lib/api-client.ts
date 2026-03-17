/**
 * API 클라이언트
 * core fetch/auth는 lib/api/ 에서 분리
 */
import { apiFetch } from './api/fetch'

export { apiFetch } from './api/fetch'
export { getLoginData, loginCheck, changePassword } from './api/auth'
export { useStoreList } from './use-store-list'

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

export async function getMyNotices(params: { store: string; name: string }) {
  const q = new URLSearchParams(params)
  const res = await apiFetch(`/api/getMyNotices?${q}`)
  return res.json() as Promise<NoticeItem[]>
}

export async function confirmNoticeRead(params: {
  noticeId: number
  store: string
  name: string
  action: '확인' | '다음에'
}) {
  const res = await apiFetch('/api/confirmNoticeRead', {
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
  dept: string
  role: string
  companyName?: string
  salary: number
  pos_allow: number
  haz_allow: number
  birth_bonus: number
  holiday_pay: number
  spl_bonus: number
  ot_amt: number
  late_ded: number
  sso: number
  tax: number
  other_ded: number
  net_pay: number
}

export async function getMyPayroll(params: {
  store: string
  name: string
  month: string
}) {
  const q = new URLSearchParams({
    userStore: params.store,
    userName: params.name,
    month: params.month.slice(0, 7),
  })
  const res = await apiFetch(`/api/getMyPayroll?${q}`)
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

export async function getAppData(
  storeName: string,
  asOfDateOrOptions?: string | { asOfDate?: string; scope?: 'order' | 'stock' }
) {
  const opts = typeof asOfDateOrOptions === 'string'
    ? { asOfDate: asOfDateOrOptions }
    : (asOfDateOrOptions || {})
  const params = new URLSearchParams({ storeName })
  if (opts.asOfDate?.trim()) params.set('asOfDate', opts.asOfDate.trim())
  if (opts.scope === 'order') params.set('scope', 'order')
  const res = await apiFetch(`/api/getAppData?${params}`)
  const data = await res.json()
  return { items: (data.items || []) as AppItem[], stock: data.stock || {} }
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
  const res = await apiFetch('/api/saveSafetyStock', {
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
  const res = await apiFetch(`/api/getAdjustmentHistory?${q}`)
  return res.json() as Promise<AdjustmentHistoryItem[]>
}

export async function getStockStores() {
  const res = await apiFetch('/api/getStockStores')
  return res.json() as Promise<string[]>
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
  const res = await apiFetch('/api/adjustStock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function processOrder(params: {
  storeName: string
  userName: string
  cart: { code?: string; name: string; price: number; qty: number }[]
}) {
  const res = await apiFetch('/api/processOrder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
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
}) {
  const q = new URLSearchParams(params)
  const res = await apiFetch(`/api/getMyOrderHistory?${q}`)
  return res.json() as Promise<OrderHistoryItem[]>
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
  const res = await apiFetch('/api/processUsage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getMyUsageHistory(params: {
  store: string
  startStr: string
  endStr: string
}) {
  const q = new URLSearchParams(params)
  const res = await apiFetch(`/api/getMyUsageHistory?${q}`)
  return res.json() as Promise<UsageHistoryItem[]>
}

export async function processOrderReceive(params: {
  orderRowId: number
  imageUrl?: string
  imageUrls?: string[]
  isPartialReceive?: boolean
  inspectedIndices?: number[]
  receivedQtys?: Record<number, number>
}) {
  const res = await apiFetch('/api/processOrderReceive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => ({ success: false, message: '응답 파싱 실패' }))
  if (!res.ok) {
    return { success: false, message: data?.message || `요청 실패 (${res.status})` }
  }
  return data as { success: boolean; message?: string }
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
  items: { code?: string; name?: string; spec?: string; category?: string; vendor?: string; outboundLocation?: string; qty?: number; price?: number; originalQty?: number }[]
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
  const res = await apiFetch(`/api/getAdminOrders?${q}`)
  const data = await res.json()
  return {
    list: (data.list || []) as AdminOrderItem[],
    stores: (data.stores || []) as string[],
  }
}

export async function getOrderFilterOptions() {
  const res = await apiFetch('/api/getOrderFilterOptions')
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
  const res = await apiFetch('/api/getAdminDashboardStats')
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
  const res = await apiFetch('/api/getAdminRecentActivity')
  return res.json() as Promise<AdminActivityItem[]>
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
  updatedCart?: { code?: string; name?: string; spec?: string; price: number; qty: number }[]
}) {
  const res = await apiFetch('/api/processOrderDecision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateOrderDeliveryDates(params: {
  orderId: number
  deliveryDatesByOutbound: Record<string, string>
  userRole?: string
}) {
  const res = await apiFetch('/api/updateOrderDeliveryDates', {
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
  const res = await apiFetch('/api/updateOrderDeliveryStatus', {
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
  updatedCart: { code?: string; name?: string; spec?: string; price: number; qty: number }[]
  deliveryStatus?: string
  receivedIndices?: number[]
}) {
  const res = await apiFetch('/api/updateOrderCart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 인사 (HR) ───
export async function getTodayAttendanceTypes(params: { storeName: string; name: string }) {
  const q = new URLSearchParams({
    storeName: params.storeName,
    name: params.name,
  })
  const res = await apiFetch(`/api/getTodayAttendanceTypes?${q}`)
  return res.json() as Promise<string[]>
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
}) {
  const q = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    storeFilter: params.storeFilter,
    employeeFilter: params.employeeFilter,
  })
  const res = await apiFetch(`/api/getAttendanceList?${q}`)
  return res.json() as Promise<AttendanceLogItem[]>
}

export async function submitAttendance(params: {
  storeName: string
  name: string
  type: string
  lat: string | number
  lng: string | number
}) {
  const res = await apiFetch('/api/submitAttendance', {
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
}) {
  const res = await apiFetch('/api/requestLeave', {
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

export async function getMyLeaveInfo(params: { store: string; name: string }) {
  const q = new URLSearchParams(params)
  const res = await apiFetch(`/api/getMyLeaveInfo?${q}`)
  return res.json() as Promise<{
    history: LeaveHistoryItem[]
    stats: { usedAnn: number; usedSick: number; usedUnpaid: number; usedLakij: number; remain: number; remainLakij: number; annualTotal: number; lakijTotal: number }
  }>
}

export async function uploadLeaveCertificate(params: {
  id: number
  store: string
  name: string
  certificateUrl: string
}) {
  const res = await apiFetch('/api/uploadLeaveCertificate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 관리 (Admin) ───
export async function getNoticeOptions() {
  const res = await apiFetch('/api/getNoticeOptions')
  return res.json() as Promise<{ stores: string[]; roles: string[]; permissionGroups: string[] }>
}

export async function sendNotice(params: {
  title: string
  content: string
  targetStore: string
  targetRole: string
  targetPermissionGroup?: string | null
  sender: string
  targetRecipients?: Array<{ store: string; name: string }>
  userStore?: string
  userRole?: string
  attachments?: Array<{ name: string; mime: string; url: string }>
}) {
  const res = await apiFetch('/api/sendNotice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
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
  const res = await apiFetch(`/api/getNoticeSenders?${q}`)
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
}) {
  const q = new URLSearchParams({
    sender: params.sender,
    startDate: params.startDate,
    endDate: params.endDate,
  })
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  if (params.searchType && params.searchType !== 'all') q.set('searchType', params.searchType)
  const res = await apiFetch(`/api/getSentNotices?${q}`)
  return res.json() as Promise<SentNoticeItem[]>
}

export interface NoticeReadDetailItem {
  store: string
  name: string
  read_at: string
  status: string
}

export async function getNoticeReadDetail(params: { noticeId: number }) {
  const q = new URLSearchParams({ noticeId: String(params.noticeId) })
  const res = await apiFetch(`/api/getNoticeReadDetail?${q}`)
  const data = (await res.json()) as { items?: NoticeReadDetailItem[]; success?: boolean; message?: string }
  if (!res.ok || data.success === false) throw new Error(data.message || 'Failed')
  return { items: data.items ?? [] }
}

export async function deleteNoticeAdmin(params: { id: number }) {
  const res = await apiFetch('/api/deleteNoticeAdmin', {
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
  const res = await apiFetch(`/api/getLeavePendingList?${q}`)
  return res.json() as Promise<{ id: number; store: string; name: string; nick: string; type: string; date: string; requestDate: string; reason: string; status: string; certificateUrl: string }[]>
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
  const res = await apiFetch(`/api/getLeaveStats?${q}`)
  return res.json() as Promise<{ store: string; name: string; usedPeriodAnnual: number; usedPeriodSick: number; usedPeriodUnpaid: number; usedPeriodLakij: number; usedTotalAnnual: number; usedTotalSick: number; usedTotalUnpaid: number; usedTotalLakij: number; remain: number; remainLakij: number }[]>
}

export async function processLeaveApproval(params: { id: number; decision: string; userStore?: string; userRole?: string; rejectReason?: string }) {
  const res = await apiFetch('/api/processLeaveApproval', {
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
  const res = await apiFetch(`/api/getAttendancePendingList?${q}`)
  return res.json() as Promise<{ id: number; log_at: string; store_name: string; name: string; log_type: string; status?: string; approved?: string }[]>
}

export async function processAttendanceApproval(params: { id: number; decision: string; optOtMinutes?: number | null; optEarlyMinutes?: number | null; waiveLate?: boolean; userStore?: string; userRole?: string }) {
  const body: Record<string, unknown> = { id: params.id, decision: params.decision }
  if (params.optOtMinutes != null) body.optOtMinutes = Number(params.optOtMinutes)
  if (params.optEarlyMinutes != null) body.optEarlyMinutes = Number(params.optEarlyMinutes)
  if (params.waiveLate) body.waiveLate = true
  if (params.userStore) body.userStore = params.userStore
  if (params.userRole) body.userRole = params.userRole
  const res = await apiFetch('/api/processAttendanceApproval', {
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
  nick?: string
  inTimeStr: string
  outTimeStr: string
  breakMin: number
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
  const res = await apiFetch(`/api/getAttendanceNoRecordList?${q}`)
  return res.json() as Promise<AttendanceNoRecordRow[]>
}

export async function createAttendanceFromSchedule(params: {
  date: string
  store: string
  name: string
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetch('/api/createAttendanceFromSchedule', {
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
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetch('/api/approveNoClockOut', {
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
  inTimeStr: string
  outTimeStr: string
  breakMin: number
  actualWorkHrs: number
  plannedWorkHrs: number
  diffMin: number
  lateMin: number
  /** DB 저장값(퇴근 로그 early_min). 기존 건 조정 반영 시 사용 */
  earlyMin?: number
  otMin: number
  status: string
  approval: string
  pendingId: number | null
  pendingInId?: number | null
  pendingOutId?: number | null
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
  statusFilter?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams()
  if (params.startDate) q.set('startDate', params.startDate)
  if (params.endDate) q.set('endDate', params.endDate)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.employeeFilter) q.set('employeeFilter', params.employeeFilter)
  if (params.statusFilter) q.set('statusFilter', params.statusFilter || 'all')
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  const res = await apiFetch(`/api/getAttendanceRecordsAdmin?${q}`)
  return res.json() as Promise<AttendanceDailyRow[]>
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
  const res = await apiFetch('/api/getWorkLogStaffList')
  return res.json() as Promise<{ staff: { name: string; displayName: string }[] }>
}

export async function getWorkLogOfficeOptions() {
  const res = await apiFetch('/api/getWorkLogOfficeOptions')
  return res.json() as Promise<{ staff: { name: string; displayName: string }[]; depts: string[] }>
}

export async function getWorkLogData(params: { dateStr: string; name: string }) {
  const q = new URLSearchParams({
    dateStr: params.dateStr,
    name: params.name,
  })
  const res = await apiFetch(`/api/getWorkLogData?${q}`)
  return res.json() as Promise<WorkLogData>
}

export async function saveWorkLogData(params: {
  date: string
  name: string
  logs: WorkLogItem[]
}) {
  const res = await apiFetch('/api/saveWorkLogData', {
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
}) {
  const res = await apiFetch('/api/submitDailyClose', {
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
  const res = await apiFetch('/api/updateManagerCheck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateWorkLogPriority(params: { id: string; priority: string }) {
  const res = await apiFetch('/api/updateWorkLogPriority', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; messageKey?: string }>
}

export async function deleteWorkLogItem(params: { id: string }) {
  const res = await apiFetch('/api/deleteWorkLogItem', {
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
  const res = await apiFetch(`/api/getWorkLogManagerReport?${q}`)
  return res.json() as Promise<WorkLogManagerItem[]>
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
  const res = await apiFetch(`/api/getWorkLogWeekly?${q}`)
  return res.json() as Promise<{
    summaries: WorkLogWeeklySummary[]
    totalTasks: number
    totalCompleted: number
    totalCarried: number
    overallAvg: number
  }>
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
}

export interface TodayAttendanceItem {
  store: string
  name: string
  inTimeStr: string
  outTimeStr: string
  lateMin: number
  status: string
  onlyIn: boolean
}

export async function getTodaySchedule(params: { store: string; date: string }) {
  const q = new URLSearchParams(params)
  const res = await apiFetch(`/api/getTodaySchedule?${q}`)
  return res.json() as Promise<TodayScheduleItem[]>
}

export async function getTodayAttendanceSummary(params: {
  store: string
  date: string
}) {
  const q = new URLSearchParams(params)
  const res = await apiFetch(`/api/getTodayAttendanceSummary?${q}`)
  return res.json() as Promise<TodayAttendanceItem[]>
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
  const res = await apiFetch(`/api/getWeeklySchedule?${q}`)
  return res.json() as Promise<WeeklyScheduleItem[]>
}

export async function saveSchedule(params: {
  store: string
  monday: string
  rows: { date: string; name: string; pIn?: string; pOut?: string; pBS?: string; pBE?: string; remark?: string; plan_in_prev_day?: boolean }[]
}) {
  const res = await apiFetch('/api/saveSchedule', {
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
  const res = await apiFetch(`/api/getMyAttendanceSummary?${q}`)
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
  const res = await apiFetch(`/api/getTodayMyVisits?${q}`)
  return res.json() as Promise<TodayVisitItem[]>
}

export async function checkUserVisitStatus(params: { userName: string }) {
  const q = new URLSearchParams({ userName: params.userName })
  const res = await apiFetch(`/api/checkUserVisitStatus?${q}`)
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
  const res = await apiFetch('/api/submitStoreVisit', {
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
  const res = await apiFetch('/api/getPettyCashOptions')
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
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.scopeFilter) q.set('scopeFilter', params.scopeFilter)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.departmentFilter) q.set('departmentFilter', params.departmentFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  const res = await apiFetch(`/api/getPettyCashList?${q}`)
  return res.json() as Promise<PettyCashItem[]>
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
  const res = await apiFetch(`/api/getPettyCashMonthDetail?${q}`)
  return res.json() as Promise<PettyCashItem[]>
}

/** 사용자 입력 내용(memo 등) 번역 - 로그인 언어로 표시 */
export async function translateTexts(texts: string[], targetLang: string): Promise<string[]> {
  const filtered = texts.filter((s) => s && String(s).trim())
  if (filtered.length === 0) return []
  const res = await apiFetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: filtered, targetLang }),
  })
  const data = (await res.json()) as { translated?: string[] }
  return data.translated || []
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
  const res = await apiFetch('/api/addPettyCashTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
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
  const res = await apiFetch('/api/updatePettyCashTransaction', {
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

// ─── 미수금/미지급금 관리 ───
export interface ReceivablePayableItem {
  storeName?: string
  vendorCode?: string
  vendorName?: string
  balance: number
  items: { id?: number; trans_date?: string; ref_type?: string; ref_id?: number; amount?: number; memo?: string; invoice_no?: string }[]
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
  const res = await apiFetch(`/api/getReceivablePayableSummary?${q}`)
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
  const res = await apiFetch(`/api/getReceivableOrders?${q}`)
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
  const q = new URLSearchParams({
    type: params.type,
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.vendorFilter) q.set('vendorFilter', params.vendorFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  const res = await apiFetch(`/api/getReceivablePayableList?${q}`)
  const data = await res.json()
  return data as { type: string; list: ReceivablePayableItem[] }
}

// ─── 손익계산서 (1단계) ───
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
    fixedExpenses: number
    total: number
  }
  diagnostics?: {
    warnings: string[]
    limits: Record<string, { fetched: number; limit: number; total?: number }>
  }
  grossProfit: number
  netProfit: number
  error?: string
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
  const res = await apiFetch(`/api/getIncomeStatement?${q}`)
  return res.json() as Promise<IncomeStatementData>
}

export interface UnpostedBankTransaction {
  id: number
  transDate: string
  amount: number
  category: string
  memo: string | null
  store: string | null
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
  const res = await apiFetch(`/api/getBalanceSheet?${q}`)
  return res.json() as Promise<BalanceSheetData>
}

// ─── 감가상각·고정자산 ───
export async function getFixedAssets(params: { storeFilter?: string; status?: string }) {
  const q = new URLSearchParams()
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.status) q.set('status', params.status)
  const res = await apiFetch(`/api/getFixedAssets?${q}`)
  return res.json() as Promise<{ success: boolean; list: unknown[] }>
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
}) {
  const res = await apiFetch('/api/saveFixedAsset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getDepreciationEntries(params: { yearMonth: string; storeFilter?: string }) {
  const q = new URLSearchParams({ yearMonth: params.yearMonth })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetch(`/api/getDepreciationEntries?${q}`)
  return res.json() as Promise<{ success: boolean; list: unknown[]; totalAmount: number }>
}

export async function runDepreciationPreview(params: { yearMonth: string; storeFilter?: string }) {
  const q = new URLSearchParams({ yearMonth: params.yearMonth })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetch(`/api/runDepreciation?${q}`)
  return res.json() as Promise<{
    success: boolean
    candidates: { id: number; name: string; store_name: string; monthly_amount: number }[]
    totalAmount: number
  }>
}

export async function runDepreciation(params: { yearMonth: string; storeFilter?: string; dryRun?: boolean }) {
  const res = await apiFetch('/api/runDepreciation', {
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
  const res = await apiFetch('/api/addBalanceTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 지출 관리 (MVP) ───
export interface ExpenseAccrualPlanItem {
  id: number
  payeeCode: string
  payeeName: string
  withdrawalCategory?: string
  plannedAmount: number
  paidAmount: number
  remainingAmount: number
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
}

export interface LogisticsPaymentPlanItem {
  vendorCode: string
  remainingAmount: number
  txCount: number
}

export interface ExpensePaymentPlanResponse {
  success: boolean
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
  const res = await apiFetch('/api/registerExpenseFromBankTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: number }>
}

export async function registerPurchaseFromBankTransaction(params: {
  bankTransactionId: number
  vendorCode: string
  userName?: string
  userRole?: string
  updateExisting?: boolean
}) {
  const res = await apiFetch('/api/registerPurchaseFromBankTransaction', {
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
  expenseDate: string
  dueDate?: string
  memo?: string
  accountSubjectId?: number | null
  storeName?: string
  userName?: string
  userRole?: string
}) {
  const res = await apiFetch('/api/addExpenseAccrual', {
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
  const res = await apiFetch('/api/updateExpenseRegisterItem', {
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
  const res = await apiFetch('/api/updateExpenseRegisterItem', {
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
  const res = await apiFetch('/api/approveExpenseAccrual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateExpenseAccrual(params: {
  expenseAccrualId: number
  amount: number
  expenseDate: string
  dueDate?: string | null
  memo?: string
  payeeCode?: string
  payeeName?: string
  accountSubjectId?: number | null
  storeName?: string
  userRole?: string
}) {
  const res = await apiFetch('/api/updateExpenseAccrual', {
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
  const res = await apiFetch('/api/updateExpenseAccrual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, action: 'delete' }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteExpenseAccrualsWithoutStore(params: { userRole?: string }) {
  const res = await apiFetch('/api/deleteExpenseAccrualsWithoutStore', {
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
  const res = await apiFetch('/api/deletePurchaseAccrualsByVendor', {
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
  const res = await apiFetch(`/api/getApprovedExpenseAccrualsForBankTx?${q}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    bankTransaction?: { id: number; amount: number; transDate: string }
    list: ExpenseAccrualPlanItem[]
  }>
}

export async function getExpensePaymentPlan(params: {
  startStr: string
  endStr: string
  payeeFilter?: string
  vendorFilter?: string
  userRole?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.payeeFilter) q.set('payeeFilter', params.payeeFilter)
  if (params.vendorFilter) q.set('vendorFilter', params.vendorFilter)
  if (params.userRole) q.set('userRole', params.userRole)
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
}) {
  const res = await apiFetch('/api/executeExpensePayment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
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
  const res = await apiFetch(`/api/getUnlinkedBankWithdrawals?${q}`)
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
  const res = await apiFetch('/api/getCardAccounts')
  return res.json() as Promise<CardAccount[]>
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
  const res = await apiFetch(`/api/getCardTransactions?${q}`)
  return res.json() as Promise<{ list: CardTransaction[] }>
}

export async function saveCardAccount(params: { id?: number; name: string; store?: string; memo?: string; cardNumber?: string; holderName?: string; cardCompany?: string }) {
  const res = await apiFetch('/api/saveCardAccount', {
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
  const res = await apiFetch('/api/saveCardTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteCardAccount(params: { id: number }) {
  const res = await apiFetch('/api/deleteCardAccount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteCardTransaction(params: { id: number }) {
  const res = await apiFetch('/api/deleteCardTransaction', {
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
  const res = await apiFetch('/api/executeWithdrawal', {
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
}) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.pos) q.set('pos', params.pos)
  const res = await apiFetch(`/api/posSalesByStore?${q}`)
  return res.json() as Promise<
    { storeName: string; count: number; subtotal: number; vat: number; total: number }[]
  >
}

export async function getPosSalesFilterOptions(params: { startStr: string; endStr: string }) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  const res = await apiFetch(`/api/posSalesFilterOptions?${q}`)
  return res.json() as Promise<{ posOptions: string[] }>
}

export async function getPosSalesByPeriod(params: {
  startStr: string
  endStr: string
  groupBy: 'month' | 'week' | 'day' | 'dow'
  pos?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
    groupBy: params.groupBy,
  })
  if (params.pos) q.set('pos', params.pos)
  const res = await apiFetch(`/api/posSalesByPeriod?${q}`)
  return res.json() as Promise<{ label: string; key: string; sales: number }[]>
}

export async function getPosSalesByDeliveryApp(params: {
  startStr: string
  endStr: string
  pos?: string
}) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.pos) q.set('pos', params.pos)
  const res = await apiFetch(`/api/posSalesByDeliveryApp?${q}`)
  return res.json() as Promise<{ items: { label: string; sales: number; pct: number }[]; total: number }>
}

export async function getPosSalesByChannel(params: {
  startStr: string
  endStr: string
  pos?: string
}) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.pos) q.set('pos', params.pos)
  const res = await apiFetch(`/api/posSalesByChannel?${q}`)
  return res.json() as Promise<{ label: string; sales: number }[]>
}

export async function getPosSalesByMenu(params: {
  startStr: string
  endStr: string
  pos?: string
  search?: string
}) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.pos) q.set('pos', params.pos)
  if (params.search) q.set('search', params.search)
  const res = await apiFetch(`/api/posSalesByMenu?${q}`)
  return res.json() as Promise<{ name: string; qty: number; sales: number }[]>
}

export async function getPosSalesByPayment(params: {
  startStr: string
  endStr: string
  pos?: string
}) {
  const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
  if (params.pos) q.set('pos', params.pos)
  const res = await apiFetch(`/api/posSalesByPayment?${q}`)
  return res.json() as Promise<{ label: string; sales: number }[]>
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
  const res = await apiFetch(`/api/getBankAccounts?${q}`)
  return res.json() as Promise<BankAccount[]>
}

export async function getBankTransactions(params: {
  accountId: string | number
  startStr: string
  endStr: string
}) {
  const q = new URLSearchParams({
    accountId: String(params.accountId),
    startStr: params.startStr,
    endStr: params.endStr,
  })
  const res = await apiFetch(`/api/getBankTransactions?${q}`)
  return res.json() as Promise<{
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
  const res = await apiFetch(`/api/getExpenseRegisterList?${q}`)
  return res.json() as Promise<{ list: ExpenseRegisterItem[] }>
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
  const res = await apiFetch('/api/addBankTransaction', {
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
  const res = await apiFetch('/api/addBankTransactionsBulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; inserted?: number; skipped?: number; message?: string }>
}

export async function updateBankTransactionInvoice(params: {
  bankTransactionId: number
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  purchaseOrderId?: number | null
}) {
  const res = await apiFetch('/api/updateBankTransactionInvoice', {
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
}) {
  const res = await apiFetch('/api/updateBankTransaction', {
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
  const res = await apiFetch(`/api/getInboundBatchesForLink?${q}`)
  return res.json() as Promise<InboundBatchForLink[]>
}

export async function getBankTransactionInboundLinks(bankTransactionId: number) {
  const res = await apiFetch(`/api/getBankTransactionInboundLinks?bankTransactionId=${bankTransactionId}`)
  return res.json() as Promise<{ id?: number; inboundBatchId?: number; amount: number }[]>
}

export async function saveBankTransactionInboundLinks(params: {
  bankTransactionId: number
  links: { inboundBatchId: number; amount: number }[]
}) {
  const res = await apiFetch('/api/saveBankTransactionInboundLinks', {
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
  const res = await apiFetch('/api/getBankMemoRules')
  return res.json() as Promise<BankMemoRule[]>
}

export async function saveBankMemoRule(params: {
  id?: number
  keyword: string
  transType: 'deposit' | 'withdraw'
  category: string
  accountSubjectId?: number | null
}) {
  const res = await apiFetch('/api/saveBankMemoRule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteBankMemoRule(params: { id: number }) {
  const res = await apiFetch('/api/deleteBankMemoRule', {
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
  const res = await apiFetch('/api/saveBankAccount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteBankAccount(params: { id: number }) {
  const res = await apiFetch('/api/deleteBankAccount', {
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
  type: string
  pAndLSection?: string | null
  sortOrder: number
}

export async function getAccountSubjects(params?: {
  type?: string
  forExpense?: boolean
  forFixed?: boolean
  forCost?: boolean
  forTransfer?: boolean
  forRevenue?: boolean
  forCard?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.type) q.set('type', params.type)
  if (params?.forExpense) q.set('forExpense', 'true')
  if (params?.forFixed) q.set('forFixed', 'true')
  if (params?.forCost) q.set('forCost', 'true')
  if (params?.forTransfer) q.set('forTransfer', 'true')
  if (params?.forRevenue) q.set('forRevenue', 'true')
  if (params?.forCard) q.set('forCard', 'true')
  const res = await apiFetch(`/api/getAccountSubjects?${q}`)
  return res.json() as Promise<AccountSubjectItem[]>
}

export async function saveAccountSubject(params: {
  id?: number
  code: string
  name: string
  nameEn?: string | null
  type: string
  pAndLSection?: string | null
  sortOrder?: number
}) {
  const res = await apiFetch('/api/saveAccountSubject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteAccountSubject(params: { id: number }) {
  const res = await apiFetch('/api/deleteAccountSubject', {
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
  const res = await apiFetch(`/api/getFixedExpenses?${q}`)
  return res.json() as Promise<FixedExpenseItem[]>
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
  const res = await apiFetch('/api/saveFixedExpense', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteFixedExpense(params: { id: number }) {
  const res = await apiFetch('/api/deleteFixedExpense', {
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
  const res = await apiFetch('/api/getInteriorProjects')
  return res.json() as Promise<InteriorProject[]>
}

export async function saveInteriorProject(params: Partial<InteriorProject> & { code: string; name: string }) {
  const res = await apiFetch('/api/saveInteriorProject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorProject(params: { id: number }) {
  const res = await apiFetch('/api/deleteInteriorProject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
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
  const res = await apiFetch(`/api/getInteriorSchedule?${q}`)
  return res.json() as Promise<InteriorScheduleItem[]>
}

export async function saveInteriorScheduleItem(params: Partial<InteriorScheduleItem> & { projectId: number; workDetail: string }) {
  const res = await apiFetch('/api/saveInteriorScheduleItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorScheduleItem(params: { id: number }) {
  const res = await apiFetch('/api/deleteInteriorScheduleItem', {
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
  const res = await apiFetch(`/api/getInteriorExpenseItems?${q}`)
  return res.json() as Promise<InteriorExpenseItem[]>
}

export async function saveInteriorExpenseItem(params: Partial<InteriorExpenseItem> & { projectId: number; description: string }) {
  const res = await apiFetch('/api/saveInteriorExpenseItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorExpenseItem(params: { id: number }) {
  const res = await apiFetch('/api/deleteInteriorExpenseItem', {
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
  const res = await apiFetch('/api/payInteriorExpense', {
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
  const res = await apiFetch(`/api/getInteriorDirectPurchases?${q}`)
  return res.json() as Promise<InteriorDirectPurchase[]>
}

export async function saveInteriorDirectPurchase(params: Partial<InteriorDirectPurchase> & { projectId: number; description: string }) {
  const res = await apiFetch('/api/saveInteriorDirectPurchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorDirectPurchase(params: { id: number }) {
  const res = await apiFetch('/api/deleteInteriorDirectPurchase', {
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
  const res = await apiFetch(`/api/getInteriorFiles?${q}`)
  return res.json() as Promise<InteriorProjectFile[]>
}

export async function uploadInteriorFile(params: {
  projectId: string | number
  fileType: string
  file: File
}) {
  const formData = new FormData()
  formData.append('projectId', String(params.projectId))
  formData.append('fileType', params.fileType)
  formData.append('file', params.file)
  const res = await apiFetch('/api/uploadInteriorFile', {
    method: 'POST',
    body: formData,
  })
  return res.json() as Promise<{ success: boolean; message?: string; url?: string }>
}

export async function deleteInteriorFile(params: { id: number }) {
  const res = await apiFetch('/api/deleteInteriorFile', {
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
  const res = await apiFetch(`/api/getInteriorKitchenItems?${q}`)
  return res.json() as Promise<InteriorKitchenItem[]>
}

export async function saveInteriorKitchenItem(params: Partial<InteriorKitchenItem> & { projectId: number }) {
  const res = await apiFetch('/api/saveInteriorKitchenItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorKitchenItem(params: { id: number }) {
  const res = await apiFetch('/api/deleteInteriorKitchenItem', {
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
  const res = await apiFetch(`/api/getInteriorSpecifications?${q}`)
  return res.json() as Promise<InteriorSpecification[]>
}

export async function saveInteriorSpecification(params: Partial<InteriorSpecification> & { projectId: number; description: string }) {
  const res = await apiFetch('/api/saveInteriorSpecification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorSpecification(params: { id: number }) {
  const res = await apiFetch('/api/deleteInteriorSpecification', {
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
  /** 재고 기본 단위 (저장 단위). 비어 있으면 unit 사용 (하위 호환) */
  stockBaseUnit?: string
  /** 조정/조사 시 선택 단위 (하위 호환) */
  stockUnitOptions?: { unit: string; factor: number }[]
  /** 표준 단위 목록. (totalQuantity) [unit] = 1 규격 */
  standardUnits?: { unit: string; totalQuantity: number }[]
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
  const params = new URLSearchParams()
  if (options?.scope) params.set('scope', options.scope)
  const q = params.toString()
  const res = await apiFetch(`/api/getItems${q ? '?' + q : ''}`)
  return res.json() as Promise<AdminItem[]>
}

export interface WarehouseLocation {
  id?: number
  name: string
  address: string
  location_code: string
  sort_order: number
}

export async function getWarehouseLocations() {
  const res = await apiFetch('/api/getWarehouseLocations')
  return res.json() as Promise<WarehouseLocation[]>
}

export async function saveWarehouseLocation(params: {
  id?: number
  name: string
  address?: string
  location_code?: string
  sort_order?: number
}) {
  const res = await apiFetch('/api/saveWarehouseLocation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteWarehouseLocation(params: { id?: number; location_code?: string }) {
  const res = await apiFetch('/api/deleteWarehouseLocation', {
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
  const res = await apiFetch('/api/getItemCategorySettings')
  return res.json() as Promise<ItemCategory[]>
}

export async function saveItemCategory(params: {
  id?: number
  name: string
  oldName?: string
  sort_order?: number
}) {
  const res = await apiFetch('/api/saveItemCategory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteItemCategory(params: { id?: number; name?: string }) {
  const res = await apiFetch('/api/deleteItemCategory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getItemCategories() {
  const res = await apiFetch('/api/getItemCategories')
  return res.json() as Promise<{ categories: string[] }>
}

export async function getAdminVendors() {
  const res = await apiFetch('/api/getVendors')
  return res.json() as Promise<AdminVendor[]>
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
}) {
  const res = await apiFetch('/api/saveItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteItem(params: { code: string }) {
  const res = await apiFetch('/api/deleteItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
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
  const res = await apiFetch(`/api/getPriceHistory${q ? '?' + q : ''}`)
  const data = await res.json()
  if (!res.ok || (data && typeof data === 'object' && 'error' in data)) {
    console.warn('getPriceHistory:', data?.error || res.status)
    return []
  }
  return Array.isArray(data) ? data : []
}

export async function backfillPriceHistory() {
  const res = await apiFetch('/api/backfillPriceHistory', { method: 'POST' })
  const data = await res.json() as { success?: boolean; inserted?: number; error?: string }
  if (!res.ok || !data?.success) {
    return { success: false as const, error: data?.error || '실패', inserted: 0 }
  }
  return { success: true as const, inserted: data.inserted ?? 0, message: `${data.inserted ?? 0}건 등록됨` }
}

export async function updateItemOrderDisabled(params: { code: string; disabled: boolean }) {
  const res = await apiFetch('/api/updateItemOrderDisabled', {
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
  const res = await apiFetch('/api/importItemsFromExcel', {
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
  /** 주방 프린터: null=카테고리기준, 1=주방1, 2=주방2 */
  kitchenPrinter?: number | null
  /** 조리 시간(분), 예상 완성 시간/KDS 등 활용 */
  cookingTimeMin?: number | null
  /** 반반 메뉴: POS에서 다른 치킨(S 순살) 2개를 골라 한 상으로 주문, 원가는 각 0.5씩 */
  isBanban?: boolean
}

export interface PosMenuOption {
  id: string
  menuId: string
  name: string
  priceModifier: number
  priceModifierDelivery?: number | null
  priceModifierPackaging?: number | null
  sortOrder: number
  optionType?: 'substitution' | 'additive'
  itemCode?: string | null
  quantity?: number
  /** 복합 옵션의 단계별 값. 예: {"size":"M","part":"순살"} */
  optionStepValues?: Record<string, string> | null
  /** 홀에서 판매 */
  sellHall?: boolean
  /** 배달에서 판매 */
  sellDelivery?: boolean
  /** 포장에서 판매 */
  sellPackaging?: boolean
}

export async function getPosMenus() {
  const res = await apiFetch('/api/getPosMenus')
  return res.json() as Promise<PosMenu[]>
}

export async function getNextPosMenuCode(mainCategory: string) {
  const q = new URLSearchParams({ mainCategory })
  const res = await apiFetch(`/api/getNextPosMenuCode?${q}`)
  return res.json() as Promise<{ code: string | null; message?: string }>
}

export async function getPosMenuCategories() {
  const res = await apiFetch('/api/getPosMenuCategories')
  return res.json() as Promise<{ categories: string[]; mainCategories: string[] }>
}

export interface PosMenuCategoriesConfig {
  mainCategories: string[]
  categoriesByMain: Record<string, string[]>
}

export async function getPosMenuCategoriesConfig() {
  const res = await apiFetch('/api/posMenuCategories')
  return res.json() as Promise<PosMenuCategoriesConfig>
}

export async function applyPosMenuCategoryPresets() {
  const res = await apiFetch('/api/applyPosMenuCategoryPresets', {
    method: 'POST',
  })
  return res.json() as Promise<{ success: boolean; updated: number; total: number }>
}

export async function savePosMenuCategoriesConfig(params: {
  mainCategories: string[]
  categoriesByMain: Record<string, string[]>
  applyToMenus?: boolean
}) {
  const res = await apiFetch('/api/posMenuCategories', {
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

export async function getPosMenuOptions(params?: { menuId?: string }) {
  const q = new URLSearchParams()
  if (params?.menuId) q.set('menuId', params.menuId)
  const res = await apiFetch('/api/getPosMenuOptions?' + q.toString())
  return res.json() as Promise<PosMenuOption[]>
}

export async function savePosMenuOption(params: {
  id?: string
  menuId: number
  name: string
  priceModifier?: number
  priceModifierDelivery?: number | null
  priceModifierPackaging?: number | null
  sortOrder?: number
  optionType?: 'substitution' | 'additive'
  itemCode?: string | null
  quantity?: number
  optionStepValues?: Record<string, string> | null
  sellHall?: boolean
  sellDelivery?: boolean
  sellPackaging?: boolean
}) {
  const res = await apiFetch('/api/savePosMenuOption', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface PosMenuIngredient {
  id: string
  menuId: string
  itemCode: string
  ingredientType?: 'food' | 'packaging'
  quantity: number
  lossRate?: number
  optionId?: string | null
}

export async function getPosMenuIngredients(params: { menuId: string; optionId?: string }) {
  const q = new URLSearchParams()
  q.set('menuId', params.menuId)
  if (params.optionId !== undefined) q.set('optionId', params.optionId)
  const res = await apiFetch('/api/getPosMenuIngredients?' + q.toString())
  return res.json() as Promise<PosMenuIngredient[]>
}

export async function savePosMenuIngredient(params: {
  id?: string
  menuId: number
  itemCode: string
  quantity?: number
  lossRate?: number
  optionId?: number | null
  ingredientType?: 'food' | 'packaging'
}) {
  const res = await apiFetch('/api/savePosMenuIngredient', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
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
  return res.json() as Promise<{ cost: number; breakdown: MenuCostBreakdown[] }>
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
  optionName: string | null
  costHall: number
  costDelivery: number
  cookingTimeMin?: number | null
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
  }[]
}

export async function getPosMenuCostAnalysis(): Promise<PosMenuCostAnalysisRow[]> {
  const res = await apiFetch('/api/getPosMenuCostAnalysis')
  const data = await res.json().catch(() => [])
  if (!res.ok) return []
  return Array.isArray(data) ? data : []
}

// ─── 소스(합성품) 원가 ───
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
}

export async function getSauces() {
  const res = await apiFetch('/api/sauces')
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error((data as { message?: string })?.message || `소스 목록 조회 실패 (${res.status})`)
  }
  return Array.isArray(data) ? data : []
}

export async function saveSauce(params: {
  id?: number
  code: string
  name: string
  unit?: string
  overheadPercent?: number
  totalQuantity?: number
  ingredients: { itemCode: string; quantity: number; lossRate?: number }[]
}) {
  const res = await apiFetch('/api/sauces', {
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
  const res = await apiFetch('/api/sauces/delete', {
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
  const res = await apiFetch('/api/sauces/recalculate', { method: 'POST' })
  const data = await res.json().catch(() => ({})) as { success?: boolean; count?: number; message?: string }
  if (!res.ok) {
    throw new Error(data?.message || `재계산 실패 (${res.status})`)
  }
  return data
}

export async function getNotificationSettings() {
  const res = await apiFetch('/api/notificationSettings')
  return res.json() as Promise<{ pushNoticeEnabled: boolean; pushOrderApprovalEnabled: boolean }>
}

export async function updateNotificationSettings(params: {
  pushNoticeEnabled?: boolean
  pushOrderApprovalEnabled?: boolean
}) {
  const res = await apiFetch('/api/notificationSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean }>
}

export async function getCostSettings() {
  const res = await apiFetch('/api/costSettings')
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
  const res = await apiFetch('/api/costSettings', {
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

export async function deletePosMenuIngredient(params: { id: string }) {
  const res = await apiFetch('/api/deletePosMenuIngredient', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deletePosMenuOption(params: { id: string }) {
  const res = await apiFetch('/api/deletePosMenuOption', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function savePosMenu(params: {
  id?: string
  code: string
  name: string
  category?: string
  categoryMain?: string
  price?: number
  priceDelivery?: number | null
  imageUrl?: string
  vatIncluded?: boolean
  isActive?: boolean
  sortOrder?: number
  optionSelectionGroups?: string[]
  kitchenPrinter?: number | null
  cookingTimeMin?: number | null
  isBanban?: boolean
}) {
  const res = await apiFetch('/api/savePosMenu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function uploadPosMenuImage(params: { file: File }) {
  const formData = new FormData()
  formData.append('file', params.file)
  const res = await apiFetch('/api/uploadPosMenuImage', {
    method: 'POST',
    body: formData,
  })
  return res.json() as Promise<{ success: boolean; message?: string; url?: string }>
}

export async function deletePosMenu(params: { id: string }) {
  const res = await apiFetch('/api/deletePosMenu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updatePosMenuSoldOut(params: { id: string; soldOut: boolean }) {
  const res = await apiFetch('/api/updatePosMenuSoldOut', {
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
  name: string
  category: string
  price: number
  marketingCampaignId?: string | null
  priceDelivery?: number | null
  vatIncluded: boolean
  isActive: boolean
  sortOrder: number
}

export interface PosPromoItem {
  id: string
  promoId: string
  menuId: string
  optionId: string | null
  quantity: number
  sortOrder: number
}

export async function getPosPromos() {
  const res = await apiFetch('/api/getPosPromos')
  return res.json() as Promise<PosPromo[]>
}

export interface PosPromoWithItems extends PosPromo {
  items: { menuId: string; optionId: string | null; quantity: number }[]
}

export async function getPosPromosWithItems() {
  const res = await apiFetch('/api/getPosPromosWithItems')
  return res.json() as Promise<PosPromoWithItems[]>
}

export async function getPosPromoItems(params: { promoId: string }) {
  const q = new URLSearchParams()
  q.set('promoId', params.promoId)
  const res = await apiFetch('/api/getPosPromoItems?' + q.toString())
  return res.json() as Promise<PosPromoItem[]>
}

export async function savePosPromo(params: {
  id?: string
  code: string
  name: string
  category?: string
  price?: number
  priceDelivery?: number | null
  vatIncluded?: boolean
  isActive?: boolean
  sortOrder?: number
  marketingCampaignId?: string | null
}) {
  const res = await apiFetch('/api/savePosPromo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string }>
}

export async function savePosPromoItem(params: {
  id?: string
  promoId: number
  menuId: number
  optionId?: number | null
  quantity?: number
  sortOrder?: number
}) {
  const res = await apiFetch('/api/savePosPromoItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deletePosPromoItem(params: { id: string }) {
  const res = await apiFetch('/api/deletePosPromoItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deletePosPromo(params: { id: string }) {
  const res = await apiFetch('/api/deletePosPromo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 마케팅 캠페인 ───
export interface MarketingCampaign {
  id: string
  topic: string
  format: string
  status: string
  startDate?: string | null
  endDate?: string | null
  branches: string[]
  kpiTarget: number
  kpiUnit: string
  budgetTotal: number
}

export interface MarketingCampaignDetail extends MarketingCampaign {
  detail: string
  discountType: string
  discountValue: number
  discountPricePromotion: string
  costAdsOnline: number
  costAdsOffline: number
  costProduction: number
  costFood: number
  costInfluencer: number
  campaignPerformance: string
  conclusion: string
  createdAt?: string
  updatedAt?: string
}

export async function getMarketingCampaigns() {
  const res = await apiFetch('/api/marketingCampaigns')
  return res.json() as Promise<MarketingCampaign[]>
}

export async function getMarketingCampaign(id: string) {
  const q = new URLSearchParams({ id })
  const res = await apiFetch('/api/marketingCampaigns?' + q.toString())
  return res.json() as Promise<MarketingCampaignDetail | null>
}

export async function saveMarketingCampaign(params: {
  id?: string
  topic: string
  format?: string
  status?: string
  detail?: string
  startDate?: string | null
  endDate?: string | null
  branches?: string[]
  discountType?: string
  discountValue?: number
  discountPricePromotion?: string
  costAdsOnline?: number
  costAdsOffline?: number
  costProduction?: number
  costFood?: number
  costInfluencer?: number
  budgetTotal?: number
  kpiTarget?: number
  kpiUnit?: string
  campaignPerformance?: string
  conclusion?: string
}) {
  const res = await apiFetch('/api/marketingCampaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string }>
}

export async function deleteMarketingCampaign(params: { id: string }) {
  const res = await apiFetch('/api/deleteMarketingCampaign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getMarketingCampaignCosts(campaignId: string) {
  const q = new URLSearchParams({ campaignId })
  const res = await apiFetch(`/api/marketingCampaignCosts?${q}`)
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
  }>
}

export async function getMarketingCampaignResults(params: { campaignId: string }) {
  const q = new URLSearchParams({ campaignId: params.campaignId })
  const res = await apiFetch(`/api/marketingCampaignResults?${q}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    campaignId?: string
    importId?: string
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
  }>
}

export async function importMarketingExcel(file: File) {
  const form = new FormData()
  form.set('file', file)
  const res = await apiFetch('/api/importMarketingExcel', {
    method: 'POST',
    body: form,
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    campaignsInserted?: number
    adsInserted?: number
    influencersInserted?: number
  }>
}

// ─── 마케팅 광고 (ROAS) ───
export interface MarketingAd {
  id: string
  campaignId: string | null
  contentFormat: string
  contentPillar: string
  contentTopic: string
  publishDate: string | null
  platform: string
  postLink: string
  boostBudget: number
  actualSpent: number
}

export async function getMarketingAds(params?: { campaignId?: string }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  const res = await apiFetch('/api/marketingAds' + (q.toString() ? '?' + q.toString() : ''))
  return res.json() as Promise<MarketingAd[]>
}

export async function saveMarketingAd(params: {
  id?: string
  campaignId?: string | null
  contentFormat?: string
  contentPillar?: string
  contentTopic?: string
  publishDate?: string | null
  platform: string
  postLink?: string
  boostBudget?: number
  actualSpent?: number
}) {
  const res = await apiFetch('/api/marketingAds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string }>
}

export async function deleteMarketingAd(params: { id: string }) {
  const res = await apiFetch('/api/deleteMarketingAd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 마케팅 인플루언서 ───
export interface MarketingInfluencer {
  id: string
  campaignId: string | null
  name: string
  followers: string
  contentFormat: string
  contentTopic: string
  status: string
  branchReview: string
  hireType: string
  budget: number
  shootingDate: string | null
  publishDate: string | null
  platformLinks: Record<string, string>
  note: string
}

export async function getMarketingInfluencers(params?: { campaignId?: string }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  const res = await apiFetch('/api/marketingInfluencers' + (q.toString() ? '?' + q.toString() : ''))
  return res.json() as Promise<MarketingInfluencer[]>
}

export async function saveMarketingInfluencer(params: {
  id?: string
  campaignId?: string | null
  name: string
  followers?: string
  contentFormat?: string
  contentTopic?: string
  status?: string
  branchReview?: string
  hireType?: string
  budget?: number
  shootingDate?: string | null
  publishDate?: string | null
  platformLinks?: Record<string, string>
  note?: string
}) {
  const res = await apiFetch('/api/marketingInfluencers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string }>
}

export async function deleteMarketingInfluencer(params: { id: string }) {
  const res = await apiFetch('/api/deleteMarketingInfluencer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface PosCoupon {
  id?: number
  code: string
  name?: string
  discountType: 'percent' | 'amount' | 'fixed'
  discountValue: number
  startDate?: string | null
  endDate?: string | null
  validFrom?: string | null
  validTo?: string | null
  maxUses?: number | null
  usedCount?: number
  isActive?: boolean
}

export async function getPosCoupons() {
  const res = await apiFetch('/api/getPosCoupons')
  return res.json() as Promise<PosCoupon[]>
}

export async function savePosCoupon(params: {
  id?: number
  code: string
  name?: string
  discountType?: 'percent' | 'amount' | 'fixed'
  discountValue: number
  startDate?: string | null
  endDate?: string | null
  validFrom?: string | null
  validTo?: string | null
  maxUses?: number | null
  isActive?: boolean
  marketingCampaignId?: string | null
}) {
  const res = await apiFetch('/api/savePosCoupon', {
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
  const res = await apiFetch('/api/validatePosCoupon?' + q.toString())
  return res.json() as Promise<{
    valid: boolean
    message?: string
    couponName?: string
    discountAmt?: number
    discountReason?: string
  }>
}

export async function deletePosCoupon(params: { id: number }) {
  const res = await apiFetch('/api/deletePosCoupon', {
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
  const res = await apiFetch('/api/getPosTableLayout?' + q.toString())
  return res.json() as Promise<{ layout: PosTableItem[]; storeCode: string }>
}

export interface PosPrinterSettings {
  storeCode: string
  kitchenMode: 1 | 2
  kitchen1Categories: string[]
  kitchen2Categories: string[]
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
  drawerOpenOption?: 'password_and_reason' | 'reason_only' | 'force'
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
  receiptBizName?: string
  receiptBizTaxId?: string
  receiptBizOwner?: string
  receiptBizAddress?: string
  receiptBizPhone?: string
  receiptDesignStyle?: 'badge' | 'simple'
  receiptLogoSize?: 'sm' | 'md' | 'lg'
  receiptShowTitle?: boolean
  receiptShowPaidStamp?: boolean
  receiptShowThankYou?: boolean
  receiptShowCustomerCopy?: boolean
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

export async function getPosPrinterSettings(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  const res = await apiFetch('/api/getPosPrinterSettings?' + q.toString())
  return res.json() as Promise<PosPrinterSettings>
}

export async function savePosPrinterSettings(params: {
  storeCode: string
  kitchenMode: 1 | 2
  kitchen1Categories: string[]
  kitchen2Categories: string[]
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
  drawerOpenOption?: 'password_and_reason' | 'reason_only' | 'force'
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
  receiptBizName?: string
  receiptBizTaxId?: string
  receiptBizOwner?: string
  receiptBizAddress?: string
  receiptBizPhone?: string
  receiptDesignStyle?: 'badge' | 'simple'
  receiptLogoSize?: 'sm' | 'md' | 'lg'
  receiptShowTitle?: boolean
  receiptShowPaidStamp?: boolean
  receiptShowThankYou?: boolean
  receiptShowCustomerCopy?: boolean
  vatRate?: number
  vatMode?: 'included' | 'separate'
  serviceRate?: number
  serviceMode?: 'included' | 'separate'
  cardRate?: number
  cardMode?: 'included' | 'separate'
  cardBaseMode?: 'card_only' | 'card_plus_vat' | 'card_plus_vat_service'
  otherRate?: number
  otherMode?: 'included' | 'separate'
}) {
  const res = await apiFetch('/api/savePosPrinterSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function savePosTableLayout(params: {
  storeCode: string
  layout: PosTableItem[]
}) {
  const res = await apiFetch('/api/savePosTableLayout', {
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
  const res = await apiFetch('/api/getPosDeliveryApps?' + q.toString())
  return res.json() as Promise<PosDeliveryApp[]>
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
  const res = await apiFetch('/api/savePosDeliveryApps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface PosMenuScreenConfig {
  storeCode: string | null
  mainCategoryFontSize: number
  categoryFontSize: number
  menuTileFontSize: number
  menuTileCols: number
  menuListFontSize: number
  menuListPageSize: number
  kioskGroupFontSize: number
  updatedAt?: string | null
}

export async function getPosMenuScreenConfig(params?: { storeCode?: string }) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  const res = await apiFetch('/api/getPosMenuScreenConfig?' + q.toString())
  return res.json() as Promise<PosMenuScreenConfig>
}

export async function savePosMenuScreenConfig(params: {
  storeCode?: string | null
  mainCategoryFontSize: number
  categoryFontSize: number
  menuTileFontSize: number
  menuTileCols: number
  menuListFontSize: number
  menuListPageSize: number
  kioskGroupFontSize: number
}) {
  const res = await apiFetch('/api/savePosMenuScreenConfig', {
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
  const res = await apiFetch('/api/getPosMenuBoards?' + q.toString())
  return res.json() as Promise<PosMenuBoardConfig[]>
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
  const res = await apiFetch('/api/savePosMenuBoard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deletePosMenuBoard(params: { id: number }) {
  const res = await apiFetch('/api/deletePosMenuBoard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getPosPaymentSettings(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  const res = await apiFetch('/api/getPosPaymentSettings?' + q.toString())
  return res.json() as Promise<{ storeCode: string; cardKeys: string[]; qrKeys: string[] }>
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
  const res = await apiFetch('/api/getPosPaymentMethodItems?' + q.toString())
  return res.json() as Promise<PosPaymentMethodItem[]>
}

export async function savePosPaymentMethodItem(params: {
  id?: string
  storeCode?: string | null
  category: 'card' | 'qr' | 'delivery' | 'other'
  name: string
  hidden?: boolean
}) {
  const res = await apiFetch('/api/savePosPaymentMethodItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: string; message?: string }>
}

export async function savePosPaymentSettings(params: {
  storeCode: string
  cardKeys: string[]
  qrKeys: string[]
}) {
  const res = await apiFetch('/api/savePosPaymentSettings', {
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
  servedAt?: string | null
  servedBy?: string | null
}

export interface PosOrder {
  id: number
  orderNo: string
  storeCode: string
  orderType: string
  tableName: string
  memo: string
  discountAmt?: number
  discountReason?: string
  deliveryFee?: number
  packagingFee?: number
  paymentCash?: number
  paymentCard?: number
  paymentQr?: number
  paymentOther?: number
  memberId?: number
  memberNo?: string
  couponCode?: string
  couponDiscountAmt?: number
  pointUsed?: number
  pointEarned?: number
  items: PosOrderItem[]
  subtotal: number
  vat: number
  total: number
  status: string
  createdAt: string
}

export async function getPosTodaySales(params?: { storeCode?: string }) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  const res = await apiFetch('/api/getPosTodaySales?' + q.toString())
  return res.json() as Promise<{
    completedCount: number
    completedTotal: number
    pendingCount: number
  }>
}

export async function getPosOrders(params?: {
  startStr?: string
  endStr?: string
  storeCode?: string
  status?: string
}) {
  const q = new URLSearchParams()
  if (params?.startStr) q.set('startStr', params.startStr)
  if (params?.endStr) q.set('endStr', params.endStr)
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.status) q.set('status', params.status)
  const res = await apiFetch('/api/getPosOrders?' + q.toString())
  return res.json() as Promise<PosOrder[]>
}

export interface PosSettlement {
  id?: number
  storeCode: string
  settleDate: string
  cashActual: number | null
  cashAmt?: number
  cardAmt: number
  cardBreakdown?: Record<string, number>
  qrAmt: number
  qrBreakdown?: Record<string, number>
  deliveryAppAmt: number
  deliveryAppBreakdown?: Record<string, number>
  otherAmt: number
  memo: string
  closed: boolean
}

export async function getPosSettlement(params: {
  settleDate: string
  storeCode?: string
}) {
  const q = new URLSearchParams()
  q.set('settleDate', params.settleDate)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  const res = await apiFetch('/api/getPosSettlement?' + q.toString())
  return res.json() as Promise<{
    systemTotal: number
    systemSubtotal?: number
    systemVat?: number
    settlement: PosSettlement | PosSettlement[] | null
  }>
}

export async function savePosSettlement(params: {
  storeCode?: string
  settleDate: string
  cashActual?: number | null
  cashAmt?: number
  cardAmt?: number
  cardBreakdown?: Record<string, number>
  qrAmt?: number
  qrBreakdown?: Record<string, number>
  deliveryAppAmt?: number
  deliveryAppBreakdown?: Record<string, number>
  otherAmt?: number
  memo?: string
  closed?: boolean
}) {
  const res = await apiFetch('/api/savePosSettlement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updatePosOrder(params: {
  id: number
  items: PosOrderItem[]
  tableName?: string
  memo?: string
  discountAmt?: number
  discountReason?: string
  paymentCash?: number
  paymentCard?: number
  paymentQr?: number
  paymentOther?: number
  memberId?: number
  memberNo?: string
  couponCode?: string
  couponDiscountAmt?: number
  pointUsed?: number
  pointEarned?: number
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
  const res = await apiFetch('/api/updatePosOrder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updatePosOrderStatus(params: { id: number; status: string }) {
  const res = await apiFetch('/api/updatePosOrderStatus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function markPosOrderItemServed(params: {
  id: number
  itemId: string
  served: boolean
  servedBy?: string
}) {
  const res = await apiFetch('/api/markPosOrderItemServed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; servedCount?: number; totalCount?: number }>
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
  deliveryFee?: number
  packagingFee?: number
  paymentCash?: number
  paymentCard?: number
  paymentQr?: number
  paymentOther?: number
  memberId?: number
  memberNo?: string
  couponCode?: string
  couponDiscountAmt?: number
  pointUsed?: number
  pointEarned?: number
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
  const res = await apiFetch('/api/savePosOrder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; orderId?: number; orderNo?: string; message?: string }>
}

export async function getLineMembers(params?: { q?: string; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const suffix = q.toString()
  const res = await apiFetch('/api/members/line' + (suffix ? `?${suffix}` : ''))
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
  const res = await apiFetch(`/api/members/${params.memberId}/link-line`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function unlinkMemberLine(params: { memberId: number; lineUserId?: string }) {
  const res = await apiFetch(`/api/members/${params.memberId}/unlink-line`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function syncLineMembers(params?: { limit?: number }) {
  const res = await apiFetch('/api/members/line-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: params?.limit ?? 2000 }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    scanned?: number
    synced?: number
    failed?: number
    hasNextCursor?: boolean
    nextCursor?: string
    errors?: string[]
  }>
}

export async function importLineCrmFile(params: { file: File }) {
  const form = new FormData()
  form.set('file', params.file)
  const res = await apiFetch('/api/members/line-import', {
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

export async function getMemberPoints(params?: { memberId?: number; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.memberId) q.set('memberId', String(params.memberId))
  if (params?.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetch('/api/member-points?' + q.toString())
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
  const res = await apiFetch('/api/member-points/adjust', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getMemberTiers() {
  const res = await apiFetch('/api/member-tiers')
  return res.json() as Promise<Array<{ code: string; name: string; min_amount: number; point_rate: number }>>
}

export async function saveMemberTier(params: { code: string; name: string; minAmount: number; pointRate: number }) {
  const res = await apiFetch('/api/member-tiers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function recalculateMemberTier(params?: { memberId?: number }) {
  const res = await apiFetch('/api/member-tiers/recalculate', {
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
  const res = await apiFetch('/api/member-visits' + (suffix ? `?${suffix}` : ''))
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

export async function getMemberCoupons(params?: { memberId?: number; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.memberId) q.set('memberId', String(params.memberId))
  if (params?.limit != null) q.set('limit', String(params.limit))
  const suffix = q.toString()
  const res = await apiFetch('/api/member-coupons' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<Array<{
    id: number
    memberId: number
    couponCode: string
    issuedAt: string
    usedAt: string
    orderId: number | null
    status: string
  }>>
}

export async function issueMemberCoupon(params: { memberId: number; couponCode: string }) {
  const res = await apiFetch('/api/member-coupons', {
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
  phone: string
  email: string
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
  createdAt?: string
  updatedAt?: string
}

export async function getMembers(params?: { q?: string; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const suffix = q.toString()
  const res = await apiFetch('/api/members' + (suffix ? `?${suffix}` : ''))
  const json = await res.json().catch(() => [])
  if (!Array.isArray(json)) return []
  return json as Member[]
}

export async function createMember(params: {
  name: string
  phone?: string
  email?: string
  source?: string
  lineUserId?: string
  lineDisplayName?: string
  linePictureUrl?: string
}) {
  const res = await apiFetch('/api/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; member?: Member }>
}

export async function updateMember(params: {
  id: number
  name?: string
  fullName?: string
  lineDisplayName?: string
  birthDate?: string
  gender?: string
  phone?: string
  email?: string
  consentMarketing?: boolean
  consentPrivacy?: boolean
  consentAt?: string
  status?: string
}) {
  const res = await apiFetch(`/api/members/${params.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      fullName: params.fullName,
      lineDisplayName: params.lineDisplayName,
      birthDate: params.birthDate,
      gender: params.gender,
      phone: params.phone,
      email: params.email,
      consentMarketing: params.consentMarketing,
      consentPrivacy: params.consentPrivacy,
      consentAt: params.consentAt,
      status: params.status,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string; member?: Member }>
}

export async function registerLineMember(params: {
  lineUserId: string
  displayName?: string
  pictureUrl?: string
  phone?: string
  email?: string
  name?: string
}) {
  const res = await apiFetch('/api/members/line-register', {
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
  const res = await apiFetch('/api/saveVendor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteVendor(params: { code: string }) {
  const res = await apiFetch('/api/deleteVendor', {
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
  inbound_batch_id?: number | null
  po_created_at?: string | null
  code?: string
  purchaseSource?: 'hq' | 'store'
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
  const res = await apiFetch(`/api/getInboundBatch?batchId=${batchId}`)
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
  const res = await apiFetch('/api/updateInboundBatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteInboundBatch(batchId: number) {
  const res = await apiFetch('/api/deleteInboundBatch', {
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
  const res = await apiFetch('/api/registerInboundBatch', {
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
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
    ...(params.vendorFilter ? { vendorFilter: params.vendorFilter } : {}),
    ...(params.storeFilter ? { storeFilter: params.storeFilter } : {}),
  })
  const res = await apiFetch(`/api/getInboundHistory?${q}`)
  return res.json() as Promise<InboundHistoryItem[]>
}

export async function getInboundForStore(params: {
  storeName: string
  startStr: string
  endStr: string
  vendorFilter?: string
}) {
  const q = new URLSearchParams({
    storeName: params.storeName,
    startStr: params.startStr,
    endStr: params.endStr,
    ...(params.vendorFilter ? { vendorFilter: params.vendorFilter } : {}),
  })
  const res = await apiFetch(`/api/getInboundForStore?${q}`)
  return res.json() as Promise<InboundHistoryItem[]>
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
  options?: { processorName?: string }
) {
  const payload = options?.processorName ? { list, processorName: options.processorName } : list
  const res = await apiFetch('/api/forceOutboundBatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 강제출고 수령 완료 처리 */
export async function updateForceOutboundReceived(params: { date: string; vendorTarget: string }) {
  const res = await apiFetch('/api/updateForceOutboundReceived', {
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
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.vendorFilter) q.set('vendorFilter', params.vendorFilter)
  if (params.typeFilter) q.set('typeFilter', params.typeFilter)
  const res = await apiFetch(`/api/getCombinedOutboundHistory?${q}`)
  return res.json() as Promise<OutboundHistoryItem[]>
}

/** 주문 수령 사진 온디맨드 조회 (출고 내역에서 사진 클릭 시) */
export async function getOrderReceivePhoto(orderId: string) {
  const res = await apiFetch(`/api/getOrderReceivePhoto?orderId=${encodeURIComponent(orderId)}`)
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
  const res = await apiFetch('/api/generateEtaxXml', {
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
  const res = await apiFetch(`/api/getOutboundByWarehouse?${q}`)
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
  const res = await apiFetch('/api/getInvoiceData')
  return res.json() as Promise<{ company: InvoiceDataCompany; clients: Record<string, InvoiceDataClient> }>
}

export type InvoiceSettings = Record<string, string>

export async function getInvoiceSettings() {
  const res = await apiFetch('/api/getInvoiceSettings')
  return res.json() as Promise<InvoiceSettings>
}

export async function updateInvoiceSettings(settings: InvoiceSettings) {
  const res = await apiFetch('/api/updateInvoiceSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

// ─── 직원 관리 (Employees) ───
export interface AdminEmployeeItem {
  row: number
  store: string
  name: string
  nick: string
  phone: string
  job: string
  birth: string
  nation: string
  join: string
  resign: string
  salType: string
  salAmt: number
  pw: string
  role: string
  email: string
  idNumber: string
  idCardPhoto: string
  taxId: string
  ssoNumber: string
  address: string
  bankName: string
  accountNumber: string
  positionAllowance: number
  riskAllowance: number
  grade: string
  photo: string
}

export async function getAdminEmployeeList(params: { userStore: string; userRole: string }) {
  const q = new URLSearchParams({
    userStore: params.userStore,
    userRole: params.userRole,
  })
  const res = await apiFetch(`/api/getAdminEmployeeList?${q}`)
  const data = await res.json()
  return {
    list: (data.list || []) as AdminEmployeeItem[],
    stores: (data.stores || []) as string[],
    _debug: data._debug as Record<string, unknown> | undefined,
  }
}

export async function getEmployeeLatestGrades() {
  const res = await apiFetch('/api/getEmployeeLatestGrades')
  return res.json() as Promise<Record<string, { grade: string }>>
}

export async function saveAdminEmployee(params: {
  d: Partial<AdminEmployeeItem> & { row: number }
  userStore: string
  userRole: string
  userName?: string
}) {
  const res = await apiFetch('/api/saveAdminEmployee', {
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
}) {
  const res = await apiFetch('/api/deleteAdminEmployee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 평가 항목 조회 (kitchen | service) */
export async function getEvaluationItems(params: {
  type: 'kitchen' | 'service'
  activeOnly?: boolean
}) {
  const q = new URLSearchParams({
    type: params.type,
    activeOnly: String(params.activeOnly === true),
  })
  const res = await apiFetch(`/api/getEvaluationItems?${q}`)
  return res.json() as Promise<{ id: string | number; main: string; sub: string; name: string; use?: boolean }[]>
}

/** 평가 이력 조회 */
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
  const res = await apiFetch(`/api/getEvaluationHistory?${q}`)
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

/** 평가 항목 일괄 수정 */
export async function updateEvaluationItems(params: {
  type: 'kitchen' | 'service'
  updates: { id: string | number; main?: string; sub?: string; name?: string; use?: boolean; sort_order?: number }[]
}) {
  const res = await apiFetch('/api/updateEvaluationItems', {
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
  type: 'kitchen' | 'service'
  mainCat?: string
  subCat?: string
  itemName?: string
}) {
  const res = await apiFetch('/api/addEvaluationItem', {
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
  type: 'kitchen' | 'service'
  itemId: string | number
}) {
  const res = await apiFetch('/api/deleteEvaluationItem', {
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

/** 평가 결과 저장 (오피스 직원 이상만 가능) */
export async function saveEvaluationResult(params: {
  type: 'kitchen' | 'service'
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
  const res = await apiFetch('/api/saveEvaluationResult', {
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
  const q = new URLSearchParams({ activeOnly: String(activeOnly) })
  const res = await apiFetch(`/api/getChecklistItems?${q}`)
  return res.json() as Promise<ChecklistItem[]>
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
  const res = await apiFetch('/api/saveCheckResult', {
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
  const q = new URLSearchParams({
    start: params.startStr,
    end: params.endStr,
    ...(params.store && params.store !== 'All' && { store: params.store }),
    ...(params.inspector && { inspector: params.inspector }),
  })
  const res = await apiFetch(`/api/getCheckHistory?${q}`)
  return res.json() as Promise<CheckHistoryItem[]>
}

export async function deleteCheckHistory(id: string) {
  const res = await apiFetch('/api/deleteCheckHistory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.msg || '삭제 실패')
  return true
}

export async function updateChecklistItems(updates: { id: string | number; main?: string; sub?: string; name?: string; use?: boolean; sort_order?: number }[]) {
  const res = await apiFetch('/api/updateChecklistItems', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.msg || '저장 실패')
  return true
}

export async function addChecklistItem(params: { main?: string; sub?: string; name?: string }) {
  const res = await apiFetch('/api/addChecklistItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; id?: number; message?: string }
  if (!res.ok || !data.success) throw new Error(data.message || '추가 실패')
  return data
}

export async function deleteChecklistItem(id: string | number) {
  const res = await apiFetch('/api/deleteChecklistItem', {
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
  const res = await apiFetch(`/api/getStoreVisitHistory?${q}`)
  return res.json() as Promise<StoreVisitHistoryItem[]>
}

export interface StoreVisitStatsItem {
  label: string
  minutes: number
}

export async function getStoreVisitStats(params: { startStr: string; endStr: string }) {
  const q = new URLSearchParams({ start: params.startStr, end: params.endStr })
  const res = await apiFetch(`/api/getStoreVisitStats?${q}`)
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
  const res = await apiFetch(`/api/getStoreVisitRecords?${q}`)
  return res.json() as Promise<VisitRecord[]>
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
  const res = await apiFetch(`/api/getComplaintLogList?${q}`)
  return res.json() as Promise<ComplaintLogItem[]>
}

export async function saveComplaintLog(data: Record<string, unknown>) {
  const res = await apiFetch('/api/saveComplaintLog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateComplaintLog(rowOrId: string | number, data: Record<string, unknown>) {
  const res = await apiFetch('/api/updateComplaintLog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rowOrId, data }),
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
  const res = await apiFetch('/api/getHeadOfficeInfo')
  return res.json() as Promise<HeadOfficeInfo>
}

export async function saveHeadOfficeInfo(data: HeadOfficeInfo) {
  const res = await apiFetch('/api/saveHeadOfficeInfo', {
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
  address: string
  taxId?: string
  phone?: string
  bankAccountNo?: string | null
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
  const res = await apiFetch('/api/getPurchaseLocations')
  return res.json() as Promise<PurchaseLocation[]>
}

export async function getVendorsForPurchase() {
  const res = await apiFetch('/api/getVendorsForPurchase')
  return res.json() as Promise<VendorForPurchase[]>
}

export async function getVendorsForSales() {
  const res = await apiFetch('/api/getVendorsForSales')
  return res.json() as Promise<{ name: string }[]>
}

export async function getItemsByVendor(
  vendorCode: string,
  vendorName?: string,
  outboundLocation?: string
) {
  const q = new URLSearchParams({ vendorCode })
  if (vendorName?.trim()) q.set('vendorName', vendorName.trim())
  if (outboundLocation?.trim()) q.set('outboundLocation', outboundLocation.trim())
  const res = await apiFetch(`/api/getItemsByVendor?${q}`)
  return res.json() as Promise<ItemByVendor[]>
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
  const res = await apiFetch(`/api/getItemVendors?${q}`)
  return res.json() as Promise<ItemVendorRow[]>
}

export async function saveItemVendors(params: {
  itemCode: string
  vendors: { vendorCode: string; priority?: number; unitPrice?: number | null; minOrderQty?: number | null; memo?: string | null }[]
}) {
  const res = await apiFetch('/api/saveItemVendors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getHqStockByLocation(locationCode: string) {
  const q = new URLSearchParams({ locationCode })
  const res = await apiFetch(`/api/getHqStockByLocation?${q}`)
  return res.json() as Promise<Record<string, number>>
}

export async function savePurchaseOrder(params: {
  vendorCode: string
  vendorName: string
  locationName: string
  locationAddress: string
  locationCode: string
  cart: { code: string; name: string; price: number; cost?: number; qty: number }[]
  userName: string
  withholdingTaxAmount?: number
  withholdingTaxRate?: number
}) {
  const res = await apiFetch('/api/savePurchaseOrder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; poNo?: string; message?: string }>
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
  const q = new URLSearchParams()
  if (params?.vendorCode?.trim()) q.set('vendorCode', params.vendorCode.trim())
  if (params?.poId && !isNaN(params.poId)) q.set('poId', String(params.poId))
  if (params?.startDate?.trim()) q.set('startDate', params.startDate.trim())
  if (params?.endDate?.trim()) q.set('endDate', params.endDate.trim())
  const url = q.toString() ? `/api/getPurchaseOrders?${q}` : '/api/getPurchaseOrders'
  const res = await apiFetch(url)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function updatePurchaseOrderInvoice(params: {
  poId: number
  invoiceReceived?: boolean
  invoiceNo?: string
  withholdingTaxAmount?: number
  withholdingTaxRate?: number
}) {
  const res = await apiFetch('/api/updatePurchaseOrderInvoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function processPurchaseOrderApproval(params: { poId: number }) {
  const res = await apiFetch('/api/processPurchaseOrderApproval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function processPurchaseOrderCancel(params: { poId: number }) {
  const res = await apiFetch('/api/processPurchaseOrderCancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getMenuPermission(store: string, name: string) {
  const q = new URLSearchParams({ store, name })
  const res = await apiFetch(`/api/getMenuPermission?${q}`)
  return res.json() as Promise<Record<string, number>>
}

export async function setMenuPermission(
  store: string,
  name: string,
  permissions: Record<string, number>
) {
  const res = await apiFetch('/api/setMenuPermission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, name, perm: permissions }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
