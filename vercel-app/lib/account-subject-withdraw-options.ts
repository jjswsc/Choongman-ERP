import type { AccountSubjectItem } from '@/lib/api-client'

/**
 * 통장 출금(경비)·지출등록(경비)에서 고르는 계정과목 — 단일 규칙.
 * getAccountSubjects(forExpense) 와 동일: type=expense, 매출원가(cost) 제외.
 */
export const EXPENSE_WITHDRAW_SUBJECT_FETCH = {
  forExpense: true,
  excludeHeaders: true,
} as const

export const TRANSFER_WITHDRAW_SUBJECT_FETCH = {
  forTransfer: true,
  excludeHeaders: true,
} as const

export const FIXED_ASSET_WITHDRAW_SUBJECT_FETCH = {
  type: 'asset' as const,
  excludeHeaders: true,
}

/** 매입 대금(ชำระค่าซื้อ) — 매출원가 계정만. 5111과 중복으로 만든 5210은 제외. */
export const PURCHASE_WITHDRAW_SUBJECT_FETCH = {
  forCost: true,
  excludeHeaders: true,
} as const

const PURCHASE_SUBJECT_CODES_HIDDEN = new Set(['5210'])

export function filterExpenseWithdrawAccountSubjects(
  items: AccountSubjectItem[]
): AccountSubjectItem[] {
  return items.filter((x) => x.type === 'expense' && x.pAndLSection !== 'cost')
}

/** 매입 대금에서 고르는 계정 — 매출원가(cost) 말단. 5110 헤더·중복 5210 제외. */
export function filterPurchaseWithdrawAccountSubjects(
  items: AccountSubjectItem[]
): AccountSubjectItem[] {
  return items.filter((x) => {
    if (x.type !== 'expense' || x.pAndLSection !== 'cost' || x.isHeader) return false
    const code = String(x.code || '').trim()
    return !PURCHASE_SUBJECT_CODES_HIDDEN.has(code)
  })
}

export function isAllowedPurchaseAccountSubject(row: {
  code?: string | null
  type?: string | null
  pAndLSection?: string | null
  isHeader?: boolean | null
}): boolean {
  return (
    filterPurchaseWithdrawAccountSubjects([
      {
        code: String(row.code || ''),
        name: '',
        type: String(row.type || 'expense'),
        pAndLSection: row.pAndLSection ?? null,
        isHeader: Boolean(row.isHeader),
        sortOrder: 0,
      },
    ]).length === 1
  )
}

export function filterTransferWithdrawAccountSubjects(
  items: AccountSubjectItem[]
): AccountSubjectItem[] {
  return items.filter((x) => x.type === 'transfer')
}

/** 고정자산 취득 — BS 자산 계정만 (손익 비용 계정 제외) */
export function filterFixedAssetAccountSubjects(
  items: AccountSubjectItem[]
): AccountSubjectItem[] {
  return items.filter((x) => String(x.type || '').toLowerCase() === 'asset')
}
