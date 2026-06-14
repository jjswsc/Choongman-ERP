/**
 * 회계 기간·시산표·대사 API — thai-tax-filing.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray, jsonAsPlainObject } from '../safe-api-json'

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
