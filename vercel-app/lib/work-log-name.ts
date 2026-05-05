import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 업무일지 work_logs.name — 동명 닉 충돌 방지용으로 마스터 풀네임(employees.name)만 저장·조회한다. */
export function workLogStoredNameFromEmployeeMaster(nameRaw: unknown): string {
  return String(nameRaw ?? '').trim()
}

/**
 * 직원 셀렉트·표시용. API staff: displayName = nick || name.
 * 닉이 풀네임과 다를 때만 `닉네임 (풀네임)` 형식.
 */
export function formatWorkLogStaffSelectLabel(s: { name: string; displayName: string }): string {
  const full = String(s.name || '').trim()
  const disp = String(s.displayName || '').trim()
  if (disp && full && disp !== full) return `${disp} (${full})`
  return full || disp
}

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
