const BANGKOK_TIMEZONE = 'Asia/Bangkok'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 방콕(UTC+7) 기준 "YYYY-MM-DD HH:mm:ss" 문자열
 * timestamp without time zone 컬럼 저장용으로 사용.
 */
export function getBangkokDateTimeString(base: Date = new Date()): string {
  const local = new Date(base.toLocaleString('en-US', { timeZone: BANGKOK_TIMEZONE }))
  const y = local.getFullYear()
  const m = pad2(local.getMonth() + 1)
  const d = pad2(local.getDate())
  const hh = pad2(local.getHours())
  const mm = pad2(local.getMinutes())
  const ss = pad2(local.getSeconds())
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
}
