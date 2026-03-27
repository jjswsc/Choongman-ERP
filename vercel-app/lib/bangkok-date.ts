/** 방콕(Asia/Bangkok) 달력 기준 날짜 유틸 */

export function todayBangkokYmd(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/** 당일 방콕 기준 yyyy-MM-dd (POS 프로모 기간 등) */
export function bangkokDateStrISO(): string {
  return todayBangkokYmd()
}

/** endYmd를 끝으로 dayCount일(양 끝 포함) 구간의 시작·끝 YYYY-MM-DD */
export function bangkokInclusivePeriod(endYmd: string, dayCount: number): { startYmd: string; endYmd: string } {
  const n = Math.max(1, Math.min(366, Math.floor(dayCount)))
  const endAnchor = new Date(`${endYmd}T12:00:00+07:00`)
  const startMs = endAnchor.getTime() - (n - 1) * 86400000
  const startYmd = new Date(startMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  return { startYmd, endYmd: endYmd }
}

export function bangkokYmdRangeToIsoBounds(startYmd: string, endYmd: string): { gteIso: string; lteIso: string } {
  return {
    gteIso: `${startYmd}T00:00:00+07:00`,
    lteIso: `${endYmd}T23:59:59.999+07:00`,
  }
}
