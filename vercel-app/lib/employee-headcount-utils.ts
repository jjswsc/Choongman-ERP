/** YYYY-MM-DD 앞 10자 */
export function toYmd(val: string): string {
  return String(val || '').trim().slice(0, 10)
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
