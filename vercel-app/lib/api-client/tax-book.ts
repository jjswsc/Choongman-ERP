import { apiFetchWithOffline } from '../api/fetch-offline'
import type { TaxBridgeLine, TaxBridgeReport } from '@/lib/tax-management-bridge'
import type { TaxBookEntryRow, TaxBookLedgerLine } from '@/lib/tax-book-server'
import type { TrialBalanceRow } from '@/lib/trial-balance-report'

export type TaxManagementBridgeResponse = {
  yearMonth: string
  scopeFilter: string
  taxEntityCode: string | null
  storeCount: number | null
  schemaReady: boolean
  periodClosed: boolean
  managementNetProfit: number
  report: TaxBridgeReport
  closingNetIncome: number
  closingLineCount: number
  error?: string
}

export async function getTaxManagementBridge(params: { yearMonth: string; scopeFilter: string }) {
  const q = new URLSearchParams({
    yearMonth: params.yearMonth,
    scopeFilter: params.scopeFilter || 'All',
  })
  const res = await apiFetchWithOffline(`/api/getTaxManagementBridge?${q}`)
  return res.json() as Promise<TaxManagementBridgeResponse>
}

export type TaxBookEntriesResponse = {
  schemaReady: boolean
  error?: string
  vouchers: TaxBookEntryRow[]
  ledger: TaxBookLedgerLine[]
  trial: TrialBalanceRow[]
  totalDebit?: number
  totalCredit?: number
  diff?: number
}

export async function getTaxBookEntries(params: { yearMonth: string; scopeFilter: string; view: 'vouchers' | 'ledger' | 'trial' }) {
  const q = new URLSearchParams({
    yearMonth: params.yearMonth,
    scopeFilter: params.scopeFilter,
    view: params.view,
  })
  const res = await apiFetchWithOffline(`/api/getTaxBookEntries?${q}`)
  return res.json() as Promise<TaxBookEntriesResponse>
}

export async function postTaxBookEntry(body: {
  action: 'payroll' | 'inventory' | 'adjustment' | 'closing' | 'unlock'
  yearMonth: string
  scopeFilter: string
  memo?: string
  unlockReason?: string
  lines?: { accountCode: string; accountName?: string; side: 'debit' | 'credit'; amount: number }[]
}) {
  const res = await apiFetchWithOffline('/api/postTaxBookEntry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{ success?: boolean; error?: string; entryId?: number | null; locked?: boolean }>
}

export type { TaxBridgeLine }
