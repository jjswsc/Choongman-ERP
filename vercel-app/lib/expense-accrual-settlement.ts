/** 통장·패티에 실제로 연결된 지급(Payment)만 "정산 완료"로 본다. */
import { isExpenseInternalBankNote } from '@/lib/bank-transaction-note-meta'

export function isSettledExpensePayment(row: {
  amount?: number | null
  bank_transaction_id?: number | null
  petty_cash_transaction_id?: number | null
}): boolean {
  const amt = Number(row.amount || 0)
  if (!(amt < 0)) return false
  return Number(row.bank_transaction_id || 0) > 0 || Number(row.petty_cash_transaction_id || 0) > 0
}

/**
 * 지출관리에서 만든 그림자 통장(source:expense_internal) 연결은
 * CSV 실거래 통장 「지출관리 연결」 후보 잔액에서 제외한다.
 * (목록·잔액에 안 보이는 내부 통장만 붙어 있으면 실거래로 재연결 가능)
 */
export function isRealBankOrPettySettlement(
  row: {
    amount?: number | null
    bank_transaction_id?: number | null
    petty_cash_transaction_id?: number | null
  },
  bankNoteById: Map<number, string>
): boolean {
  if (!isSettledExpensePayment(row)) return false
  if (Number(row.petty_cash_transaction_id || 0) > 0) return true
  const bankId = Number(row.bank_transaction_id || 0)
  if (!(bankId > 0)) return false
  const note = bankNoteById.get(bankId) || ''
  return !isExpenseInternalBankNote(note)
}

export function settledPaidAbsFromPayableRows(
  rows: Array<{
    amount?: number | null
    bank_transaction_id?: number | null
    petty_cash_transaction_id?: number | null
  }>,
  options?: { bankNoteById?: Map<number, string>; excludeInternalBank?: boolean }
): number {
  const bankNoteById = options?.bankNoteById
  const excludeInternal = options?.excludeInternalBank === true && !!bankNoteById
  let sum = 0
  for (const row of rows || []) {
    if (excludeInternal) {
      if (!isRealBankOrPettySettlement(row, bankNoteById!)) continue
    } else if (!isSettledExpensePayment(row)) {
      continue
    }
    sum += Math.abs(Number(row.amount) || 0)
  }
  return sum
}

/** DB status 가 paid/done 이어도 통장·패티 정산이 없으면 연결 가능한 상태로 본다. */
export function isOrphanPaidExpenseAccrualStatus(
  status: string | null | undefined,
  hasSettledPayment: boolean
): boolean {
  const s = String(status || '').toLowerCase()
  return (s === 'paid' || s === 'done') && !hasSettledPayment
}

/** 본사·오피스 계좌 ↔ CM Office 지급예정 등 오피스 계열 매장 매칭 */
export function storesMatchForExpenseBankLink(
  a: string,
  b: string,
  storesMatch: (x: string, y: string) => boolean,
  isOfficeStore: (s: string) => boolean
): boolean {
  const left = String(a || '').trim()
  const right = String(b || '').trim()
  if (!left || !right) return false
  if (storesMatch(left, right)) return true
  if (isOfficeStore(left) && isOfficeStore(right)) return true
  return false
}
