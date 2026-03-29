/** 캠페인 차수별 기간 — DB `marketing_campaigns.phase_periods` JSON과 동일 */

export type MarketingCampaignPhasePeriod = {
  label: string
  startDate: string | null
  endDate: string | null
}

const MAX_PHASES = 20

function sliceYmd(s: string | null | undefined): string {
  const t = String(s ?? "").trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ""
}

export function parsePhasePeriodsFromUnknown(raw: unknown): MarketingCampaignPhasePeriod[] {
  if (!Array.isArray(raw)) return []
  const out: MarketingCampaignPhasePeriod[] = []
  for (const item of raw) {
    if (out.length >= MAX_PHASES) break
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const label = String(o.label ?? o.phase_label ?? "").trim()
    const startDate = sliceYmd(o.startDate != null ? String(o.startDate) : o.start_date != null ? String(o.start_date) : "") || null
    const endDate = sliceYmd(o.endDate != null ? String(o.endDate) : o.end_date != null ? String(o.end_date) : "") || null
    if (!label && !startDate && !endDate) continue
    out.push({
      label: label || "",
      startDate,
      endDate,
    })
  }
  return out
}

/** 대시보드 등: KPI 조회에 쓸 만한 시작·종료가 하나라도 정의됐는지 */
export function marketingCampaignHasDefinedPeriod(c: {
  startDate?: string | null
  endDate?: string | null
  phasePeriods?: MarketingCampaignPhasePeriod[] | null
}): boolean {
  const mainS = sliceYmd(c.startDate ?? null)
  const mainE = sliceYmd(c.endDate ?? null)
  if (mainS && mainE) return true
  const phases = c.phasePeriods ?? []
  return phases.some((p) => sliceYmd(p.startDate) && sliceYmd(p.endDate))
}

/**
 * 월간 리포트 등: 캠페인(전체 기간 + 차수)이 닫힌 구간 [rangeStart, rangeEnd]와 맞닿는지
 * (시작·종료 YYYY-MM-DD 문자열 비교)
 */
export function marketingCampaignTouchesClosedDateRange(
  c: {
    startDate?: string | null
    endDate?: string | null
    phasePeriods?: MarketingCampaignPhasePeriod[] | null
  },
  rangeStart: string,
  rangeEnd: string,
): boolean {
  const rs = sliceYmd(rangeStart)
  const re = sliceYmd(rangeEnd)
  if (!rs || !re) return false

  const inRange = (d: string) => d && d >= rs && d <= re

  const segmentTouches = (cStart: string | null | undefined, cEnd: string | null | undefined) => {
    const s = sliceYmd(cStart ?? null)
    const e = sliceYmd(cEnd ?? null)
    if (!s && !e) return false
    if (s && inRange(s)) return true
    if (e && inRange(e)) return true
    if (s && e && s <= re && e >= rs) return true
    return false
  }

  if (segmentTouches(c.startDate, c.endDate)) return true
  for (const p of c.phasePeriods ?? []) {
    if (segmentTouches(p.startDate, p.endDate)) return true
  }
  return false
}

/** 비교·필터용: 전체 기간 + 차수에서 최소 시작·최대 종료 (없으면 null) */
export function marketingCampaignEffectiveBounds(c: {
  startDate?: string | null
  endDate?: string | null
  phasePeriods?: MarketingCampaignPhasePeriod[] | null
}): { startDate: string | null; endDate: string | null } {
  const mainS = sliceYmd(c.startDate ?? null) || null
  const mainE = sliceYmd(c.endDate ?? null) || null
  const phases = c.phasePeriods ?? []
  const starts: string[] = []
  const ends: string[] = []
  if (mainS) starts.push(mainS)
  if (mainE) ends.push(mainE)
  for (const p of phases) {
    const ps = sliceYmd(p.startDate)
    const pe = sliceYmd(p.endDate)
    if (ps) starts.push(ps)
    if (pe) ends.push(pe)
  }
  if (starts.length === 0) return { startDate: null, endDate: null }
  starts.sort()
  const startDate = starts[0]!
  ends.sort()
  const endDate = ends.length > 0 ? ends[ends.length - 1]! : null
  return { startDate, endDate }
}

/** 디자인 일정 단일 구간이 조회 구간과 겹치는지 */
export function campaignDesignTouchesRange(c: {
  designStartDate?: string | null
  designEndDate?: string | null
}, rangeStart: string, rangeEnd: string): boolean {
  const rs = sliceYmd(rangeStart)
  const re = sliceYmd(rangeEnd)
  if (!rs || !re) return false

  const ds = sliceYmd(c.designStartDate ?? null)
  const de = sliceYmd(c.designEndDate ?? null)
  if (!ds && !de) return false
  const ps = ds || de
  const pe = de || ds
  if (!ps || !pe) return false
  return ps <= re && pe >= rs
}
