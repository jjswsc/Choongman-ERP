import type { AccountSubjectItem } from '@/lib/api-client'

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
    return accountSubjectOptions.filter((a) => a.type === 'transfer')
  }
  if (cat === 'expense') {
    return accountSubjectOptions.filter((a) => a.type === 'expense' && a.pAndLSection !== 'cost')
  }
  if (['purchase_payment', 'loan', 'correction', 'unclassified'].includes(cat)) {
    return []
  }

  if (filterTransType === 'deposit') {
    return revenueAccountOptions
  }
  if (filterTransType === 'withdraw') {
    return accountSubjectOptions.filter(
      (a) => a.type === 'transfer' || (a.type === 'expense' && a.pAndLSection !== 'cost')
    )
  }

  const seen = new Set<number>()
  const merged = [
    ...revenueAccountOptions,
    ...accountSubjectOptions.filter(
      (a) => a.type === 'transfer' || (a.type === 'expense' && a.pAndLSection !== 'cost')
    ),
  ]
  return merged.filter((a) => {
    const id = Number(a.id || 0)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}
