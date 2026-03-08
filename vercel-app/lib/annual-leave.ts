/**
 * 입사일 기준 해당 날짜(asOfDate, YYYY-MM-DD) 시점에 1년 이상 근속인지
 */
export function hasOneYearTenureAsOf(emp: Record<string, unknown> | null, asOfDate: string): boolean {
  if (!emp) return false
  const joinStr = emp.join_date ?? emp.joinDate
  if (!joinStr) return false

  const joinDate = new Date(String(joinStr).slice(0, 10) + 'T12:00:00')
  const refDate = new Date(asOfDate.slice(0, 10) + 'T12:00:00')
  if (isNaN(joinDate.getTime()) || isNaN(refDate.getTime())) return false

  let years = refDate.getFullYear() - joinDate.getFullYear()
  const joinAnnivThisYear = new Date(refDate.getFullYear(), joinDate.getMonth(), joinDate.getDate())
  if (refDate < joinAnnivThisYear) years--

  return years >= 1
}

/**
 * 연차일 수 계산
 * - Hourly: 0일
 * - 직원관리에서 직접 입력한 값이 있으면 그 값 우선
 * - null/미입력 시 입사일 기준 자동 계산:
 *   - 입사 1년 미만: 0일
 *   - 1년차(입사 1년~2년 미만): 6일
 *   - 2년차: 7일, 3년차: 8일, ... (5 + 년차)
 */
export function getAnnualLeaveDays(emp: Record<string, unknown> | null): number {
  if (!emp) return 0
  const salType = String(emp.sal_type ?? emp.salType ?? '').trim()
  if (salType.toLowerCase() === 'hourly') return 0

  const directVal = emp.annual_leave_days ?? emp.annualLeaveDays
  if (directVal != null && directVal !== '' && Number(directVal) >= 0) {
    const direct = Number(directVal)
    if (!Number.isNaN(direct)) return direct
  }

  const joinStr = emp.join_date ?? emp.joinDate
  if (!joinStr) return 0

  const joinDate = new Date(String(joinStr).slice(0, 10) + 'T12:00:00')
  if (isNaN(joinDate.getTime())) return 0

  const today = new Date()
  let years = today.getFullYear() - joinDate.getFullYear()
  const joinAnnivThisYear = new Date(today.getFullYear(), joinDate.getMonth(), joinDate.getDate())
  if (today < joinAnnivThisYear) years--

  if (years < 1) return 0
  return 5 + years
}
