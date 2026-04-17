/**
 * 당일 실시간 근무 격자 — 자정 넘김 스케줄(예: 17:30~02:30)을
 * plannedWorkMinutesFromPlans / 주간 시간표와 동일한 기준으로 표시한다.
 * 기존: plan_out이 새벽 시각으로만 저장돼 out < in 이 되면 칸 겹침이 없어 행이 통째로 비어 보임.
 */
import { parsePlanToMinutes, todayStrBangkok } from '@/lib/attendance-utils'

export type RealtimeScheduleRowInput = {
  leaveType?: string
  pIn: string
  pOut: string
  pBS: string
  pBE: string
  plan_in_prev_day?: boolean
}

/** 급여 plannedWorkMinutesFromPlans 와 동일한 자정 넘김 여부 (분 단위) */
export function isOvernightRealtimeRow(inMin: number, rawOutMin: number, planInPrevDay?: boolean): boolean {
  if (planInPrevDay) return true
  return rawOutMin < inMin && inMin >= 15 * 60
}

/** 익일 새벽 퇴근까지 포함한 근무 종료 시각(분) — 자정 넘김만 +24h */
export function workEndMinutesExtended(inMin: number, rawOutMin: number, planInPrevDay?: boolean): number {
  let out = rawOutMin
  if (out < inMin && (planInPrevDay || inMin >= 15 * 60)) {
    out += 24 * 60
  }
  return out
}

/**
 * 격자 열 인덱스 k: 근무일 0시 기준 k~k+1 시간 = [k*60, (k+1)*60) 분 (k는 26까지 등 확장 가능).
 */
export function collectRealtimeLinearHourIndices(rows: RealtimeScheduleRowInput[]): number[] {
  const set = new Set<number>()
  for (const p of rows) {
    if (p.leaveType) continue
    const inMin = parsePlanToMinutes(String(p.pIn || '').trim() || '09:00')
    const rawOut = parsePlanToMinutes(String(p.pOut || '').trim() || '18:00')
    const endExt = workEndMinutesExtended(inMin, rawOut, p.plan_in_prev_day)
    if (endExt <= inMin) continue
    for (let k = Math.floor(inMin / 60); k < Math.ceil(endExt / 60); k++) {
      if (k >= 0 && k < 48) set.add(k)
    }
    const bs = parsePlanToMinutes(String(p.pBS || '').trim())
    const be = parsePlanToMinutes(String(p.pBE || '').trim())
    if (bs > 0 && be > bs) {
      for (let k = Math.floor(bs / 60); k < Math.ceil(be / 60); k++) {
        if (k >= 0 && k < 48) set.add(k)
      }
    }
  }
  return Array.from(set).sort((a, b) => a - b)
}

export type RealtimeSlotParts = {
  fullBreak: boolean
  fullWork: boolean
  breakFirst: boolean
  breakSecond: boolean
  workFirst: boolean
  workSecond: boolean
  inAny: boolean
}

/** linear hour k — [k*60,(k+1)*60) 을 반으로 나눈 휴게/근무 마스크 (자정 넘김 포함) */
export function realtimeSlotPartsForLinearHour(
  k: number,
  p: RealtimeScheduleRowInput
): RealtimeSlotParts {
  if (p.leaveType) {
    return {
      fullBreak: false,
      fullWork: false,
      breakFirst: false,
      breakSecond: false,
      workFirst: false,
      workSecond: false,
      inAny: false,
    }
  }
  const inMin = parsePlanToMinutes(String(p.pIn || '').trim() || '09:00')
  const rawOut = parsePlanToMinutes(String(p.pOut || '').trim() || '18:00')
  const endExt = workEndMinutesExtended(inMin, rawOut, p.plan_in_prev_day)
  const bs = parsePlanToMinutes(String(p.pBS || '').trim())
  const be = parsePlanToMinutes(String(p.pBE || '').trim())

  const h0 = k * 60
  const h05 = k * 60 + 30
  const h1 = (k + 1) * 60

  const seg = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && a1 > b0

  const inWork = (t0: number, t1: number) => seg(t0, t1, inMin, endExt)
  const inBreak =
    bs > 0 && be > bs
      ? (t0: number, t1: number) => seg(t0, t1, bs, be)
      : (_t0: number, _t1: number) => false

  const breakFirst = inBreak(h0, h05)
  const breakSecond = inBreak(h05, h1)
  const fullBreak = breakFirst && breakSecond

  const workFirst = inWork(h0, h05) && !breakFirst
  const workSecond = inWork(h05, h1) && !breakSecond
  const fullWork = workFirst && workSecond

  const inAny = fullBreak || fullWork || breakFirst || breakSecond || workFirst || workSecond
  return { fullBreak, fullWork, breakFirst, breakSecond, workFirst, workSecond, inAny }
}

/** 헤더: 24 미만은 그대로, 이상은 익일 새벽으로 표시 (예: 25 → 1) */
export function formatRealtimeLinearHourLabel(k: number): string {
  if (k < 24) return String(k)
  return String(k - 24)
}

/**
 * 방콕 기준 `ymd` 자정(00:00)부터 현재까지 경과 시간(h, 소수).
 * 당일 실시간 격자에서 linear hour(k≥24)까지 "지난 칸" 판별에 사용.
 */
export function nowDecimalHoursSinceBangkokDateMidnight(ymd: string): number | null {
  const v = ymd.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const cal = todayStrBangkok()
  if (v > cal) return null
  const startMs = new Date(v + 'T00:00:00+07:00').getTime()
  return (Date.now() - startMs) / 3600000
}
