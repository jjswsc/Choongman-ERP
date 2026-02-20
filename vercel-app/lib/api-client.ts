/**
 * API 클라이언트
 * core fetch/auth는 lib/api/ 에서 분리
 */
import { apiFetch } from './api/fetch'

export { apiFetch } from './api/fetch'
export { getLoginData, loginCheck, changePassword } from './api/auth'
export { useStoreList } from './use-store-list'

export interface NoticeItem {
  id: number
  date: string
  title: string
  content: string
  sender: string
  status: string
  attachments: unknown[]
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
}

export async function getAppData(storeName: string, asOfDate?: string) {
  const params = new URLSearchParams({ storeName })
  if (asOfDate && asOfDate.trim()) params.set('asOfDate', asOfDate.trim())
  const res = await apiFetch(`/api/getAppData?${params}`)
  const data = await res.json()
  return { items: (data.items || []) as AppItem[], stock: data.stock || {} }
}

// ─── 재고 현황 (Stock) ───
export interface StockStatusItem {
  code: string
  name: string
  spec: string
  qty: number
  safeQty: number
  store: string
  price?: number
  cost?: number
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
  summary: string
  total: number
  status: string
  deliveryStatus?: string
  items: { name?: string; qty?: number; price?: number; receivedQty?: number }[]
  receivedIndices?: number[]
  userName?: string
  rejectReason?: string
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
  items: { code?: string; name?: string; spec?: string; category?: string; vendor?: string; outboundLocation?: string; qty?: number; price?: number; originalQty?: number }[]
  summary: string
  receivedIndices?: number[]
}

