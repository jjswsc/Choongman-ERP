import { supabaseSelectFilter } from '@/lib/supabase-server'

/**
 * 분개 저장 시 account_code → account_subjects.id.
 * COA에 없는 코드는 매핑에서 빠지며, 호출부에서 account_subject_id는 null로 두면 된다.
 */
export async function resolveAccountSubjectIdsByCodes(codes: string[]): Promise<Map<string, number>> {
  const normalized = [...new Set(codes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))]
  const map = new Map<string, number>()
  if (normalized.length === 0) return map

  try {
    const inList = normalized.join(',')
    const rows = (await supabaseSelectFilter('account_subjects', `code=in.(${inList})`, {
      select: 'id,code',
      limit: Math.max(500, normalized.length * 2),
    })) as { id?: number; code?: string }[] | null

    for (const r of rows || []) {
      const code = String(r.code || '').trim().toUpperCase()
      const id = Number(r.id)
      if (!code || !id) continue
      if (!map.has(code)) map.set(code, id)
    }
  } catch (e) {
    console.error('resolveAccountSubjectIdsByCodes:', e)
  }
  return map
}
