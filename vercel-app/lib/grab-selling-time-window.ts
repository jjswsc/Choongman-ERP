/**
 * Grab sellingTimes[].startTime / endTime (UTC, `"YYYY-MM-DD HH:mm:ss"`).
 * 동일한 start+end 조합이 2개 이상이면 Grab menu-sync가
 * `the time of sellingtime is duplicate` 로 판매시간 갱신을 거부한다.
 */
export function grabSellingTimeWindowForSlot(slot: number): { startTime: string; endTime: string } {
  const safe = Math.max(0, Math.min(Math.floor(slot), 19))
  const startDay = 9 + safe
  const endDay = Math.max(28, 31 - safe)
  return {
    startTime: `2020-01-${String(startDay).padStart(2, '0')} 00:00:00`,
    endTime: `2039-12-${String(endDay).padStart(2, '0')} 23:59:59`,
  }
}
