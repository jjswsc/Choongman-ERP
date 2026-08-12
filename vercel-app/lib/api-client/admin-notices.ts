/**
 * 관리자 공지 API — admin.ts에서 분리 — move only
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
  /** 발송 후 N일 이상 경과한 공지만 집계 (0=제한 없음) */
  minUnreadDays?: number
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
  if (params.minUnreadDays != null && params.minUnreadDays > 0) {
    q.set('minUnreadDays', String(params.minUnreadDays))
  }
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

export interface NoticeUnreadDetailItem {
  id: number
  title: string
  createdAt: string
  sender: string
}

export async function getNoticeUnreadForEmployee(params: {
  store: string
  name: string
  startDate: string
  endDate: string
  searchType?: 'all' | 'notice' | 'order'
  minUnreadDays?: number
}): Promise<{
  success: boolean
  message?: string
  items: NoticeUnreadDetailItem[]
  truncated: boolean
}> {
  const q = new URLSearchParams({
    store: params.store,
    name: params.name,
    startDate: params.startDate,
    endDate: params.endDate,
  })
  if (params.searchType && params.searchType !== 'all') q.set('searchType', params.searchType)
  if (params.minUnreadDays != null && params.minUnreadDays > 0) {
    q.set('minUnreadDays', String(params.minUnreadDays))
  }
  const res = await apiFetchWithOffline(`/api/getNoticeUnreadForEmployee?${q}`)
  const data = (await res.json()) as {
    success?: boolean
    message?: string
    items?: NoticeUnreadDetailItem[]
    truncated?: boolean
  }
  if (!res.ok) {
    return { success: false, message: data?.message, items: [], truncated: false }
  }
  return {
    success: data.success !== false,
    message: data.message,
    items: Array.isArray(data.items) ? data.items : [],
    truncated: Boolean(data.truncated),
  }
}

export async function applyNoticeUnreadAllowanceExclusion(params: {
  action?: 'apply' | 'remove'
  payrollMonth: string
  periodStart?: string
  periodEnd?: string
  employees: Array<{ store: string; name: string; missedCount?: number; noticeIds?: number[] }>
}): Promise<{ success: boolean; message?: string; count?: number; payrollMonth?: string }> {
  const res = await apiFetchWithOffline('/api/applyNoticeUnreadAllowanceExclusion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    count?: number
    payrollMonth?: string
  }>
}

export async function listNoticeUnreadAllowanceExclusions(params: { payrollMonth: string }): Promise<{
  success: boolean
  message?: string
  items: Array<{ store: string; name: string; missed_count?: number; reason?: string }>
}> {
  const q = new URLSearchParams({ payrollMonth: params.payrollMonth })
  const res = await apiFetchWithOffline(`/api/applyNoticeUnreadAllowanceExclusion?${q}`)
  const data = (await res.json()) as {
    success?: boolean
    message?: string
    items?: Array<{ store: string; name: string; missed_count?: number; reason?: string }>
  }
  return {
    success: data.success !== false,
    message: data.message,
    items: Array.isArray(data.items) ? data.items : [],
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

export type AutoNoticeWorkLogClient = {
  enabled: boolean
  hourBangkok: number
  notifyManager: boolean
}

export type AutoNoticeStockTakeClient = {
  enabled: boolean
  daysBeforeMonthEnd: number
  hourBangkok: number
  title: string
  body: string
  target: 'managers'
}

export type AutoNoticeCustomRuleClient = {
  id: string
  enabled: boolean
  title: string
  body: string
  hourBangkok: number
  schedule:
    | { kind: 'daily' }
    | { kind: 'weekly'; weekday: number }
    | { kind: 'monthly'; dayOfMonth: number }
    | { kind: 'before_month_end'; daysBefore: number }
  audience:
    | { kind: 'managers' }
    | { kind: 'all' }
    | { kind: 'store_role'; store: string; role: string }
}

export type AutoNoticeSettingsClient = {
  workLog: AutoNoticeWorkLogClient
  stockTake: AutoNoticeStockTakeClient
  customRules: AutoNoticeCustomRuleClient[]
  lastRun: { work_log: string; stock_take: string; custom?: Record<string, string> }
}

export async function getAutoNoticeSettings() {
  const res = await apiFetchWithOffline('/api/autoNoticeSettings')
  return res.json() as Promise<AutoNoticeSettingsClient>
}

export async function updateAutoNoticeSettings(params: {
  workLog?: Partial<AutoNoticeWorkLogClient>
  stockTake?: Partial<AutoNoticeStockTakeClient>
  customRules?: AutoNoticeCustomRuleClient[]
}) {
  const res = await apiFetchWithOffline('/api/autoNoticeSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string } & Partial<AutoNoticeSettingsClient>>
}