export async function getAdminOrders(params: {
  startStr: string
  endStr: string
  store?: string
  deliveryStatus?: string
  status?: string
  userStore?: string
  userRole?: string
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
  rejectReason?: string
  userRole?: string
  updatedCart?: { code?: string; name?: string; spec?: string; price: number; qty: number }[]
}) {
  const res = await apiFetch('/api/processOrderDecision', {
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
  return res.json() as Promise<{ success: boolean; message?: string }>
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
  return res.json() as Promise<{ stores: string[]; roles: string[] }>
}

export async function sendNotice(params: {
  title: string
  content: string
  targetStore: string
  targetRole: string
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
}) {
  const q = new URLSearchParams({
    sender: params.sender,
    startDate: params.startDate,
    endDate: params.endDate,
  })
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
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

export async function processLeaveApproval(params: { id: number; decision: string; userStore?: string; userRole?: string }) {
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

export async function processAttendanceApproval(params: { id: number; decision: string; optOtMinutes?: number | null; waiveLate?: boolean; userStore?: string; userRole?: string }) {
  const res = await apiFetch('/api/processAttendanceApproval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
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
  otMin: number
  status: string
  approval: string
  pendingId: number | null
  pendingInId?: number | null
  pendingOutId?: number | null
  inStatus?: string
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

export interface WeeklyScheduleItem extends TodayScheduleItem {}

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
  return res.json() as Promise<{ success: boolean; message?: string }>
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
}

export async function getPettyCashList(params: {
  startStr: string
  endStr: string
  storeFilter?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  const res = await apiFetch(`/api/getPettyCashList?${q}`)
  return res.json() as Promise<PettyCashItem[]>
}

/** 해당 월 거래 전체 + 실시간 잔액 */
export async function getPettyCashMonthDetail(params: {
  yearMonth: string
  storeFilter?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams({ yearMonth: params.yearMonth })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
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

// ─── 미수금/미지급금 관리 ───
export interface ReceivablePayableItem {
  storeName?: string
  vendorCode?: string
  balance: number
  items: { id?: number; trans_date?: string; ref_type?: string; amount?: number; memo?: string }[]
}

export async function getReceivablePayableList(params: {
  type: 'receivable' | 'payable'
  storeFilter?: string
  vendorFilter?: string
  startStr: string
  endStr: string
}) {
  const q = new URLSearchParams({
    type: params.type,
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.vendorFilter) q.set('vendorFilter', params.vendorFilter)
  const res = await apiFetch(`/api/getReceivablePayableList?${q}`)
  const data = await res.json()
  return data as { type: string; list: ReceivablePayableItem[] }
}

export async function addBalanceTransaction(params: {
  type: 'payable' | 'receivable'
  vendorCode?: string
  storeName?: string
  amount: number
  transDate: string
  memo?: string
}) {
  const res = await apiFetch('/api/addBalanceTransaction', {
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
  price: number
  cost: number
  taxType: 'taxable' | 'exempt' | 'zero'
  imageUrl: string
  hasImage: boolean
}

export interface AdminVendor {
  code: string
  name: string
  gps_name?: string
  contact: string
  phone: string
  email: string
  address: string
  tax_no?: string
  type: 'purchase' | 'sales' | 'both'
  memo: string
}

export async function getAdminItems() {
  const res = await apiFetch('/api/getItems')
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
  price?: number
  cost?: number
  taxType?: string
  imageUrl?: string
  editingCode?: string
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

// ─── POS 메뉴 관리 ───
export interface PosMenu {
  id: string
  code: string
  name: string
  category: string
  price: number
  priceDelivery?: number | null
  imageUrl: string
  vatIncluded: boolean
  isActive: boolean
  sortOrder: number
  soldOutDate?: string | null
}

export interface PosMenuOption {
  id: string
  menuId: string
  name: string
  priceModifier: number
  priceModifierDelivery?: number | null
  sortOrder: number
}

export async function getPosMenus() {
  const res = await apiFetch('/api/getPosMenus')
  return res.json() as Promise<PosMenu[]>
}

export async function getPosMenuCategories() {
  const res = await apiFetch('/api/getPosMenuCategories')
  return res.json() as Promise<{ categories: string[] }>
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
  sortOrder?: number
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
  quantity: number
}

export async function getPosMenuIngredients(params: { menuId: string }) {
  const q = new URLSearchParams()
  q.set('menuId', params.menuId)
  const res = await apiFetch('/api/getPosMenuIngredients?' + q.toString())
  return res.json() as Promise<PosMenuIngredient[]>
}

export async function savePosMenuIngredient(params: {
  id?: string
  menuId: number
  itemCode: string
  quantity?: number
}) {
  const res = await apiFetch('/api/savePosMenuIngredient', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
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
  price?: number
  priceDelivery?: number | null
  imageUrl?: string
  vatIncluded?: boolean
  isActive?: boolean
  sortOrder?: number
}) {
  const res = await apiFetch('/api/savePosMenu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
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

export interface PosOrderItem {
  id: string
  name: string
  price: number
  qty: number
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
  cardAmt: number
  qrAmt: number
  deliveryAppAmt: number
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
  cardAmt?: number
  qrAmt?: number
  deliveryAppAmt?: number
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

export async function savePosOrder(params: {
  storeCode?: string
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
  items: PosOrderItem[]
}) {
  const res = await apiFetch('/api/savePosOrder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; orderId?: number; orderNo?: string; message?: string }>
}

export async function saveVendor(params: {
  code: string
  name: string
  gps_name?: string
  contact?: string
  phone?: string
  email?: string
  address?: string
  tax_no?: string
  type?: string
  memo?: string
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
  amount: number
}

export async function registerInboundBatch(list: {
  date?: string
  vendor: string
  code: string
  name?: string
  spec?: string
  qty: number | string
}[]) {
  const res = await apiFetch('/api/registerInboundBatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(list),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getInboundHistory(params: {
  startStr: string
  endStr: string
  vendorFilter?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
    ...(params.vendorFilter ? { vendorFilter: params.vendorFilter } : {}),
  })
  const res = await apiFetch(`/api/getInboundHistory?${q}`)
  return res.json() as Promise<InboundHistoryItem[]>
}

export async function getInboundForStore(params: {
  storeName: string
  startStr: string
  endStr: string
}) {
  const q = new URLSearchParams(params)
  const res = await apiFetch(`/api/getInboundForStore?${q}`)
  return res.json() as Promise<InboundHistoryItem[]>
}

// ─── 출고 관리 (Outbound) ───
export interface OutboundHistoryItem {
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
  receivedIndices?: number[]
  originalOrderQty?: number
  totalOrderItems?: number
}

export async function forceOutboundBatch(list: {
  date?: string
  deliveryDate?: string
  store: string
  code: string
  name?: string
  spec?: string
  qty: number | string
}[]) {
  const res = await apiFetch('/api/forceOutboundBatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(list),
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
  annualLeaveDays: number
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
  updates: { id: string | number; name?: string; use?: boolean }[]
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

export async function updateChecklistItems(updates: { id: string | number; name?: string; use?: boolean }[]) {
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
}

export async function getPurchaseLocations() {
  const res = await apiFetch('/api/getPurchaseLocations')
  return res.json() as Promise<PurchaseLocation[]>
}

export async function getVendorsForPurchase() {
  const res = await apiFetch('/api/getVendorsForPurchase')
  return res.json() as Promise<VendorForPurchase[]>
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
}

export async function getPurchaseOrders() {
  const res = await apiFetch('/api/getPurchaseOrders')
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function processPurchaseOrderApproval(params: { poId: number }) {
  const res = await apiFetch('/api/processPurchaseOrderApproval', {
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
