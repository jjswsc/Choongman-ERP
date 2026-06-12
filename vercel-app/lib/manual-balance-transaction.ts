export type ManualBalanceLedger = 'receivable' | 'payable'

export type ManualBalanceRowLike = {
  ref_type?: string | null
  ref_id?: number | null
  bank_transaction_id?: number | null
  expense_accrual_id?: number | null
  petty_cash_transaction_id?: number | null
}

export function isManualReceivableBalanceRow(row: ManualBalanceRowLike): boolean {
  const rt = String(row.ref_type || '')
  if (rt !== 'Receive' && rt !== 'Opening') return false
  if (row.bank_transaction_id != null && Number(row.bank_transaction_id) > 0) return false
  if (row.ref_id != null && Number(row.ref_id) > 0) return false
  return true
}

export function isManualPayableBalanceRow(row: ManualBalanceRowLike): boolean {
  const rt = String(row.ref_type || '')
  if (rt !== 'Payment' && rt !== 'Opening') return false
  if (row.bank_transaction_id != null && Number(row.bank_transaction_id) > 0) return false
  if (row.expense_accrual_id != null && Number(row.expense_accrual_id) > 0) return false
  if (row.petty_cash_transaction_id != null && Number(row.petty_cash_transaction_id) > 0) return false
  if (row.ref_id != null && Number(row.ref_id) > 0) return false
  return true
}

export function signedAmountForManualBalance(
  ledger: ManualBalanceLedger,
  refType: string,
  amountAbs: number
): number {
  const abs = Math.abs(Number(amountAbs) || 0)
  if (!abs) return 0
  const rt = String(refType || '')
  if (ledger === 'receivable') {
    return rt === 'Opening' ? abs : -abs
  }
  return rt === 'Opening' ? abs : -abs
}

export function defaultMemoForManualBalance(refType: string, isOpening: boolean): string {
  if (isOpening) return '기초이월'
  return refType === 'Receive' ? '대금 수령' : '대금 지급'
}
