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
  taxType: string
  safeQty: number
  image?: string
}

export async function getAppData(storeName: string) {
  const res = await fetch(`/api/getAppData?storeName=${encodeURIComponent(storeName)}`)
  const data = await res.json()
  return { items: (data.items || []) as AppItem[], stock: data.stock || {} }
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
  userStore?: string
  userRole?: string
  dateFilterType?: 'request' | 'leave'
}) {
  const clean: Record<string, string> = {}
  if (params.startStr) clean.startStr = params.startStr
  if (params.endStr) clean.endStr = params.endStr
  if (params.store != null && params.store !== '') clean.store = params.store
  if (params.status) clean.status = params.status
  if (params.userStore) clean.userStore = params.userStore
  if (params.userRole) clean.userRole = params.userRole
  if (params.dateFilterType) clean.dateFilterType = params.dateFilterType
  const q = new URLSearchParams(clean)
  const res = await fetch(`/api/getLeavePendingList?${q}`)
  return res.json() as Promise<{ id: number; store: string; name: string; nick: string; type: string; date: string; requestDate: string; reason: string; status: string }[]>
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

export async function processAttendanceApproval(params: { id: number; decision: string; userStore?: string; userRole?: string }) {
  const res = await fetch('/api/processAttendanceApproval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
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
