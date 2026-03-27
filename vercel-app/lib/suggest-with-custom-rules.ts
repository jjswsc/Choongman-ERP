/**
 * 은행 적요 → 용도/계정과목 자동 추천 (사용자 규칙 + 기본 규칙)
 * 사용자 정의 규칙을 먼저 적용하고, 없으면 기본 키워드 매칭
 */

import { suggestDepositFromMemo } from './suggest-deposit-from-memo'
import { suggestWithdrawFromMemo } from './suggest-withdraw-from-memo'

export interface BankMemoRule {
  id?: number
  keyword: string
  transType: string
  category: string
  accountSubjectId?: number | null
}

export function suggestDepositWithRules(
  memo: string,
  customRules: BankMemoRule[],
  revenueSubjects: { id?: number; code: string }[]
): { category: string; accountSubjectId?: number } | null {
  const m = (memo || '').toLowerCase().trim()
  if (!m) return null

  for (const rule of customRules) {
    if (rule.transType !== 'deposit') continue
    if (rule.keyword && m.includes(rule.keyword.toLowerCase())) {
      return {
        category: rule.category,
        accountSubjectId: rule.accountSubjectId ?? undefined,
      }
    }
  }

  return suggestDepositFromMemo(memo, revenueSubjects)
}

export function suggestWithdrawWithRules(
  memo: string,
  customRules: BankMemoRule[],
  accountSubjects: { id?: number; code: string; type?: string; pAndLSection?: string | null }[]
): { category: string; accountSubjectId?: number } | null {
  const m = (memo || '').toLowerCase().trim()
  if (!m) return null

  for (const rule of customRules) {
    if (rule.transType !== 'withdraw') continue
    if (rule.keyword && m.includes(rule.keyword.toLowerCase())) {
      return {
        category: rule.category === 'fixed' ? 'expense' : rule.category,
        accountSubjectId: rule.accountSubjectId ?? undefined,
      }
    }
  }

  return suggestWithdrawFromMemo(memo, accountSubjects)
}
