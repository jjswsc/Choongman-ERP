import { apiFetchWithOffline } from '../api/fetch-offline'
import type { TaxBridgeLine, TaxBridgeReport } from '@/lib/tax-management-bridge'
import type { TaxBookEntryRow, TaxBookLedgerLine } from '@/lib/tax-book-server'
import type { ExternalTrialBalanceRow } from '@/lib/tax-book-opening'
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
  accountCode?: string | null
}

export async function getTaxBookEntries(params: {
  yearMonth?: string
  fromMonth?: string
  toMonth?: string
  scopeFilter: string
  view: 'vouchers' | 'ledger' | 'trial'
  accountCode?: string
}) {
  const fromMonth = params.fromMonth || params.yearMonth || ''
  const toMonth = params.toMonth || fromMonth
  const q = new URLSearchParams({
    yearMonth: fromMonth,
    fromMonth,
    toMonth,
    scopeFilter: params.scopeFilter,
    view: params.view,
  })
  if (params.accountCode) q.set('accountCode', params.accountCode)
  const res = await apiFetchWithOffline(`/api/getTaxBookEntries?${q}`)
  return res.json() as Promise<TaxBookEntriesResponse>
}

export type TaxBookPostAction =
  | 'payroll'
  | 'inventory'
  | 'inventoryPreview'
  | 'vat'
  | 'sales'
  | 'purchase'
  | 'ensureFiling'
  | 'adjustment'
  | 'closing'
  | 'unlock'
  | 'opening'

export async function postTaxBookEntry(body: {
  action: TaxBookPostAction
  yearMonth: string
  scopeFilter: string
  memo?: string
  unlockReason?: string
  inventoryAmount?: number
  inventoryConfirmed?: boolean
  accountingDate?: string
  trialBalanceRows?: ExternalTrialBalanceRow[]
  lines?: { accountCode: string; accountName?: string; side: 'debit' | 'credit'; amount: number }[]
}) {
  const res = await apiFetchWithOffline('/api/postTaxBookEntry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{
    success?: boolean
    error?: string
    entryId?: number | null
    locked?: boolean
    inventoryAmount?: number
    inventorySource?: string
    flowInventory?: number
    inventoryDelta?: number
    lineCount?: number
    asOfDate?: string
    locationCount?: number
    cogsPreview?: number
    cogs?: number
    posted?: string[]
  }>
}

export type { TaxBridgeLine }
