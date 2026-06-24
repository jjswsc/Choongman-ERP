import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 신용카드 월 대금 — 선급금(전도금) 계정 코드 */
export const CARD_BILL_ACCOUNT_CODE = '1160'

/**
 * 카드 대금 통장 연동 시 기본 계정과목 ID (1160 선급금 / 전도금).
 * DB에 1160이 없으면 이름에 전도·선급금 포함 계정을 찾는다.
 */
export async function resolveCardBillAccountSubjectId(): Promise<number | null> {
  const byCode = (await supabaseSelectFilter('account_subjects', `code=eq.${CARD_BILL_ACCOUNT_CODE}`, {
    limit: 1,
    select: 'id,code',
  })) as { id?: number; code?: string }[] | null
  const codeId = Number(byCode?.[0]?.id || 0)
  if (codeId > 0) return codeId

  const all = (await supabaseSelectFilter('account_subjects', 'id=gt.0', {
    limit: 500,
    select: 'id,code,name,name_en',
  })) as { id?: number; code?: string; name?: string; name_en?: string }[] | null

  for (const row of all || []) {
    const name = `${row.name || ''} ${row.name_en || ''}`
    if (/전도|선급금|prepayment/i.test(name)) {
      const id = Number(row.id || 0)
      if (id > 0) return id
    }
  }
  return null
}
