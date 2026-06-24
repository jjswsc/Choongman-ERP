/**
 * 지출 관리 API (api-client.ts에서 분리 — move only)
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { formatMoneyAmountParam } from '../money-amount'
import { jsonAsArray, jsonObjectWithList } from '../safe-api-json'

export type PayeeMemoMatchQuality = 'ok' | 'uncertain' | 'mismatch' | 'trivial'

export interface ExpenseAccrualPlanItem {
  id: number
  payeeCode: string
  payeeName: string
  withdrawalCategory?: string
  /** 인보이스·비용 총액(세금포함) */
  grossAmount?: number
  vatAmount?: number
  withholdingTaxAmount?: number
  /** 실제 지급 대상(총액 − 원천징수) */
  plannedAmount: number
  paidAmount: number
  remainingAmount: number
  /** 인보이스·영수증 등 첨부 URL 목록 */
  attachmentUrls?: string[]
  /** 세금계산서(텍스 인보이스) 수령 여부 */
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  expenseDate: string
  dueDate?: string
  memo?: string
  accountSubjectId?: number | null
  status: 'planned' | 'approved' | 'partial' | 'paid' | 'rejected'
  approvedBy?: string | null
  approvedAt?: string | null
  approvalNote?: string | null
  rejectedBy?: string | null
  rejectedAt?: string | null
  rejectionNote?: string | null
  storeName?: string
  /** getApprovedExpenseAccrualsForBankTx: 통장 적요 vs 지급처(느슨) */
  payeeMemoMatchQuality?: PayeeMemoMatchQuality
  payeeMemoMatchDetail?: string
  /** getApprovedExpenseAccrualsForBankTx: 통장 금액과 잔액 일치 여부(정렬용) */
  amountMatch?: boolean
}

export interface LogisticsPaymentPlanItem {
  vendorCode: string
  remainingAmount: number
  txCount: number
}

export interface ExpensePaymentPlanResponse {
  success: boolean
  message?: string
  expensePlans: ExpenseAccrualPlanItem[]
  purchasePlans: ExpenseAccrualPlanItem[]
  logisticsPlans: LogisticsPaymentPlanItem[]
  totals: {
    expensePlanned: number
    expenseRemaining: number
    logisticsRemaining: number
    purchaseRemaining?: number
  }
}

