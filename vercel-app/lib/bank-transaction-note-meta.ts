/**
 * bank_transactions.note 에 withdrawal_category 등 메타를 넣되,
 * 사용자가 입력한 상세 텍스트(통장 화면 '메모/비고')는 유지하기 위한 유틸.
 */

export function extractWithdrawalCategoryFromNote(note: string): string | null {
  const m = String(note || '').match(/withdrawal_category:([a-z_]+)/i)
  return m?.[1] ? m[1].toLowerCase() : null
}

export function stripWithdrawalCategoryMetaFromNote(note: string): string {
  let s = String(note || '')
  s = s.replace(/\s*withdrawal_category:[a-z_]+\s*/gi, ' ')
  s = s.replace(/\s*\|\s*\|+/g, ' | ')
  s = s.replace(/^\s*[|;]\s*|\s*[|;]\s*$/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

export function extractExpenseAccrualPrefix(note: string): string {
  const m = String(note || '').match(/^(expense_accrual_id:\d+;\s*)/i)
  return m ? m[1] : ''
}

export function stripExpenseAccrualPrefix(note: string): string {
  return String(note || '').replace(/^expense_accrual_id:\d+;\s*/i, '').trim()
}

export function mergeWithdrawalCategoryIntoBankNote(displayText: string, category: string): string {
  const base = stripWithdrawalCategoryMetaFromNote(displayText).trim()
  const tag = `withdrawal_category:${category}`
  if (!base) return tag
  return `${base} | ${tag}`
}

/** 지출등록/출금수정 저장 시: 기존 note의 expense_accrual 접두 + 사용자 문구 + 카테고리 토큰 */
export function composeBankNoteWithCategoryAndOptionalAccrualPrefix(
  existingNote: string,
  userDisplayFromForm: string,
  category: string
): string {
  const prefix = extractExpenseAccrualPrefix(existingNote)
  const rest = stripExpenseAccrualPrefix(existingNote)
  const userDesc =
    userDisplayFromForm.trim() ||
    stripWithdrawalCategoryMetaFromNote(rest).trim()
  const body = mergeWithdrawalCategoryIntoBankNote(userDesc, category)
  return prefix ? `${prefix}${body}` : body
}

/** 지출등록(이체) → 통장 카드대금 연동 대기열 표시용 */
export const CARD_BILL_QUEUE_MARKER = 'card_bill_queue'

export function hasCardBillQueueMarker(note: string): boolean {
  return new RegExp(`\\b${CARD_BILL_QUEUE_MARKER}\\b`, 'i').test(String(note || ''))
}

export function mergeCardBillQueueIntoBankNote(existingNote: string): string {
  if (hasCardBillQueueMarker(existingNote)) return String(existingNote || '').trim()
  const base = String(existingNote || '').trim()
  return base ? `${base} | ${CARD_BILL_QUEUE_MARKER}` : CARD_BILL_QUEUE_MARKER
}

/** 지출등록(이체) → 통장 패티캐시 보충 연동 대기열 표시용 */
export const PETTY_CASH_QUEUE_MARKER = 'petty_cash_queue'

export function hasPettyCashQueueMarker(note: string): boolean {
  return new RegExp(`\\b${PETTY_CASH_QUEUE_MARKER}\\b`, 'i').test(String(note || ''))
}

export function mergePettyCashQueueIntoBankNote(existingNote: string): string {
  if (hasPettyCashQueueMarker(existingNote)) return String(existingNote || '').trim()
  const base = String(existingNote || '').trim()
  return base ? `${base} | ${PETTY_CASH_QUEUE_MARKER}` : PETTY_CASH_QUEUE_MARKER
}
