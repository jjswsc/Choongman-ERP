/**
 * 모바일 홈 — 공지·급여 조회 (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import type { PaginatedList } from './types'

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
  isUrgent?: boolean
  expiresAt?: string
  scheduledAt?: string
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
  /** UI 언어 — 서버에서 제목/본문 번역 */
  lang?: string
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
  if (params.lang) q.set('lang', params.lang)
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
  period_start?: string
  period_end?: string
  pay_date?: string
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
