/** 손익·클라이언트 공용 — server-only 의존 없음 */
export const PL_FRANCHISE_BILLING_SALES_KEY = '__pl_franchise_billing__'

/** 손익 계정과목 펼침에 넣는 승인 회계 PO 청구 행 코드 */
export const PL_FRANCHISE_EXPENSE_SUBJECT_CODES = {
  royalty: 'PO-ROY',
  deliveryGp: 'PO-DGP',
  grabGp: 'PO-GGP',
  combined: 'PO-BIL',
} as const

export function isFranchiseBillingExpenseSubjectCode(code: string | null | undefined): boolean {
  const c = String(code || '').trim()
  return (
    c === PL_FRANCHISE_EXPENSE_SUBJECT_CODES.royalty ||
    c === PL_FRANCHISE_EXPENSE_SUBJECT_CODES.deliveryGp ||
    c === PL_FRANCHISE_EXPENSE_SUBJECT_CODES.grabGp ||
    c === PL_FRANCHISE_EXPENSE_SUBJECT_CODES.combined
  )
}
