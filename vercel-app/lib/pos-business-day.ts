export const POS_TIMEZONE = 'Asia/Bangkok'
export const POS_OVERNIGHT_CUTOFF_HOUR = 7

/** 방콕 기준 날짜 YYYY-MM-DD */
export function getBangkokDateStr(base: Date = new Date()): string {
  return base.toLocaleDateString('en-CA', { timeZone: POS_TIMEZONE })
}

/** 방콕 기준 시(hour) 0~23 */
export function getBangkokHour(base: Date = new Date()): number {
  const str = base.toLocaleTimeString('en-US', {
    timeZone: POS_TIMEZONE,
    hour: '2-digit',
    hour12: false,
  })
  return parseInt(str, 10) || 0
}

/** YYYY-MM-DD 문자열에 일수 더하기 */
export function addDaysYmd(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

/**
 * POS 영업일(근태와 동일 기준)
 * - 방콕 기준 00:00~07:59 는 전날 영업일로 귀속
 * - 그 외 시간은 당일 영업일
 */
export function getPosBusinessDateStr(base: Date = new Date()): string {
  const today = getBangkokDateStr(base)
  const hour = getBangkokHour(base)
  if (hour >= 0 && hour <= POS_OVERNIGHT_CUTOFF_HOUR) {
    return addDaysYmd(today, -1)
  }
  return today
}
