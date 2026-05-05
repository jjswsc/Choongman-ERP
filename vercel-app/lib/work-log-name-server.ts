import 'server-only'

import { supabaseSelectFilter } from '@/lib/supabase-server'
import { workLogStoredNameFromEmployeeMaster } from '@/lib/work-log-name'

/**
 * 주간·승인 탭 필터: `employee`가 숫자면 employees.id 로 해석 후 풀네임 반환.
 * 레거시(닉 문자열 등) 호환은 null 이고 호출측에서 기존처럼 `name=eq.${param}` 사용.
 */
export async function resolveWorkLogFilterNameFromEmployeeIdParam(param: string): Promise<string | null> {
  const id = Number.parseInt(String(param || '').trim(), 10)
  if (!Number.isFinite(id) || id <= 0) return null
  const rows = (await supabaseSelectFilter('employees', `id=eq.${id}`, {
    limit: 1,
    select: 'name',
  })) as { name?: string }[]
  const n = workLogStoredNameFromEmployeeMaster(rows?.[0]?.name)
  return n || null
}
