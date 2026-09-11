/** 통장 카드대금 헤더 — 계정별 배분 전 총액 보관 */
export const CARD_BILL_HEADER_NOTE = '__card_bill_header__'

export function isCardBillHeaderRow(row: { isBillHeader?: boolean; note?: string | null; bankTransactionId?: number | null }): boolean {
  if (row.isBillHeader) return true
  if (String(row.note || '').trim() === CARD_BILL_HEADER_NOTE) return true
  return false
}

/** 계정별 배분 행 — 손익은 이 행의 계정과목으로 반영. 통장 줄에는 붙이지 않는다. */
export function isCardBillAllocationPlLine(row: {
  transType?: string | null
  parentId?: number | null
  isBillHeader?: boolean | null
}): boolean {
  if (Boolean(row.isBillHeader)) return false
  if (String(row.transType || '').toLowerCase() !== 'expense') return false
  return Number(row.parentId || 0) > 0
}
