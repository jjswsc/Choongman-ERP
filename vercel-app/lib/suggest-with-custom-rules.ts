/**
 * 은행 적요 → 용도/계정과목 자동 추천 (사용자 규칙 + 기본 규칙)
 * 사용자 정의 규칙을 먼저 적용하고, 없으면 기본 키워드 매칭
 *
 * 매출 수령(receivable_receive)은 적요 키워드만으로는 오분류(동일 문자열이 법인명 일부에 포함 등)가 나기 쉬워
 * 자동 추천에서 제외한다. 통장 화면에서 용도·매장을 수동 지정한다.
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
    if (String(rule.category || '').toLowerCase() === 'receivable_receive') continue
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
