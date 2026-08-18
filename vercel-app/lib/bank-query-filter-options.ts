import type { AccountSubjectItem } from '@/lib/api-client'
import {
  filterExpenseWithdrawAccountSubjects,
  filterTransferWithdrawAccountSubjects,
} from '@/lib/account-subject-withdraw-options'
import { moneyEqual, parseMoneyAmount } from '@/lib/money-amount'

/** 조회 목록 금액 필터 — 빈 값이면 통과, 입·출금 절대값으로 비교(±0.01) */
export function bankRowMatchesAmountFilter(
  rowAmount: number | null | undefined,
  filterAmountRaw: string
): boolean {
  const raw = String(filterAmountRaw || '').trim()
  if (!raw || !/\d/.test(raw)) return true
  return moneyEqual(Math.abs(Number(rowAmount) || 0), parseMoneyAmount(raw))
}

/** 조회 목록 검색어 필터 — 적요·메모·거래처 등 텍스트에 부분 일치(대소문자 무시) */
export function bankRowMatchesKeywordFilter(haystacks: string[], keywordRaw: string): boolean {
  const q = String(keywordRaw || '').trim().toLowerCase()
  if (!q) return true
  return haystacks.some((h) => String(h || '').toLowerCase().includes(q))
}

/** 통장 조회 필터 — 입금 용도 (조회 전에도 드롭다운 표시) */
export const BANK_FILTER_DEPOSIT_CATEGORIES = [
  'revenue_delivery',
  'revenue_card',
  'revenue_qr',
  'revenue_cash',
  'receivable_receive',
  'loan',
  'advance',
  'unclassified',
  'correction',
] as const

/** 통장 조회 필터 — 출금 용도 */
export const BANK_FILTER_WITHDRAW_CATEGORIES = [
  'transfer',
  'expense',
  'purchase_payment',
  'tax',
  'loan',
  'advance',
  'unclassified',
  'correction',
] as const

const DEPOSIT_REVENUE_SUBJECT_CATEGORIES = new Set([
  'revenue_delivery',
  'revenue_card',
  'revenue_qr',
  'revenue_cash',
])

export function resolveBankQueryFilterCategories(filterTransType: string): string[] {
  if (filterTransType === 'deposit') return [...BANK_FILTER_DEPOSIT_CATEGORIES]
  if (filterTransType === 'withdraw') return [...BANK_FILTER_WITHDRAW_CATEGORIES]
  return [
    ...new Set([...BANK_FILTER_WITHDRAW_CATEGORIES, ...BANK_FILTER_DEPOSIT_CATEGORIES]),
  ].sort((a, b) => a.localeCompare(b))
}

export function resolveBankQueryFilterAccountSubjects(params: {
  filterTransType: string
  filterCategory: string
  accountSubjectOptions: AccountSubjectItem[]
  revenueAccountOptions: AccountSubjectItem[]
  prepaymentSubject?: AccountSubjectItem | null
}): AccountSubjectItem[] {
  const { filterTransType, filterCategory, accountSubjectOptions, revenueAccountOptions, prepaymentSubject } =
    params
  const cat = String(filterCategory || '').trim().toLowerCase()

  if (cat === 'advance') {
    return prepaymentSubject ? [prepaymentSubject] : []
  }
  if (cat === 'receivable_receive' || DEPOSIT_REVENUE_SUBJECT_CATEGORIES.has(cat)) {
    return revenueAccountOptions
  }
  if (cat === 'transfer') {
    return filterTransferWithdrawAccountSubjects(accountSubjectOptions)
  }
  if (cat === 'expense') {
    return filterExpenseWithdrawAccountSubjects(accountSubjectOptions)
  }
  if (['purchase_payment', 'loan', 'correction', 'unclassified', 'tax'].includes(cat)) {
    return []
  }

  if (filterTransType === 'deposit') {
    return revenueAccountOptions
  }
  if (filterTransType === 'withdraw') {
    return [
      ...filterTransferWithdrawAccountSubjects(accountSubjectOptions),
      ...filterExpenseWithdrawAccountSubjects(accountSubjectOptions),
    ]
  }

  const seen = new Set<number>()
  const merged = [
    ...revenueAccountOptions,
    ...filterTransferWithdrawAccountSubjects(accountSubjectOptions),
    ...filterExpenseWithdrawAccountSubjects(accountSubjectOptions),
  ]
  return merged.filter((a) => {
    const id = Number(a.id || 0)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}
