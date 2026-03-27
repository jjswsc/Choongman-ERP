/** YYYY-MM-DD 앞 10자 */
export function toYmd(val: string): string {
  return String(val || '').trim().slice(0, 10)
}

/** 급여유형(sal_type)이 파트타임이면 true — 적정인원·이동 현황에서 0.5명으로 환산 */
export function isPartTimeSalType(salType: string): boolean {
  const raw = String(salType || '').trim()
  if (!raw) return false
  if (/파트/.test(raw)) return true
  const n = raw.toLowerCase().replace(/\s+/g, ' ')
  if (n === 'part-time' || n === 'part time' || n === 'parttime') return true
  if (n.includes('part-time') || n.includes('part time')) return true
  return false
}

/** 재직 1명당 가중치 (파트타임 0.5, 그 외 1) */
export function employeeHeadcountWeight(salType: string): number {
  return isPartTimeSalType(salType) ? 0.5 : 1
}

/** 차트·표시용 (10 → "10", 10.5 → "10.5") */
export function formatHeadcountFte(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n))
  return String(Math.round(n * 10) / 10)
}

/**
 * 방콕 기준 asOfYmd 시점 재직 여부.
 * 입사일이 asOf 이후면 미재직. 퇴사일이 있고 asOf > 퇴사일이면 퇴사 처리.
 */
export function isEmployedAsOf(join: string, resign: string, asOfYmd: string): boolean {
  const j = toYmd(join)
  const r = toYmd(resign)
  if (r && asOfYmd > r) return false
  if (j && j > asOfYmd) return false
  return true
}

export function joinInPeriod(join: string, startYmd: string, endYmd: string): boolean {
  const j = toYmd(join)
  if (!j) return false
  return j >= startYmd && j <= endYmd
}

export function resignInPeriod(resign: string, startYmd: string, endYmd: string): boolean {
  const r = toYmd(resign)
  if (!r) return false
  return r >= startYmd && r <= endYmd
}

/** YYYY-MM-DD에 일수 더하기 (달력일, 문자열 비교용) */
export function addDaysToYmd(ymd: string, deltaDays: number): string {
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(5, 7))
  const d = Number(ymd.slice(8, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * 퇴사일이 [todayYmd, windowEndYmd] 안에 있고, todayYmd 시점 재직인 경우.
 * (퇴사일 미입력·과거 퇴사는 제외)
 */
export function isResignScheduledInWindow(join: string, resign: string, todayYmd: string, windowEndYmd: string): boolean {
  const r = toYmd(resign)
  if (!r) return false
  if (!isEmployedAsOf(join, resign, todayYmd)) return false
  return r >= todayYmd && r <= windowEndYmd
}
