/**
 * 통장 거래 API (api-client.ts에서 분리 — move only)
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { getBankTransactionsWithCache } from '../offline/erp-offline'
import { jsonAsArray, jsonObjectWithList } from '../safe-api-json'

export interface BankAccount {
  id: number
  name: string
  store: string
  bankName?: string
  openingBalance: number
  openingBalanceDate: string | null
}

export interface BankTransactionItem {
  id?: number
  transDate: string
  transType: string
  amount: number
  memo: string
  note?: string
  category?: string
  accountSubjectId?: number | null
  salesDate?: string
  expenseDate?: string
  vendorCode?: string
  storeName?: string
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  purchaseOrderId?: number
  isLinked?: boolean
  isReceivableLinked?: boolean
  isChannelSettled?: boolean
  isCardLinked?: boolean
}

export interface BankTransactionsSummary {
  openingBalance: number
  beginningBalance: number
  periodDeposits: number
  periodWithdrawals: number
  calculatedBalance: number
  actualBalance?: number | null
  difference?: number | null
}

export async function getBankAccounts(params?: { store?: string; userStore?: string; userRole?: string }) {
  const q = new URLSearchParams()
  if (params?.store) q.set('store', params.store)
  if (params?.userStore) q.set('userStore', params.userStore)
  if (params?.userRole) q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getBankAccounts?${q}`)
  return jsonAsArray<BankAccount>(await res.json())
}

export async function getBankTransactions(params: {
  accountId: string | number
  startStr: string
  endStr: string
}) {
  return getBankTransactionsWithCache(params) as Promise<{
    list: BankTransactionItem[]
    summary: BankTransactionsSummary | null
  }>
}

export interface ExpenseRegisterItem {
  id?: number
  accountId?: number
  transDate: string
  transType: string
  amount: number
  memo?: string
  category: string
  accountSubjectId?: number | null
  expenseDate?: string
  vendorCode?: string
  storeName?: string
  invoiceReceived: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  linkStatus?: 'unlinked' | 'bank' | 'bank_plan' | 'inbound' | 'card'
  bankLinked?: boolean
  pettyLinked?: boolean
}

export async function getExpenseRegisterList(params: {
  accountId?: string | number
  startStr: string
  endStr: string
  category?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.accountId) q.set('accountId', String(params.accountId))
  if (params.category) q.set('category', params.category)
  const res = await apiFetchWithOffline(`/api/getExpenseRegisterList?${q}`)
  return jsonObjectWithList<ExpenseRegisterItem>(await res.json())
}

export type ExpenseSearchRelation =
  | 'plan_only'
  | 'approved_unpaid'
  | 'paid_bank'
  | 'paid_petty'
  | 'rejected'
  | 'bank_only'

export interface ExpenseSearchOverviewRow {
  rowKey: string
  relation: ExpenseSearchRelation
  storeName: string
  category: string
  payeeCode?: string
  payeeName?: string
  accountSubjectId?: number | null
  vendorCode?: string
  plannedAmount?: number
  remainingAmount?: number
  bankAmount?: number
  expenseDate?: string
  dueDate?: string
  bankTransDate?: string
  accrualId?: number
  bankTransactionId?: number
  accountId?: number
  planStatus?: 'planned' | 'approved' | 'paid' | 'rejected'
  memo?: string
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  bankLinked?: boolean
  pettyLinked?: boolean
  linkStatus?: string
}

export interface ExpenseSearchOverviewSummary {
  planOnly: number
  approvedUnpaid: number
  paid: number
  bankOnly: number
  rejected: number
}

export async function getExpenseSearchOverview(params: {
  startStr: string
  endStr: string
  storeFilter?: string
  accountId?: string | number
  category?: string
  vendorFilter?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.storeFilter && params.storeFilter !== '__all__') q.set('storeFilter', params.storeFilter)
  if (params.accountId && params.accountId !== '__all__') q.set('accountId', String(params.accountId))
  if (params.category && params.category !== '__all__') q.set('category', params.category)
  if (params.vendorFilter) q.set('vendorFilter', params.vendorFilter)
  const res = await apiFetch(`/api/getExpenseSearchOverview?${q}`)
  return res.json() as Promise<{
    list: ExpenseSearchOverviewRow[]
    summary: ExpenseSearchOverviewSummary
  }>
}

export async function addBankTransaction(params: {
  accountId: number
  transDate: string
  transType: 'deposit' | 'withdraw'
  amount: number
  memo?: string
  note?: string
  store?: string
  userName?: string
  category?: string
  fixedExpenseId?: number
  accountSubjectId?: number
  salesDate?: string
  expenseDate?: string
  vendorCode?: string
  storeName?: string
}) {
  const res = await apiFetchWithOffline('/api/addBankTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function addBankTransactionsBulk(params: {
  accountId: number
  store?: string
  userName?: string
  items: Array<{
    transDate: string
    transType: 'deposit' | 'withdraw'
    amount: number
    memo?: string
    note?: string
    category?: string
    accountSubjectId?: number
    salesDate?: string
    expenseDate?: string
    vendorCode?: string
    storeName?: string
  }>
}) {
  const res = await apiFetchWithOffline('/api/addBankTransactionsBulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  type BulkRes = {
    success?: boolean
    inserted?: number
    skipped?: number
    duplicateSkipped?: number
    policySkipped?: number
    policyAdjusted?: number
    message?: string
    queued?: boolean
  }
  let data: BulkRes = {}
  try {
    data = (await res.json()) as BulkRes
  } catch {
    return {
      success: false,
      queued: false,
      message: res.ok ? 'Invalid server response' : `HTTP ${res.status}`,
    }
  }
  const queued = res.headers.get('X-Offline-Queued') === '1' || data.queued === true
  return {
    ...data,
    success: queued ? false : Boolean(res.ok && data.success),
    queued,
  }
}

export async function updateBankTransactionInvoice(params: {
  bankTransactionId: number
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  purchaseOrderId?: number | null
}) {
  const res = await apiFetchWithOffline('/api/updateBankTransactionInvoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateBankTransaction(params: {
  bankTransactionId: number
  category?: string
  accountSubjectId?: number | null
  note?: string
  salesDate?: string
  expenseDate?: string
  vendorCode?: string
  storeName?: string
  withholdingTaxAmount?: number | null
  withholdingTaxRate?: number | null
}) {
  const res = await apiFetchWithOffline('/api/updateBankTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InboundBatchForLink {
  id: number
  batchDate: string
  vendorName: string
  totalAmount: number
  location?: string
}

export async function getInboundBatchesForLink(params: {
  vendorCode?: string
  vendorName?: string
  storeFilter?: string
}) {
  const q = new URLSearchParams()
  if (params.vendorCode?.trim()) q.set('vendorCode', params.vendorCode.trim())
  if (params.vendorName?.trim()) q.set('vendorName', params.vendorName.trim())
  if (params.storeFilter?.trim()) q.set('storeFilter', params.storeFilter.trim())
  const res = await apiFetchWithOffline(`/api/getInboundBatchesForLink?${q}`)
  return jsonAsArray<InboundBatchForLink>(await res.json())
}

export async function getBankTransactionInboundLinks(bankTransactionId: number) {
  const res = await apiFetchWithOffline(`/api/getBankTransactionInboundLinks?bankTransactionId=${bankTransactionId}`)
  return jsonAsArray<{ id?: number; inboundBatchId?: number; amount: number }>(await res.json())
}

export async function saveBankTransactionInboundLinks(params: {
  bankTransactionId: number
  links: { inboundBatchId: number; amount: number }[]
}) {
  const res = await apiFetchWithOffline('/api/saveBankTransactionInboundLinks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface BankMemoRule {
  id?: number
  keyword: string
  transType: string
  category: string
  accountSubjectId?: number | null
}

export async function getBankMemoRules() {
  const res = await apiFetchWithOffline('/api/getBankMemoRules')
  return jsonAsArray<BankMemoRule>(await res.json())
}

export async function saveBankMemoRule(params: {
  id?: number
  keyword: string
  transType: 'deposit' | 'withdraw'
  category: string
  accountSubjectId?: number | null
}) {
  const res = await apiFetchWithOffline('/api/saveBankMemoRule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteBankMemoRule(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteBankMemoRule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function saveBankAccount(params: {
  id?: number
  name: string
  store?: string
  bankName?: string
  openingBalance?: number
  openingBalanceDate?: string | null
}) {
  const res = await apiFetchWithOffline('/api/saveBankAccount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteBankAccount(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteBankAccount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface BankAccountAuditLogItem {
  id: number
  actionType: string
  decision: string
  reasonCode: string | null
  accountId: number | null
  accountStore: string
  accountName: string
  bankName: string
  actorName: string
  actorRole: string
  actorStore: string
  actorEmployeeId: number | null
  actorEmployeeCode: string | null
  payload: Record<string, unknown> | null
  createdAt: string | null
}

export async function getBankAccountAuditLogs(params?: { store?: string; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.store) q.set('store', params.store)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const suffix = q.toString()
  const res = await apiFetch(`/api/getBankAccountAuditLogs${suffix ? `?${suffix}` : ''}`)
  return res.json() as Promise<{ success: boolean; list: BankAccountAuditLogItem[]; message?: string }>
}

export interface OpenReceivableForBankItem {
  id: number
  refType: string
  refId?: number
  storeName: string
  transDate: string
  invoiceNo?: string
  memo?: string
  accrualAmount: number
  remainingAmount: number
  receiveChecked: boolean
}

export type LinkedReceivableForBankItem = {
  accrualId: number
  refType: string
  refId?: number
  storeName: string
  transDate: string
  invoiceNo?: string
  memo?: string
  paidFromBank: number
  paidFromCredit: number
  paidFromRounding: number
  paidTotal: number
}

export type LinkedReceivableForBankSummary = {
  bankAmount: number
  linkedTotal: number
  paidFromBank: number
  paidFromCredit: number
  paidFromRounding: number
  storeCreditApplied: number
}

export async function getLinkedReceivablesForBankTx(params: { bankTransactionId: number }) {
  const q = new URLSearchParams({ bankTransactionId: String(params.bankTransactionId) })
  const res = await apiFetchWithOffline(`/api/getLinkedReceivablesForBankTx?${q}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    items: LinkedReceivableForBankItem[]
    summary: LinkedReceivableForBankSummary | null
  }>
}

export async function unlinkReceivableFromBankTransaction(params: { bankTransactionId: number }) {
  const res = await apiFetchWithOffline('/api/unlinkReceivableFromBankTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bankTransactionId: params.bankTransactionId }),
  })
  return res.json() as Promise<{ success: boolean; message?: string; accrualIds?: number[] }>
}

export async function getOpenReceivablesForBankTx(params: { bankTransactionId: number }) {
  const q = new URLSearchParams({ bankTransactionId: String(params.bankTransactionId) })
  const res = await apiFetchWithOffline(`/api/getOpenReceivablesForBankTx?${q}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    list: OpenReceivableForBankItem[]
    storeCreditAvailable?: number
  }>
}

export async function linkReceivableFromBankTransaction(params: {
  bankTransactionId: number
  receivableAccrualId?: number
  receivableAccrualIds?: number[]
  storeCreditApplyAmount?: number
  mismatchNote?: string
  mismatchReason?: string
}) {
  const ids =
    params.receivableAccrualIds && params.receivableAccrualIds.length > 0
      ? params.receivableAccrualIds
      : params.receivableAccrualId
        ? [params.receivableAccrualId]
        : []
  const res = await apiFetchWithOffline('/api/linkReceivableFromBankTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bankTransactionId: params.bankTransactionId,
      receivableAccrualIds: ids,
      storeCreditApplyAmount: params.storeCreditApplyAmount,
      mismatchNote: params.mismatchNote,
      mismatchReason: params.mismatchReason,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function addReceivableStoreCredit(params: {
  storeName: string
  amount: number
  transDate: string
  memo: string
}) {
  const res = await apiFetchWithOffline('/api/addReceivableStoreCredit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: number }>
}
