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
