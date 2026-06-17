/** 매입 대금 지급은 지출관리 → 지급예정 집행만 허용. 통장에서는 지급예정 연결만. */

export const PURCHASE_PAYMENT_VIA_EXPENSE_ONLY_MESSAGE =
  '매입 대금 지급은 「지출관리 → 지급예정」에서만 집행할 수 있습니다. 통장 거래 화면의 「지출관리 연결」으로 승인된 지급예정을 연결하세요.'

export function isDirectBankPurchasePaymentCategory(category: string | undefined | null): boolean {
  const c = String(category || '').trim().toLowerCase()
  return c === 'purchase_payment' || c === 'purchase_advance'
}

export function assertPurchasePaymentViaExpenseOnly(
  category: string | undefined | null
): { ok: true } | { ok: false; message: string } {
  if (!isDirectBankPurchasePaymentCategory(category)) return { ok: true }
  return { ok: false, message: PURCHASE_PAYMENT_VIA_EXPENSE_ONLY_MESSAGE }
}
