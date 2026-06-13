/**
 * API 클라이언트 (barrel)
 * core fetch/auth: lib/api/
 * 도메인별 클라이언트: lib/api-client/*.ts — import @/lib/api-client 유지
 * 쓰기 API는 apiFetchWithOffline → 오프라인 큐 적재
 */
import { apiFetchWithOffline } from './api/fetch-offline'
import type { PaginatedList } from './api-client/types'

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
export type { PaginatedList } from './api-client/types'
export type { AppItem } from './api-client/app-data-cache'
export { invalidateAppDataCache, getAppData } from './api-client/app-data-cache'

export * from './api-client/stock'
export * from './api-client/hr'
export * from './api-client/admin'
export * from './api-client/work-log'
export * from './api-client/timesheet'
export * from './api-client/visit'
export * from './api-client/petty-cash'
export * from './api-client/receivable-payable'
export * from './api-client/income-statement'
export * from './api-client/depreciation'
export * from './api-client/expense-management'
export * from './api-client/sales-management'
export * from './api-client/bank-transactions'
export * from './api-client/chart-of-accounts'
export * from './api-client/fixed-costs'
export * from './api-client/interior'
export * from './api-client/items-vendors'
export * from './api-client/pos-menus'
export * from './api-client/sauces'
export * from './api-client/pos-promos'
export * from './api-client/marketing-campaigns'
export * from './api-client/marketing-ads'
export * from './api-client/marketing-influencers'
export * from './api-client/pos-operations'
export * from './api-client/inbound'
export * from './api-client/outbound'
export * from './api-client/employees'
export * from './api-client/store-check'
export * from './api-client/store-visit-admin'
export * from './api-client/complaints'
export * from './api-client/store-repairs'
export * from './api-client/system-settings'
export * from './api-client/purchase-order'

/** 모바일 홈 — 공지·급여 (아직 api-client/ 미분리) */

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
