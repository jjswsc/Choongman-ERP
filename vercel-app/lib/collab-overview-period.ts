/** 협업·마케팅 조회 기간 — 방콕(Asia/Bangkok) 기준 */

export function getBangkokCurrentMonthRangeYmd(): { from: string; to: string } {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
  const [y, m] = ymd.split("-")
  const yi = Number(y)
  const mi = Number(m)
  const from = `${y}-${m}-01`
  const lastD = new Date(yi, mi, 0).getDate()
  const to = `${y}-${m}-${String(lastD).padStart(2, "0")}`
  return { from, to }
}

/** 목록·조회 기본 구간: 종료=방콕 오늘, 시작=그로부터 30일 전(같은 시각 기준 30×24h) */
export function getBangkokRolling30DayRangeYmd(): { from: string; to: string } {
  const to = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
  const [yStr, mStr, dStr] = to.split("-")
  const anchor = new Date(`${yStr}-${mStr}-${dStr}T12:00:00+07:00`)
  const fromMs = anchor.getTime() - 30 * 24 * 60 * 60 * 1000
  const from = new Date(fromMs).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
  return { from, to }
}
