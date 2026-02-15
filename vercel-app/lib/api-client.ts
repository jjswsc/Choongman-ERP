/**
 * API 클라이언트 - 로그인 등
 */
export async function getLoginData() {
  const res = await fetch('/api/getLoginData')
  return res.json() as Promise<{ users: Record<string, string[]>; vendors: string[] }>
}

export async function loginCheck(params: {
  store: string
  name: string
  pw: string
  isAdminPage?: boolean
}) {
  const res = await fetch('/api/loginCheck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    storeName?: string
    userName?: string
    role?: string
  }>
}

export async function changePassword(params: {
  store: string
  name: string
  oldPw: string
  newPw: string
}) {
  const res = await fetch('/api/changePassword', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

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
  const res = await fetch(`/api/getMyNotices?${q}`)
  return res.json() as Promise<NoticeItem[]>
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
  const res = await fetch(`/api/getAppData?${params}`)
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
  const res = await fetch('/api/saveSafetyStock', {
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
  const res = await fetch(`/api/getAdjustmentHistory?${q}`)
  return res.json() as Promise<AdjustmentHistoryItem[]>
}

export async function getStockStores() {
  const res = await fetch('/api/getStockStores')
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
  const res = await fetch('/api/adjustStock', {
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
  const res = await fetch('/api/processOrder', {
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
  items: { name?: string; qty?: number; price?: number }[]
  receivedIndices?: number[]
}

export async function getMyOrderHistory(params: {
  store: string
  startStr: string
  endStr: string
}) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/getMyOrderHistory?${q}`)
  return res.json() as Promise<OrderHistoryItem[]>
}

export interface UsageHistoryItem {
  date: string
  dateTime: string
  item: string
  qty: number
  amount: number
}

export async function processUsage(params: {
  storeName: string
  userName?: string
  items: { code?: string; name?: string; qty: number }[]
}) {
  const res = await fetch('/api/processUsage', {
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
  const res = await fetch(`/api/getMyUsageHistory?${q}`)
  return res.json() as Promise<UsageHistoryItem[]>
}

export async function processOrderReceive(params: {
  orderRowId: number
  imageUrl?: string
  isPartialReceive?: boolean
  inspectedIndices?: number[]
}) {
  const res = await fetch('/api/processOrderReceive', {
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
  total: number
  status: string
  deliveryStatus: string
  deliveryDate: string
  items: { code?: string; name?: string; spec?: string; qty?: number; price?: number }[]
  summary: string
  receivedIndices?: number[]
}

export async function getAdminOrders(params: {
  startStr: string
  endStr: string
  store?: string
  deliveryStatus?: string
  status?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.store) q.set('store', params.store)
  if (params.deliveryStatus) q.set('deliveryStatus', params.deliveryStatus)
  if (params.status) q.set('status', params.status)
  const res = await fetch(`/api/getAdminOrders?${q}`)
  const data = await res.json()
  return {
    list: (data.list || []) as AdminOrderItem[],
    stores: (data.stores || []) as string[],
  }
}

export async function processOrderDecision(params: {
  orderId: number
  decision: 'Approved' | 'Rejected' | 'Hold'
  deliveryDate?: string
}) {
  const res = await fetch('/api/processOrderDecision', {
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
  const res = await fetch('/api/updateOrderDeliveryStatus', {
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
  const res = await fetch('/api/updateOrderCart', {
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
  const res = await fetch(`/api/getTodayAttendanceTypes?${q}`)
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
  const res = await fetch(`/api/getAttendanceList?${q}`)
  return res.json() as Promise<AttendanceLogItem[]>
}

export async function submitAttendance(params: {
  storeName: string
  name: string
  type: string
  lat: string | number
  lng: string | number
}) {
  const res = await fetch('/api/submitAttendance', {
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
  const res = await fetch('/api/requestLeave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface LeaveHistoryItem {
  date: string
  type: string
  reason: string
  status: string
}

export async function getMyLeaveInfo(params: { store: string; name: string }) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/getMyLeaveInfo?${q}`)
  return res.json() as Promise<{
    history: LeaveHistoryItem[]
    stats: { usedAnn: number; usedSick: number; remain: number }
  }>
}

// ─── 관리 (Admin) ───
export async function getNoticeOptions() {
  const res = await fetch('/api/getNoticeOptions')
  return res.json() as Promise<{ stores: string[]; roles: string[] }>
}

export async function sendNotice(params: {
  title: string
  content: string
  targetStore: string
  targetRole: string
  sender: string
  userStore?: string
  userRole?: string
}) {
  const res = await fetch('/api/sendNotice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface SentNoticeItem {
  id: string
  title: string
  date: string
  recipients: string[]
  preview: string
  content?: string
  readCount: number
  totalCount: number
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
  const res = await fetch(`/api/getSentNotices?${q}`)
  return res.json() as Promise<SentNoticeItem[]>
}

export async function deleteNoticeAdmin(params: { id: number }) {
  const res = await fetch('/api/deleteNoticeAdmin', {
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
  const res = await fetch(`/api/getLeavePendingList?${q}`)
  return res.json() as Promise<{ id: number; store: string; name: string; nick: string; type: string; date: string; requestDate: string; reason: string; status: string }[]>
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
  const res = await fetch(`/api/getLeaveStats?${q}`)
  return res.json() as Promise<{ store: string; name: string; usedPeriodAnnual: number; usedPeriodSick: number; usedPeriodUnpaid: number; usedTotalAnnual: number; usedTotalSick: number; usedTotalUnpaid: number; remain: number }[]>
}

export async function processLeaveApproval(params: { id: number; decision: string; userStore?: string; userRole?: string }) {
  const res = await fetch('/api/processLeaveApproval', {
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
  const q = new URLSearchParams(params as Record<string, string>)
  const res = await fetch(`/api/getAttendancePendingList?${q}`)
  return res.json() as Promise<{ id: number; log_at: string; store_name: string; name: string; log_type: string; status?: string; approved?: string }[]>
}

export async function processAttendanceApproval(params: { id: number; decision: string; optOtMinutes?: number | null; userStore?: string; userRole?: string }) {
  const res = await fetch('/api/processAttendanceApproval', {
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
  const res = await fetch(`/api/getAttendanceRecordsAdmin?${q}`)
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
  const res = await fetch('/api/getWorkLogStaffList')
  return res.json() as Promise<{ staff: { name: string; displayName: string }[] }>
}

export async function getWorkLogOfficeOptions() {
  const res = await fetch('/api/getWorkLogOfficeOptions')
  return res.json() as Promise<{ staff: { name: string; displayName: string }[]; depts: string[] }>
}

export async function getWorkLogData(params: { dateStr: string; name: string }) {
  const q = new URLSearchParams({
    dateStr: params.dateStr,
    name: params.name,
  })
  const res = await fetch(`/api/getWorkLogData?${q}`)
  return res.json() as Promise<WorkLogData>
}

export async function saveWorkLogData(params: {
  date: string
  name: string
  logs: WorkLogItem[]
}) {
  const res = await fetch('/api/saveWorkLogData', {
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
  const res = await fetch('/api/submitDailyClose', {
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
  const res = await fetch('/api/updateManagerCheck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
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
  const res = await fetch(`/api/getWorkLogManagerReport?${q}`)
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
  const res = await fetch(`/api/getWorkLogWeekly?${q}`)
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
  const res = await fetch(`/api/getTodaySchedule?${q}`)
  return res.json() as Promise<TodayScheduleItem[]>
}

export async function getTodayAttendanceSummary(params: {
  store: string
  date: string
}) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/getTodayAttendanceSummary?${q}`)
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
  const res = await fetch(`/api/getWeeklySchedule?${q}`)
  return res.json() as Promise<WeeklyScheduleItem[]>
}

export async function saveSchedule(params: {
  store: string
  monday: string
  rows: { date: string; name: string; pIn?: string; pOut?: string; pBS?: string; pBE?: string; remark?: string }[]
}) {
  const res = await fetch('/api/saveSchedule', {
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
  const res = await fetch(`/api/getMyAttendanceSummary?${q}`)
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
  const res = await fetch(`/api/getTodayMyVisits?${q}`)
  return res.json() as Promise<TodayVisitItem[]>
}

export async function checkUserVisitStatus(params: { userName: string }) {
  const q = new URLSearchParams({ userName: params.userName })
  const res = await fetch(`/api/checkUserVisitStatus?${q}`)
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
  const res = await fetch('/api/submitStoreVisit', {
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
  const res = await fetch(`/api/getPettyCashList?${q}`)
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
  const res = await fetch(`/api/getPettyCashMonthDetail?${q}`)
  return res.json() as Promise<PettyCashItem[]>
}

/** 사용자 입력 내용(memo 등) 번역 - 로그인 언어로 표시 */
export async function translateTexts(texts: string[], targetLang: string): Promise<string[]> {
  const filtered = texts.filter((s) => s && String(s).trim())
  if (filtered.length === 0) return []
  const res = await fetch('/api/translate', {
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
  const res = await fetch('/api/addPettyCashTransaction', {
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
  contact: string
  phone: string
  email: string
  address: string
  type: 'purchase' | 'sales' | 'both'
  memo: string
}

export async function getAdminItems() {
  const res = await fetch('/api/getItems')
  return res.json() as Promise<AdminItem[]>
}

export async function getAdminVendors() {
  const res = await fetch('/api/getVendors')
  return res.json() as Promise<AdminVendor[]>
}

export async function saveItem(params: {
  code: string
  name: string
  category?: string
  vendor?: string
  spec?: string
  price?: number
  cost?: number
  taxType?: string
  imageUrl?: string
  editingCode?: string
}) {
  const res = await fetch('/api/saveItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteItem(params: { code: string }) {
  const res = await fetch('/api/deleteItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function saveVendor(params: {
  code: string
  name: string
  contact?: string
  phone?: string
  email?: string
  address?: string
  type?: string
  memo?: string
  editingCode?: string
}) {
  const res = await fetch('/api/saveVendor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteVendor(params: { code: string }) {
  const res = await fetch('/api/deleteVendor', {
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
  const res = await fetch('/api/registerInboundBatch', {
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
  const res = await fetch(`/api/getInboundHistory?${q}`)
  return res.json() as Promise<InboundHistoryItem[]>
}

export async function getInboundForStore(params: {
  storeName: string
  startStr: string
  endStr: string
}) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/getInboundForStore?${q}`)
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
  const res = await fetch('/api/forceOutboundBatch', {
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
  const res = await fetch(`/api/getCombinedOutboundHistory?${q}`)
  return res.json() as Promise<OutboundHistoryItem[]>
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
  const res = await fetch('/api/getInvoiceData')
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
  const res = await fetch(`/api/getAdminEmployeeList?${q}`)
  const data = await res.json()
  return {
    list: (data.list || []) as AdminEmployeeItem[],
    stores: (data.stores || []) as string[],
  }
}

export async function getEmployeeLatestGrades() {
  const res = await fetch('/api/getEmployeeLatestGrades')
  return res.json() as Promise<Record<string, { grade: string }>>
}

export async function saveAdminEmployee(params: {
  d: Partial<AdminEmployeeItem> & { row: number }
  userStore: string
  userRole: string
}) {
  const res = await fetch('/api/saveAdminEmployee', {
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
  const res = await fetch('/api/deleteAdminEmployee', {
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
  const res = await fetch(`/api/getEvaluationItems?${q}`)
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
  const res = await fetch(`/api/getEvaluationHistory?${q}`)
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
  const res = await fetch('/api/updateEvaluationItems', {
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
  const res = await fetch('/api/addEvaluationItem', {
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
  const res = await fetch('/api/deleteEvaluationItem', {
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

/** 평가 결과 저장 */
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
}) {
  const res = await fetch('/api/saveEvaluationResult', {
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
  const res = await fetch(`/api/getChecklistItems?${q}`)
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
  const res = await fetch('/api/saveCheckResult', {
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
  const res = await fetch(`/api/getCheckHistory?${q}`)
  return res.json() as Promise<CheckHistoryItem[]>
}

export async function deleteCheckHistory(id: string) {
  const res = await fetch('/api/deleteCheckHistory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.msg || '삭제 실패')
  return true
}

export async function updateChecklistItems(updates: { id: string | number; name?: string; use?: boolean }[]) {
  const res = await fetch('/api/updateChecklistItems', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.msg || '저장 실패')
  return true
}

export async function addChecklistItem(params: { main?: string; sub?: string; name?: string }) {
  const res = await fetch('/api/addChecklistItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; id?: number; message?: string }
  if (!res.ok || !data.success) throw new Error(data.message || '추가 실패')
  return data
}

export async function deleteChecklistItem(id: string | number) {
  const res = await fetch('/api/deleteChecklistItem', {
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
  const res = await fetch(`/api/getStoreVisitHistory?${q}`)
  return res.json() as Promise<StoreVisitHistoryItem[]>
}

export interface StoreVisitStatsItem {
  label: string
  minutes: number
}

export async function getStoreVisitStats(params: { startStr: string; endStr: string }) {
  const q = new URLSearchParams({ start: params.startStr, end: params.endStr })
  const res = await fetch(`/api/getStoreVisitStats?${q}`)
  return res.json() as Promise<{
    byDept: StoreVisitStatsItem[]
    byEmployee: StoreVisitStatsItem[]
    byStore: StoreVisitStatsItem[]
    byPurpose: StoreVisitStatsItem[]
  }>
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
  const res = await fetch(`/api/getComplaintLogList?${q}`)
  return res.json() as Promise<ComplaintLogItem[]>
}

export async function saveComplaintLog(data: Record<string, unknown>) {
  const res = await fetch('/api/saveComplaintLog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateComplaintLog(rowOrId: string | number, data: Record<string, unknown>) {
  const res = await fetch('/api/updateComplaintLog', {
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
  const res = await fetch('/api/getHeadOfficeInfo')
  return res.json() as Promise<HeadOfficeInfo>
}

export async function saveHeadOfficeInfo(data: HeadOfficeInfo) {
  const res = await fetch('/api/saveHeadOfficeInfo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getMenuPermission(store: string, name: string) {
  const q = new URLSearchParams({ store, name })
  const res = await fetch(`/api/getMenuPermission?${q}`)
  return res.json() as Promise<Record<string, number>>
}

export async function setMenuPermission(
  store: string,
  name: string,
  permissions: Record<string, number>
) {
  const res = await fetch('/api/setMenuPermission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, name, perm: permissions }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