export async function registerExpenseFromBankTransaction(params: {
  bankTransactionId: number
  payeeCode: string
  payeeName?: string
  accountSubjectId?: number | null
  memo?: string
  storeName?: string
  userName?: string
  userRole?: string
  updateExisting?: boolean
}) {
  const res = await apiFetchWithOffline('/api/registerExpenseFromBankTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: number }>
}

export async function registerPurchaseFromBankTransaction(params: {
  bankTransactionId: number
  vendorCode: string
  /** 본사 발주(orders.id)와 연결 — ref_type=Order */
  linkedOrderId?: number
  userName?: string
  userRole?: string
  updateExisting?: boolean
}) {
  const res = await apiFetchWithOffline('/api/registerPurchaseFromBankTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function addExpenseAccrual(params: {
  payeeCode: string
  payeeName?: string
  withdrawalCategory?: string
  categoryMain?: string
  categorySub?: string
  amount: number
  /** 부가세 금액(참고) */
  vatAmount?: number
  /** 원천징수세 — 실지급액 = amount − 이 값 */
  withholdingTaxAmount?: number
  expenseDate: string
  dueDate?: string
  memo?: string
  accountSubjectId?: number | null
  storeName?: string
  userName?: string
  userRole?: string
  /** 인보이스·영수증 등 (data URL 또는 https) */
  attachmentUrls?: string[]
  /** 세금계산서(텍스 인보이스) 수령 여부 */
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
}) {
  const res = await apiFetchWithOffline('/api/addExpenseAccrual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: number }>
}

export async function updateExpenseRegisterItem(params: {
  bankTransactionId: number
  accountId: number
  transDate: string
  amount: number
  memo?: string
  storeName?: string
  categoryMain: string
  categorySub?: string
  vendorCode?: string
  accountSubjectId?: number | null
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/updateExpenseRegisterItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteExpenseRegisterItem(params: {
  bankTransactionId: number
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/updateExpenseRegisterItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, action: 'delete' }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function approveExpenseAccrual(params: {
  expenseAccrualId: number
  action: 'approve' | 'reject'
  approvalNote?: string
  userName?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/approveExpenseAccrual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateExpenseAccrual(params: {
  expenseAccrualId: number
  amount: number
  vatAmount?: number
  withholdingTaxAmount?: number
  expenseDate: string
  dueDate?: string | null
  memo?: string
  payeeCode?: string
  payeeName?: string
  accountSubjectId?: number | null
  storeName?: string
  withdrawalCategory?: string
  categoryMain?: string
  categorySub?: string
  userRole?: string
  attachmentUrls?: string[]
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
}) {
  const res = await apiFetchWithOffline('/api/updateExpenseAccrual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, action: 'update' }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteExpenseAccrual(params: {
  expenseAccrualId: number
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/updateExpenseAccrual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, action: 'delete' }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateExpenseAccrualInvoice(params: {
  expenseAccrualId: number
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
}) {
  const res = await apiFetchWithOffline('/api/updateExpenseAccrualInvoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteExpenseAccrualsWithoutStore(params: { userRole?: string }) {
  const res = await apiFetchWithOffline('/api/deleteExpenseAccrualsWithoutStore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; deletedCount?: number }>
}

export async function deletePurchaseAccrualsByVendor(params: {
  vendorCode: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/deletePurchaseAccrualsByVendor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; deletedCount?: number }>
}

export async function getApprovedExpenseAccrualsForBankTx(params: {
  bankTransactionId: number
  userRole?: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    bankTransactionId: String(params.bankTransactionId),
  })
  if (params.userRole) q.set('userRole', params.userRole)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getApprovedExpenseAccrualsForBankTx?${q}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    bankTransaction?: { id: number; amount: number; transDate: string; memo?: string; note?: string }
    list: ExpenseAccrualPlanItem[]
  }>
}

export async function getExpensePaymentPlan(params: {
  startStr: string
  endStr: string
  payeeFilter?: string
  vendorFilter?: string
  userRole?: string
  /** 매니저·가맹점주: 자기 매장 지급예정만 (서버는 JWT store 우선) */
  userStore?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.payeeFilter) q.set('payeeFilter', params.payeeFilter)
  if (params.vendorFilter) q.set('vendorFilter', params.vendorFilter)
  q.set('userRole', params.userRole ?? '')
  q.set('userStore', params.userStore ?? '')
  // 지급예정은 오프라인 큐/캐시 없이 항상 서버 조회 (검색·탭 전환 시 최신 데이터)
  const res = await apiFetch(`/api/getExpensePaymentPlan?${q}`)
  return res.json() as Promise<ExpensePaymentPlanResponse>
}

export async function executeExpensePayment(params: {
  expenseAccrualId: number
  paymentMethod: 'bank' | 'petty'
  amount: number
  transDate: string
  memo?: string
  accountId?: number
  store?: string
  bankTransactionId?: number | null
  userName?: string
  userRole?: string
  /** 통장 적요 vs 지급처 불일치(409) 시, 회계/본사 권한으로만 사용 */
  acknowledgePayeeMemoMismatch?: boolean
}) {
  const res = await apiFetchWithOffline('/api/executeExpensePayment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    code?: string
    message?: string
    payeeMemoMatchQuality?: PayeeMemoMatchQuality
    payeeMemoMatchDetail?: string
    bankTransactionId?: number | null
    pettyCashTransactionId?: number | null
    remainingAmount?: number
  }>
}

export async function getUnlinkedBankWithdrawals(params: {
  accountId: number
  startStr: string
  endStr: string
  amount?: number
  transDate?: string
}) {
  const q = new URLSearchParams({
    accountId: String(params.accountId),
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.amount != null && params.amount > 0) q.set('amount', String(params.amount))
  if (params.transDate) q.set('transDate', params.transDate)
  const res = await apiFetchWithOffline(`/api/getUnlinkedBankWithdrawals?${q}`)
  return res.json() as Promise<{
    list: { id: number; transDate: string; amount: number; memo: string }[]
  }>
}

export interface CardAccount {
  id?: number
  name: string
  store?: string | null
  memo?: string | null
  cardNumber?: string | null
  holderName?: string | null
  cardCompany?: string | null
}

export interface CardTransaction {
  id?: number
  cardAccountId: number
  transDate: string
  transType: 'charge' | 'expense'
  amount: number
  memo?: string | null
  bankTransactionId?: number | null
  vendorCode?: string | null
  accountSubjectId?: number | null
  note?: string | null
  isBillHeader?: boolean
  parentId?: number | null
  allocatedAmount?: number
  remainingAmount?: number
  allocationComplete?: boolean
}

export async function getCardAccounts() {
  const res = await apiFetchWithOffline('/api/getCardAccounts')
  return jsonAsArray<CardAccount>(await res.json())
}

export async function getCardTransactions(params: {
  cardAccountId?: number
  startStr?: string
  endStr?: string
}) {
  const q = new URLSearchParams()
  if (params.cardAccountId) q.set('cardAccountId', String(params.cardAccountId))
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  const res = await apiFetchWithOffline(`/api/getCardTransactions?${q}`)
  return jsonObjectWithList<CardTransaction>(await res.json())
}

export async function saveCardAccount(params: { id?: number; name: string; store?: string; memo?: string; cardNumber?: string; holderName?: string; cardCompany?: string }) {
  const res = await apiFetchWithOffline('/api/saveCardAccount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function saveCardTransaction(params: {
  id?: number
  cardAccountId: number
  transDate: string
  transType: 'charge' | 'expense'
  amount: number
  memo?: string
  bankTransactionId?: number | null
  vendorCode?: string
  accountSubjectId?: number | null
  note?: string
}) {
  const res = await apiFetchWithOffline('/api/saveCardTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteCardAccount(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteCardAccount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteCardTransaction(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteCardTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getCardBillAllocation(parentId: number) {
  const res = await apiFetchWithOffline(`/api/getCardBillAllocation?parentId=${parentId}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    header?: {
      id: number
      cardAccountId: number
      transDate: string
      totalAmount: number
      memo: string | null
      bankTransactionId: number | null
      allocatedAmount: number
      remainingAmount: number
    }
    lines?: {
      id: number
      accountSubjectId: number
      amount: number
      memo: string | null
      vatAmount?: number
      invoiceReceived?: boolean
      invoiceNo?: string | null
    }[]
  }>
}

export async function saveCardBillAllocation(params: {
  parentId: number
  lines: {
    id?: number
    accountSubjectId: number
    amount: number
    memo?: string
    vatAmount?: number
    invoiceReceived?: boolean
    invoiceNo?: string
  }[]
  userName?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/saveCardBillAllocation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type UnlinkedBankWithdrawalForCard = {
  id: number
  transDate: string
  amount: number
  memo: string
  likelyCardBill: boolean
}

export async function getUnlinkedBankWithdrawalsForCard(params: {
  accountId: number
  startStr: string
  endStr: string
}) {
  const q = new URLSearchParams({
    accountId: String(params.accountId),
    startStr: params.startStr,
    endStr: params.endStr,
  })
  const res = await apiFetchWithOffline(`/api/getUnlinkedBankWithdrawalsForCard?${q}`)
  return jsonObjectWithList<UnlinkedBankWithdrawalForCard>(await res.json())
}

export async function registerCardExpenseFromBankTransaction(params: {
  bankTransactionId: number
  cardAccountId: number
  accountSubjectId?: number | null
  memo?: string
  note?: string
  userName?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/registerCardExpenseFromBankTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function markBankTransactionForCardBill(params: {
  bankTransactionId: number
  userName?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/markBankTransactionForCardBill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getBankWithdrawalsForCardBillQueueMark(params: {
  accountId: number
  startStr: string
  endStr: string
  amount?: number
  transDate?: string
}) {
  const q = new URLSearchParams({
    accountId: String(params.accountId),
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.amount != null && params.amount > 0) q.set('amount', formatMoneyAmountParam(params.amount))
  if (params.transDate) q.set('transDate', params.transDate)
  const res = await apiFetchWithOffline(`/api/getBankWithdrawalsForCardBillQueueMark?${q}`)
  return jsonObjectWithList<UnlinkedBankWithdrawalForCard>(await res.json())
}

export type WithdrawalCategoryMain =
  | 'purchase'
  | 'expense'
  | 'fixed_asset'
  | 'transfer'
  | 'loan_repayment'
  | 'loan_given'
  | 'correction'
  | 'dividend'
export type WithdrawalCategorySub = 'normal' | 'advance'

export async function executeWithdrawal(params: {
  paymentMethod: 'bank' | 'petty'
  amount: number
  transDate: string
  memo?: string
  storeName?: string
  categoryMain: WithdrawalCategoryMain | string
  categorySub?: WithdrawalCategorySub | string
  vendorCode?: string
  accountSubjectId?: number | null
  accountSubjectCode?: string
  accountSubjectName?: string
  transferToAccountId?: number | null
  transferToAccountNo?: string | null
  transferBankAccountNo?: string | null
  transferBankRecipientName?: string | null
  transferToPettyStore?: string | null
  transferToCardAccountId?: number | null
  accountId?: number
  assetName?: string
  assetCode?: string
  usefulLifeMonths?: number
  residualRate?: number
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  vatAmount?: number
  userName?: string
  userRole?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/executeWithdrawal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    bankTransactionId?: number
    pettyCashTransactionId?: number
    fixedAssetId?: number
  }>
}
