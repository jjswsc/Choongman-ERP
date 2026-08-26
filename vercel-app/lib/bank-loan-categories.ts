/** 통장 입금: 임원 등이 회사에 빌려줌 (차입 수령) → GL 2150 */
export function isLoanBorrowDepositCategory(category: string | null | undefined): boolean {
  const c = String(category || '').toLowerCase().trim()
  return c === 'loan_borrow' || c === 'loan'
}

export const BANK_DEPOSIT_LOAN_BORROW_CATEGORY = 'loan_borrow'

/** UI 드롭다운은 loan_borrow 하나만. 구값 loan 도 같은 항목으로 표시 */
export function bankDepositLoanCategorySelectValue(category: string | null | undefined): string {
  const c = String(category || '')
  if (isLoanBorrowDepositCategory(c)) return BANK_DEPOSIT_LOAN_BORROW_CATEGORY
  return c
}

export function withLoanBorrowDepositCategory<T extends string>(cats: readonly T[]): string[] {
  const next = [...cats] as string[]
  if (!next.includes('loan_borrow')) next.push('loan_borrow')
  return next
}
