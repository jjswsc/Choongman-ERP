/** 통장 카드대금 헤더 — 계정별 배분 전 총액 보관 */
export const CARD_BILL_HEADER_NOTE = '__card_bill_header__'

export function isCardBillHeaderRow(row: { isBillHeader?: boolean; note?: string | null; bankTransactionId?: number | null }): boolean {
  if (row.isBillHeader) return true
  if (String(row.note || '').trim() === CARD_BILL_HEADER_NOTE) return true
  return false
}
