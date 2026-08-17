/** 통장 입금: 임원 등이 회사에 빌려줌 (차입 수령) → GL 2150 */
export function isLoanBorrowDepositCategory(category: string | null | undefined): boolean {
  const c = String(category || '').toLowerCase().trim()
  return c === 'loan_borrow' || c === 'loan'
}

export const BANK_DEPOSIT_LOAN_BORROW_CATEGORY = 'loan_borrow'

export function withLoanBorrowDepositCategory<T extends string>(cats: readonly T[]): string[] {
  const next = [...cats] as string[]
  if (!next.includes('loan_borrow')) next.push('loan_borrow')
  return next
}
