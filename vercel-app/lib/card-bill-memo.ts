/**
 * 신용카드 월 대금 통장 적요 판별.
 * 카드사 결제(대금)와 가맹점 카드수수료를 구분한다.
 */

const CARD_FEE_RE =
  /\b(card\s*fee|credit\s*card\s*fee|merchant\s*fee|카드수수료|ค่าธรรมเนียมบัตร)\b/i

const CARD_BILL_RE =
  /(credit\s*card|creditcard|cr[\s.-]*card|card[\s.-]*(payment|pymt|bill)|k[\s.-]*credit|\bcc[\s.-]*pay(ment)?\b|카드\s*대금|신용카드|신용\s*카드|카드결제|บัตรเครดิต|ชำระบัตร|ค่าบัตรเครดิต)/i

const BLOCKED_CARD_BILL_QUEUE_CATEGORIES = new Set([
  'purchase_payment',
  'purchase_advance',
  'tax',
  'tax_vat',
  'tax_withholding',
  'tax_corporate',
  'tax_sso',
  'loan',
  'loan_repayment',
  'loan_given',
  'dividend',
  'correction',
])

export function memoLooksLikeCardMerchantFee(memo: string): boolean {
  return CARD_FEE_RE.test(String(memo || ''))
}

/** 통장 적요가 카드사 월 대금 출금으로 보이는지 */
export function memoLooksLikeCardBill(memo: string): boolean {
  const text = String(memo || '').trim()
  if (!text) return false
  if (memoLooksLikeCardMerchantFee(text)) return false
  return CARD_BILL_RE.test(text)
}

export function canQueueWithdrawCategoryForCardBill(category: string, memo: string): boolean {
  const c = String(category || '').trim().toLowerCase()
  if (BLOCKED_CARD_BILL_QUEUE_CATEGORIES.has(c)) return false
  if (c === 'transfer' || c.startsWith('transfer_') || c === 'unclassified' || c === '') return true
  return memoLooksLikeCardBill(memo)
}

/**
 * 카드 탭에서 통장 출금 연결 후보.
 * CSV 일괄 입력을 비용(expense)으로만 둔 경우에도 기간·금액으로 찾아 연결할 수 있게 한다.
 */
export function canLinkWithdrawForCardBill(category: string, memo: string): boolean {
  const c = String(category || '').trim().toLowerCase()
  if (c === 'expense') return true
  return canQueueWithdrawCategoryForCardBill(category, memo)
}

/** 통장 조회에서 「지출 등록」을 카드대금 경로로 열지 */
export function bankWithdrawOpensCardBillRegister(category: string, memo: string): boolean {
  const c = String(category || '').trim().toLowerCase()
  if (c === 'transfer' || c.startsWith('transfer_') || c === 'bank_card_bill') return true
  if (c === 'unclassified' || c === '' || c === 'expense') return memoLooksLikeCardBill(memo)
  return false
}
