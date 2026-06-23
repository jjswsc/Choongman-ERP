import {
  isBankExpenseRelatedWithdrawCategory,
  normalizeBankWithdrawCategory,
} from '@/lib/bank-expense-via-expense-mgmt'
import {
  bankDepositNeedsReceivableOrderLink,
  bankDepositReceivableLinkPending,
} from '@/lib/bank-receivable-link'

export type BankAttentionReason =
  | 'unclassified'
  | 'no_subject'
  | 'no_vendor'
  | 'expense_link_pending'
  | 'receivable_link_pending'

export type BankAttentionRow = {
  transType?: string
  category?: string
  accountSubjectId?: number | null
  vendorCode?: string | null
  storeName?: string | null
  memo?: string | null
  isLinked?: boolean
  isReceivableLinked?: boolean
  isChannelSettled?: boolean
  invoiceReceived?: boolean
  invoiceNo?: string | null
  invoicePhotoUrl?: string | null
}

export type BankAttentionEdits = {
  category?: string
  accountSubjectId?: string
  vendorCode?: string
  storeName?: string
}

const DEPOSIT_CATEGORIES_NEED_SUBJECT = new Set([
  'revenue_delivery',
  'revenue_card',
  'revenue_qr',
  'revenue_cash',
  'expense',
])

const WITHDRAW_CATEGORIES_NEED_SUBJECT = new Set(['expense'])

export function resolveBankRowCategory(
  row: BankAttentionRow,
  edits?: BankAttentionEdits
): string {
  const fallback =
    row.transType === 'deposit' ? 'receivable_receive' : 'expense'
  const raw = String(edits?.category ?? row.category ?? fallback).toLowerCase()
  return normalizeBankWithdrawCategory(raw)
}

export function resolveBankRowAccountSubjectId(
  row: BankAttentionRow,
  edits?: BankAttentionEdits
): number | null {
  if (edits?.accountSubjectId !== undefined) {
    if (!edits.accountSubjectId || edits.accountSubjectId === '__none__') return null
    const n = Number(edits.accountSubjectId)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const n = Number(row.accountSubjectId ?? 0)
  return n > 0 ? n : null
}

export function resolveBankRowVendorCode(
  row: BankAttentionRow,
  edits?: BankAttentionEdits
): string {
  const raw = edits?.vendorCode !== undefined ? edits.vendorCode : row.vendorCode
  return String(raw || '').trim()
}

export function resolveBankRowStoreName(
  row: BankAttentionRow,
  edits?: BankAttentionEdits
): string {
  const raw = edits?.storeName !== undefined ? edits.storeName : row.storeName
  return String(raw || '').trim()
}

export function bankRowNeedsAttention(
  row: BankAttentionRow,
  edits?: BankAttentionEdits
): { needsAttention: boolean; reason: BankAttentionReason | null } {
  const cat = resolveBankRowCategory(row, edits)
  if (cat === 'unclassified' || !cat) {
    return { needsAttention: true, reason: 'unclassified' }
  }

  if (
    bankDepositReceivableLinkPending({
      transType: row.transType,
      category: cat,
      storeName: resolveBankRowStoreName(row, edits),
      memo: row.memo,
      isReceivableLinked: row.isReceivableLinked,
      isChannelSettled: row.isChannelSettled,
    })
  ) {
    return { needsAttention: true, reason: 'receivable_link_pending' }
  }

  if (row.transType === 'withdraw' && isBankExpenseRelatedWithdrawCategory(cat) && !row.isLinked) {
    return { needsAttention: true, reason: 'expense_link_pending' }
  }

  if (row.transType === 'withdraw' && cat === 'purchase_payment') {
    if (!resolveBankRowVendorCode(row, edits)) {
      return { needsAttention: true, reason: 'no_vendor' }
    }
  }

  const needsSubject =
    row.transType === 'deposit'
      ? DEPOSIT_CATEGORIES_NEED_SUBJECT.has(cat)
      : WITHDRAW_CATEGORIES_NEED_SUBJECT.has(cat)

  if (needsSubject && resolveBankRowAccountSubjectId(row, edits) == null) {
    return { needsAttention: true, reason: 'no_subject' }
  }

  return { needsAttention: false, reason: null }
}

/** PP30 매입세액 반영을 위해 인보이스·지출 연결이 필요한 통장 출금 행 */
export function bankRowShowsVatNotRegistered(
  row: BankAttentionRow,
  edits?: BankAttentionEdits
): boolean {
  if (row.transType !== 'withdraw') return false
  const cat = resolveBankRowCategory(row, edits)
  if (!isBankExpenseRelatedWithdrawCategory(cat)) return false
  const hasInvoice =
    Boolean(row.invoiceReceived) ||
    Boolean(String(row.invoiceNo || '').trim()) ||
    Boolean(String(row.invoicePhotoUrl || '').trim())
  if (cat === 'purchase_payment') return !hasInvoice
  if (!row.isLinked) return true
  return !hasInvoice
}

export function countBankVatNotRegisteredRows(
  rows: BankAttentionRow[],
  editsById?: Record<number, BankAttentionEdits>,
  rowId?: (row: BankAttentionRow, index: number) => number | undefined
): number {
  let count = 0
  rows.forEach((row, i) => {
    const id = rowId?.(row, i)
    const edits = id != null ? editsById?.[id] : undefined
    if (bankRowShowsVatNotRegistered(row, edits)) count += 1
  })
  return count
}

export function countBankAttentionRows(
  rows: BankAttentionRow[],
  editsById?: Record<number, BankAttentionEdits>,
  rowId?: (row: BankAttentionRow, index: number) => number | undefined
): { unclassified: number; noSubject: number; expenseLinkPending: number; receivableLinkPending: number; noVendor: number; total: number } {
  let unclassified = 0
  let noSubject = 0
  let expenseLinkPending = 0
  let receivableLinkPending = 0
  let noVendor = 0
  rows.forEach((row, i) => {
    const id = rowId?.(row, i)
    const edits = id != null ? editsById?.[id] : undefined
    const { needsAttention, reason } = bankRowNeedsAttention(row, edits)
    if (!needsAttention) return
    if (reason === 'unclassified') unclassified += 1
    else if (reason === 'no_subject') noSubject += 1
    else if (reason === 'expense_link_pending') expenseLinkPending += 1
    else if (reason === 'receivable_link_pending') receivableLinkPending += 1
    else if (reason === 'no_vendor') noVendor += 1
  })
  return {
    unclassified,
    noSubject,
    expenseLinkPending,
    receivableLinkPending,
    noVendor,
    total: unclassified + noSubject + expenseLinkPending + receivableLinkPending + noVendor,
  }
}
