/**
 * 관리(Admin) — 공지·인사규정·휴가/근태 승인 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsPlainObject, jsonAsStringArray, jsonAsArray } from '../safe-api-json'
import type { PaginatedList } from './types'

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
  isUrgent?: boolean
  expiresAt?: string
  scheduledAt?: string
}) {
  const res = await apiFetchWithOffline('/api/sendNotice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    fcmSent?: number
    fcmFailed?: number
  }>
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
  isUrgent?: boolean
  isOrderRelated?: boolean
  targetStore?: string
  targetRole?: string
  targetPermissionGroup?: string
  attachments?: Array<{ name: string; mime: string; url: string }>
  expiresAt?: string
  scheduledAt?: string
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

export async function estimateNoticeRecipients(params: {
  targetStore: string
  targetRole: string
  targetPermissionGroup?: string
  targetRecipients?: Array<{ store: string; name: string }>
}) {
  const res = await apiFetchWithOffline('/api/estimateNoticeRecipients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as { success?: boolean; count?: number }
  return { count: data.count ?? 0, success: Boolean(data.success) }
}

export async function updateNoticeAdmin(params: {
  id: number
  title: string
  content: string
  isUrgent?: boolean
  expiresAt?: string | null
}) {
  const res = await apiFetchWithOffline('/api/updateNoticeAdmin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function remindNoticeUnread(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/remindNoticeUnread', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    reminded?: number
    fcmSent?: number
  }>
}

export interface NoticeTemplateItem {
  id: number
  title: string
  content: string
  createdBy?: string
  createdAt?: string
}

export async function getNoticeTemplates() {
  const res = await apiFetchWithOffline('/api/noticeTemplates')
  const data = (await res.json()) as { items?: NoticeTemplateItem[] }
  return { items: data.items ?? [] }
}

export async function saveNoticeTemplate(params: { title: string; content: string }) {
  const res = await apiFetchWithOffline('/api/noticeTemplates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: number }>
}

export async function deleteNoticeTemplate(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/noticeTemplates', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
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
