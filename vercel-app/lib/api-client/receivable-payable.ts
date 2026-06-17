/**
 * 미수금/미지급금 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { getReceivablePayableListWithCache, getPayableTransactionItemsWithCache } from '../offline/erp-offline'

export interface ReceivablePayableItem {
  storeName?: string
  vendorCode?: string
  vendorName?: string
  balance: number
  /** 종료일까지 누적 잔액 (목록 API와 동일 집계) */
  cumulativeBalance?: number
  items: {
    id?: number
    trans_date?: string
    ref_type?: string
    ref_id?: number
    amount?: number
    memo?: string
    invoice_no?: string
    invoice_received?: boolean
    receive_checked?: boolean
    bank_transaction_id?: number | null
    expense_accrual_id?: number | null
    petty_cash_transaction_id?: number | null
    /** 미지급: 입고·발주·지출·통장·패티에서 해석한 귀속 매장 */
    attributed_store?: string
  }[]
}

export interface ReceivablePayableSummaryItem {
  storeName?: string
  vendorCode?: string
  vendorName?: string
  balance: number
  count: number
}

export async function getReceivablePayableSummary(params: {
  type: 'receivable' | 'payable'
  userStore?: string
  userRole?: string
  startStr?: string
  endStr?: string
  storeFilter?: string
  vendorFilter?: string
}) {
  const q = new URLSearchParams({ type: params.type })
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.vendorFilter) q.set('vendorFilter', params.vendorFilter)
  const res = await apiFetchWithOffline(`/api/getReceivablePayableSummary?${q}`)
  const data = await res.json()
  return data as { type: string; list: ReceivablePayableSummaryItem[]; totalAmount?: number }
}

export interface ReceivableOrderItem {
  id?: number
  orderId?: number
  storeName: string
  amount: number
  transDate: string
  orderDate: string
  deliveryDate: string
  total: number
  status: string
  memo: string
}

export async function getReceivableOrders(params: {
  storeFilter?: string
  startStr?: string
  endStr?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams()
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getReceivableOrders?${q}`)
  const data = await res.json()
  return data as {
    type: string
    list: ReceivableOrderItem[]
    storeBalances?: Record<string, number>
  }
}

export async function getReceivablePayableList(params: {
  type: 'receivable' | 'payable'
  storeFilter?: string
  vendorFilter?: string
  startStr: string
  endStr: string
  userStore?: string
  userRole?: string
}) {
  return getReceivablePayableListWithCache(params)
}

/** 수령 완료 주문의 Order 미수금을 현재 cart·직접정산 규칙으로 재계산 (지두방 제외 등) */
export async function syncOrderReceivable(params: { orderId: number; userRole?: string }) {
  const res = await apiFetchWithOffline('/api/syncOrderReceivable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: params.orderId, userRole: params.userRole }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    orderId?: number
    subtotalHQ?: number
    totalHQ?: number
    removed?: boolean
  }>
}

/** 수령 완료 주문 미수금을 출고 관리(통합 출고 이력) 합계·직접정산·VAT 반올림에 맞춤 */
export async function syncOrderReceivableFromOutbound(params: { orderId: number; userRole?: string }) {
  const res = await apiFetchWithOffline('/api/syncOrderReceivableFromOutbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: params.orderId, userRole: params.userRole }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    orderId?: number
    subtotalHQ?: number
    totalHQ?: number
    removed?: boolean
    usedCartFallback?: boolean
  }>
}

/** Order 미수금 일괄 — 출고 로그·출고 관리 합계 기준 (배치 1회) */
export async function syncAllOrderReceivablesFromOutboundBatch(params: {
  lastReceivableId?: number
  batchSize?: number
  storeFilter?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/syncAllOrderReceivablesFromOutbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lastReceivableId: params.lastReceivableId ?? 0,
      batchSize: params.batchSize ?? 120,
      storeFilter: params.storeFilter,
      userRole: params.userRole,
    }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    nextReceivableId?: number
    hasMore?: boolean
    stats?: {
      processed: number
      updated: number
      removed: number
      skipped: number
      errors: number
      cartFallback: number
      forceOutboundProcessed?: number
      forceOutboundErrors?: number
    }
    errorSamples?: { orderId: number; message: string }[]
  }>
}

/** Order 미수금 일괄 재동기화 (배치 1회 — 클라이언트에서 hasMore까지 반복) */
export async function syncAllOrderReceivablesBatch(params: {
  lastReceivableId?: number
  batchSize?: number
  storeFilter?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/syncAllOrderReceivables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lastReceivableId: params.lastReceivableId ?? 0,
      batchSize: params.batchSize ?? 120,
      storeFilter: params.storeFilter,
      userRole: params.userRole,
    }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    nextReceivableId?: number
    hasMore?: boolean
    stats?: {
      processed: number
      updated: number
      removed: number
      skipped: number
      orphanRemoved: number
      errors: number
    }
    errorSamples?: { orderId: number; message: string }[]
  }>
}

export interface PayableTransactionItem {
  code?: string
  name?: string
  spec?: string
  /** 인보이스 품목 하단 비고(무게·kg당가 등) */
  line_remarks?: string
  qty: number
  unitCost?: number
  amount: number
}

/** 주문 장바구니 공급가 합계 → 미수·인보이스와 동일 VAT 규칙 */
export interface OrderInvoiceTotals {
  subtotalRounded: number
  vatRounded: number
  grandTotal: number
}

export type PayableTransactionItemsResponse = {
  items: PayableTransactionItem[]
  orderInvoiceTotals?: OrderInvoiceTotals
  withholdingTaxAmount?: number
  withholdingTaxRate?: number
  /** 회계 PO(refType=PO) Tax Invoice BILL TO — 발주 인쇄와 동일 */
  poBillTo?: {
    vendorName: string
    address?: string
    taxId?: string
    phone?: string
    relatedStore?: string
  }
}

export async function getPayableTransactionItems(params: {
  refType: string
  refId: number
}): Promise<PayableTransactionItemsResponse> {
  return getPayableTransactionItemsWithCache(params)
}

export type StorePurchaseJournalLine = {
  accountCode: string
  accountName: string
  side: string
  amount: number
}

export type StorePurchaseJournalEntry = {
  id: number
  entryNo: string
  accountingDate: string
  storeName: string | null
  memo: string | null
  lines: StorePurchaseJournalLine[]
}

export async function getStorePurchaseJournal(params: { orderId: number }) {
  const q = new URLSearchParams({ orderId: String(params.orderId) })
  const res = await apiFetchWithOffline(`/api/getStorePurchaseJournal?${q}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    orderId?: number
    hasJournal?: boolean
    entries?: StorePurchaseJournalEntry[]
  }>
}

export async function deleteStorePurchaseJournal(params: { orderId: number }) {
  const res = await apiFetchWithOffline('/api/deleteStorePurchaseJournal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: params.orderId }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    code?: string
    orderId?: number
    deletedCount?: number
  }>
}
