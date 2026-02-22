/**
 * 은행 적요 커스텀 매핑 규칙 적용
 * bank_memo_mapping_rules에 저장된 규칙을 우선 적용
 */

export interface MemoMappingRule {
  id?: number
  keyword: string
  transType: 'deposit' | 'withdraw'
  category: string
  accountSubjectId?: number | null
}

export function applyCustomMemoRules(
  memo: string,
  transType: 'deposit' | 'withdraw',
  customRules: MemoMappingRule[]
): { category: string; accountSubjectId?: number } | null {
  const m = (memo || '').toLowerCase().trim()
  if (!m || !customRules?.length) return null

  const rules = customRules.filter((r) => r.transType === transType)
  for (const rule of rules) {
    const kw = (rule.keyword || '').toLowerCase().trim()
    if (!kw) continue
    if (m.includes(kw)) {
      return {
        category: rule.category,
        accountSubjectId: rule.accountSubjectId ?? undefined,
      }
    }
  }
  return null
}
