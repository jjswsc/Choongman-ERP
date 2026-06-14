/**
 * 회계 마감·워크플로·SSO 동기화 API — thai-tax-filing.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray, jsonAsPlainObject } from '../safe-api-json'

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

export async function getSsoSubmissionHistory(params?: { storeFilter?: string; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline(`/api/getSsoSubmissionHistory?${q}`)
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    rows: jsonAsArray<AccountingWorkflowStatusRow>(o.rows),
    error: o.error != null ? String(o.error) : undefined,
  }
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
