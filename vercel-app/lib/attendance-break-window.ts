/**
 * 휴게 버튼(휴식시작/휴식종료)과 근무표 휴게 구간을 비교한다.
 * 예정 구간 밖에서 휴게를 시작한 경우만 시간외로 본다. 길이 초과는 breakOverMin이 담당한다.
 */

export type BreakPunch = { type: 'start' | 'end'; at: string }

export type PairedBreakSpan = { startIso: string; endIso: string }

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

export function formatPlanHm(raw: string | null | undefined): string {
  const min = hmToMinutes(raw)
  if (min == null) return ''
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function hmToMinutes(raw: string | null | undefined): number | null {
  const m = String(raw || '').trim().match(/(\d{1,2})\s*[:\s]\s*(\d{1,2})/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || min < 0 || min > 59) return null
  return h * 60 + min
}

/** 시간순으로 시작–종료를 묶는다. 종료가 없으면 진행 중, 시작이 없으면 종료만 남긴다. */
export function pairBreakPunches(events: BreakPunch[]): PairedBreakSpan[] {
  const sorted = events
    .filter((e) => e.at && (e.type === 'start' || e.type === 'end'))
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at) || (a.type === b.type ? 0 : a.type === 'start' ? -1 : 1))
  const spans: PairedBreakSpan[] = []
  let open: string | null = null
  for (const e of sorted) {
    if (e.type === 'start') {
      if (open) spans.push({ startIso: open, endIso: '' })
      open = e.at
    } else {
      spans.push({ startIso: open || '', endIso: e.at })
      open = null
    }
  }
  if (open) spans.push({ startIso: open, endIso: '' })
  return spans
}

/** 근무일(방콕 달력)의 HH:mm → UTC epoch ms. plusDay면 다음날. */
function bangkokHmToUtcMs(dateStr: string, hm: string, plusDay: boolean): number | null {
  const min = hmToMinutes(hm)
  if (min == null || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const [y, mo, d] = dateStr.split('-').map(Number)
  const utcMidnight = Date.UTC(y, mo - 1, d + (plusDay ? 1 : 0)) - BANGKOK_OFFSET_MS
  return utcMidnight + min * 60 * 1000
}

/**
 * 휴게 시작이 예정 구간 [start, end) 밖이면 true.
 * 시작이 없고 종료만 있으면 종료 시각이 구간 밖일 때 true.
 * 예정 휴게가 없으면 false.
 */
export function breakSpanIsOffPlan(params: {
  scheduleDate: string
  planStart: string
  planEnd: string
  startIso: string
  endIso: string
}): boolean {
  const ps = hmToMinutes(params.planStart)
  const pe = hmToMinutes(params.planEnd)
  if (ps == null || pe == null || pe === ps) return false
  const planStartMs = bangkokHmToUtcMs(params.scheduleDate, params.planStart, false)
  const planEndMs = bangkokHmToUtcMs(params.scheduleDate, params.planEnd, pe <= ps)
  if (planStartMs == null || planEndMs == null || planEndMs <= planStartMs) return false

  const startMs = params.startIso ? new Date(params.startIso).getTime() : NaN
  const endMs = params.endIso ? new Date(params.endIso).getTime() : NaN
  const hasStart = Number.isFinite(startMs)
  const hasEnd = Number.isFinite(endMs)
  if (!hasStart && !hasEnd) return false
  if (hasStart) return startMs < planStartMs || startMs >= planEndMs
  return endMs < planStartMs || endMs > planEndMs
}
