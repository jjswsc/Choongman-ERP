/** 통장 카드대금 헤더 — 계정별 배분 전 총액 보관 */
export const CARD_BILL_HEADER_NOTE = '__card_bill_header__'

export function isCardBillHeaderRow(row: { isBillHeader?: boolean; note?: string | null; bankTransactionId?: number | null }): boolean {
  if (row.isBillHeader) return true
  if (String(row.note || '').trim() === CARD_BILL_HEADER_NOTE) return true
  return false
}

/**
 * 월 대금 1건은 통장 출금 1줄이라 계정과목을 여러 개 붙일 수 없다.
 * 배분 행이 모두 같은 과목이면 그 과목, 아니면 금액이 가장 큰 과목을 통장에 반영한다.
 */
export function pickBankAccountSubjectIdForCardBill(
  lines: { accountSubjectId: number; amount: number }[]
): number | null {
  const valid = (lines || []).filter((l) => Number(l.accountSubjectId) > 0 && Number(l.amount) > 0)
  if (valid.length === 0) return null
  const unique = [...new Set(valid.map((l) => Number(l.accountSubjectId)))]
  if (unique.length === 1) return unique[0] ?? null
  return valid.reduce((best, l) => (Number(l.amount) > Number(best.amount) ? l : best)).accountSubjectId
}
