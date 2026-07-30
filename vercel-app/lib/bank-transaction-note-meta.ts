/**
 * bank_transactions.note 에 withdrawal_category 등 메타를 넣되,
 * 사용자가 입력한 상세 텍스트(통장 화면 '메모/비고')는 유지하기 위한 유틸.
 */

/** 지출관리에서 통장 행을 새로 만들 때 넣는 마커. 통장 잔액·목록·손익에서 제외(실거래 import와 이중 방지). */
export const INTERNAL_BANK_SOURCE_MARKER = 'source:expense_internal'

const TAX_SETTLEMENT_WITHDRAWAL_CATEGORIES = new Set([
  'tax_vat',
  'tax_withholding',
  'tax_corporate',
])

export function isExpenseInternalBankNote(note: string | null | undefined): boolean {
  return String(note || '').toLowerCase().includes(INTERNAL_BANK_SOURCE_MARKER)
}

export function isTaxSettlementWithdrawalCategory(cat: string | null | undefined): boolean {
  return TAX_SETTLEMENT_WITHDRAWAL_CATEGORIES.has(String(cat || '').trim().toLowerCase())
}

/**
 * VAT·원천·법인세 납부(미지급세금 정산)는 손익 비용이 아님.
 * 통장 category를 unclassified 로 두면 손익 집계에서 제외된다.
 */
export function bankCategoryForWithdrawalCategory(withdrawalCategory: string): string | null {
  if (isTaxSettlementWithdrawalCategory(withdrawalCategory)) return 'unclassified'
  return null
}

/** 세무서(กรมสรรพากร) 납부·ภ.พ.30 등 — BS 정산으로 보고 손익에서 제외 */
export function looksLikeTaxAuthorityRemittanceMemo(memo: string | null | undefined): boolean {
  const m = String(memo || '')
  if (!m.trim()) return false
  if (/ภ\.?\s*พ\.?\s*30|ภพ\.?\s*30|ภ\.?\s*ง\.?\s*ด|ภงด/i.test(m)) return true
  if (/revenue\s*dep|สรรพากร|กรมสรรพากร/i.test(m)) return true
  if (/paid\s+for\s+ref[\s\S]{0,120}revenue/i.test(m)) return true
  return false
}

/** 손익 비용에 넣으면 안 되는 통장 출금 (내부 생성·세금 납부 정산) */
export function shouldExcludeBankWithdrawFromPlExpense(row: {
  note?: string | null
  memo?: string | null
}): boolean {
  if (isExpenseInternalBankNote(row.note)) return true
  const wCat = extractWithdrawalCategoryFromNote(String(row.note || ''))
  if (wCat && isTaxSettlementWithdrawalCategory(wCat)) return true
  if (looksLikeTaxAuthorityRemittanceMemo(row.memo)) return true
  return false
}

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

/** 통장 화면 MEMO 입력·표시용 — 내부 연동 메타만 제거 */
export function bankNoteUserDisplayText(note: string): string {
  return stripWithdrawalCategoryMetaFromNote(stripExpenseAccrualPrefix(note)).trim()
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

/**
 * 지급예정↔통장 연결 시 note 기록.
 * expense_accrual_id·withdrawal_category 메타는 유지하되, 사용자가 넣었던 MEMO 문구는 덮어쓰지 않는다.
 */
export function composeBankNoteForExpenseAccrualLink(
  existingNote: string,
  expenseAccrualId: number,
  withdrawalCategory: string,
  preferredUserDisplay?: string
): string {
  const fromExisting = bankNoteUserDisplayText(existingNote)
  const preferred = String(preferredUserDisplay || '').trim()
  const userDesc = fromExisting || bankNoteUserDisplayText(preferred) || preferred
  const body = mergeWithdrawalCategoryIntoBankNote(userDesc, withdrawalCategory)
  const id = Math.floor(Number(expenseAccrualId) || 0)
  if (id <= 0) return body
  return `expense_accrual_id:${id};${body}`
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
