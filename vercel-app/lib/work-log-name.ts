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
