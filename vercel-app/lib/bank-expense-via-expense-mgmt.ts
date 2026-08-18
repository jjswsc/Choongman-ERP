/**
 * 지출 관련 통장 출금 — 통장은 분류·매장 귀속만, 분개·미지급 반영은 지출관리 연동 후.
 */

export const BANK_EXPENSE_VIA_EXPENSE_MGMT_MESSAGE =
  '지출 관련 통장 출금은 분류만 저장됩니다. 조회 탭에서 「지출관리 연결」로 지급예정·지출등록과 연결한 뒤 회계 처리가 완료됩니다.'

/** @deprecated use BANK_EXPENSE_VIA_EXPENSE_MGMT_MESSAGE */
export const PURCHASE_PAYMENT_VIA_EXPENSE_ONLY_MESSAGE = BANK_EXPENSE_VIA_EXPENSE_MGMT_MESSAGE

export const BANK_WITHDRAW_EXPENSE_RELATED_CATEGORIES = [
  'expense',
  'purchase_payment',
  'purchase_advance',
  'tax',
] as const

export const BANK_WITHDRAW_UI_CATEGORIES = [
  'transfer',
  'expense',
  'purchase_payment',
  'tax',
  'loan',
  'advance',
  'unclassified',
  'correction',
] as const

/** 통장 출금 행에서 계정과목(หมวด) 셀을 숨김 — 세금 납부는 BS 정산이라 손익 과목이 없다 */
export const BANK_WITHDRAW_CATEGORIES_WITHOUT_SUBJECT = [
  'correction',
  'loan',
  'advance',
  'unclassified',
  'purchase_payment',
  'tax',
] as const

export function isBankWithdrawCategoryWithoutSubject(category: string | undefined | null): boolean {
  const c = normalizeBankWithdrawCategory(category)
  return (BANK_WITHDRAW_CATEGORIES_WITHOUT_SUBJECT as readonly string[]).includes(c)
}

export function normalizeBankWithdrawCategory(category: string | undefined | null): string {
  const c = String(category || '').trim().toLowerCase()
  if (c === 'fixed') return 'expense'
  return c
}

export function isBankExpenseRelatedWithdrawCategory(category: string | undefined | null): boolean {
  const c = normalizeBankWithdrawCategory(category)
  return (BANK_WITHDRAW_EXPENSE_RELATED_CATEGORIES as readonly string[]).includes(c)
}

/** @deprecated use isBankExpenseRelatedWithdrawCategory */
export function isDirectBankPurchasePaymentCategory(category: string | undefined | null): boolean {
  const c = normalizeBankWithdrawCategory(category)
  return c === 'purchase_payment' || c === 'purchase_advance'
}

export function shouldSkipBankAutoJournal(
  category: string | undefined | null,
  transType: string | undefined | null
): boolean {
  return String(transType || '').toLowerCase() === 'withdraw' && isBankExpenseRelatedWithdrawCategory(category)
}

/** 통장 카테고리 저장 허용 (차단하지 않음) */
export function assertPurchasePaymentViaExpenseOnly(
  _category: string | undefined | null
): { ok: true } | { ok: false; message: string } {
  return { ok: true }
}

/** 출금관리에서 매입 대금 통장·패티 직접 집행 차단 (지급예정 경유) */
export function assertWithdrawalManagementPurchaseBlocked(
  category: string | undefined | null
): { ok: true } | { ok: false; message: string } {
  if (isDirectBankPurchasePaymentCategory(category)) {
    return { ok: false, message: BANK_EXPENSE_VIA_EXPENSE_MGMT_MESSAGE }
  }
  return { ok: true }
}
