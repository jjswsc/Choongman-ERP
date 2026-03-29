/** 협업 조회 탭 기본 조회 기간 — 방콕(Asia/Bangkok) 당월 1일~말일 */

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
