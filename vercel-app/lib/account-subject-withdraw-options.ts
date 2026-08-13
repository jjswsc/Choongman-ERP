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

export function filterExpenseWithdrawAccountSubjects(
  items: AccountSubjectItem[]
): AccountSubjectItem[] {
  return items.filter((x) => x.type === 'expense' && x.pAndLSection !== 'cost')
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
