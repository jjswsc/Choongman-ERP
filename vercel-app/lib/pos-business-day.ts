export const POS_TIMEZONE = 'Asia/Bangkok'

/** 방콕 벽시계 한 시각 */
export type PosBusinessClock = { hour: number; minute: number }

/**
 * 영업 구간: 방콕 달력일 D의 「하루 매출」은 [ D@start , boundary ) (끝 미포함).
 * - end 시각이 start와 같으면: 기존과 동일하게 24시간 창 [D@start, (D+1)@start)
 * - end 분이 start 분보다 작거나 같으면(자정 넘김): [D@start, (D+1)@end) — 예: 10:00~익일 02:00
 * - end 분이 start 분보다 크면(같은 달력일): [D@start, D@end) + 마감~익일 오픈 전(자정 넘김)은 전날 영업일로 묶음(아래 getPosBusinessDateStrFromConfig)
 */
export type PosBusinessHoursConfig = { start: PosBusinessClock; end: PosBusinessClock }

/** @deprecated — `PosBusinessClock` / 영업 시작 시각만 쓰던 타입명 */
export type PosBusinessDayStartConfig = PosBusinessClock

export const POS_BUSINESS_DAY_DEFAULT_START: PosBusinessClock = { hour: 8, minute: 0 }

export const POS_BUSINESS_DAY_DEFAULT_HOURS: PosBusinessHoursConfig = {
  start: POS_BUSINESS_DAY_DEFAULT_START,
  end: { ...POS_BUSINESS_DAY_DEFAULT_START },
}

/** @deprecated */
export const POS_OVERNIGHT_CUTOFF_HOUR = 7

let clientOverride: PosBusinessHoursConfig | null = null

export function setPosBusinessHoursClient(c: PosBusinessHoursConfig | null): void {
  clientOverride = c && isValidHours(c) ? normalizeHours(c) : null
}

/** 하위 호환: 종료 = 시작(24h 창)으로 간주 */
export function setPosBusinessDayStartClient(c: PosBusinessClock | null): void {
  if (!c || !isValidClock(c)) {
    setPosBusinessHoursClient(null)
    return
  }
  const s = normalizeClock(c)
  setPosBusinessHoursClient({ start: s, end: s })
}

function isValidClock(c: PosBusinessClock): boolean {
  return c.hour >= 0 && c.hour <= 23 && c.minute >= 0 && c.minute <= 59
}

function isValidHours(c: PosBusinessHoursConfig): boolean {
  return isValidClock(c.start) && isValidClock(c.end)
}

export function normalizeClock(c: PosBusinessClock): PosBusinessClock {
  const hour = Math.min(23, Math.max(0, Math.trunc(Number(c.hour) || 0)))
  const minute = Math.min(59, Math.max(0, Math.trunc(Number(c.minute) || 0)))
  return { hour, minute }
}

export function normalizeHours(c: PosBusinessHoursConfig): PosBusinessHoursConfig {
  return { start: normalizeClock(c.start), end: normalizeClock(c.end) }
}

/** system_settings `value_json` — 구형 {hour, minute} 또는 { start, end } / endHour 등 */
export function normalizePosBusinessHours(raw: unknown): PosBusinessHoursConfig {
  if (raw == null) return { ...POS_BUSINESS_DAY_DEFAULT_HOURS }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const h = Math.trunc(raw)
    if (h >= 0 && h <= 23) {
      const s = { hour: h, minute: 0 }
      return { start: s, end: s }
    }
  }
  if (typeof raw === 'string') {
    const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(raw.trim())
    if (m) {
      const sh = parseInt(m[1], 10)
      const sm = parseInt(m[2], 10)
      const eh = parseInt(m[3], 10)
      const em = parseInt(m[4], 10)
      if ([sh, sm, eh, em].every(Number.isFinite)) {
        return normalizeHours({
          start: { hour: sh, minute: sm },
          end: { hour: eh, minute: em },
        })
      }
    }
    const one = /^(\d{1,2}):(\d{2})$/.exec(raw.trim())
    if (one) {
      const hour = parseInt(one[1], 10)
      const minute = parseInt(one[2], 10)
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        const s = normalizeClock({ hour, minute })
        return { start: s, end: s }
      }
    }
  }
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>
    const pickClock = (src: Record<string, unknown>, hKey: string, mKey: string): PosBusinessClock | null => {
      const hour = Number(src[hKey])
      const minute = Number(src[mKey] ?? 0)
      if (!Number.isFinite(hour)) return null
      return normalizeClock({ hour, minute })
    }
    const nestedStart = o.start && typeof o.start === 'object' ? (o.start as Record<string, unknown>) : null
    const nestedEnd = o.end && typeof o.end === 'object' ? (o.end as Record<string, unknown>) : null
    let start: PosBusinessClock | null = null
    let end: PosBusinessClock | null = null
    if (nestedStart) {
      start = pickClock(nestedStart, 'hour', 'minute')
    } else if (Number.isFinite(Number(o.hour))) {
      start = normalizeClock({ hour: Number(o.hour), minute: Number(o.minute ?? o.m ?? 0) })
    }
    if (nestedEnd) {
      end = pickClock(nestedEnd, 'hour', 'minute')
    } else if (Number.isFinite(Number(o.endHour))) {
      end = normalizeClock({ hour: Number(o.endHour), minute: Number(o.endMinute ?? o.endM ?? 0) })
    }
    if (start && end) return normalizeHours({ start, end })
    if (start) return normalizeHours({ start, end: start })
  }
  return { ...POS_BUSINESS_DAY_DEFAULT_HOURS }
}

/** 시작 시각만 있는 구형 JSON */
export function normalizePosBusinessDayStart(raw: unknown): PosBusinessClock {
  return normalizePosBusinessHours(raw).start
}

export function getBangkokDateStr(base: Date = new Date()): string {
  return base.toLocaleDateString('en-CA', { timeZone: POS_TIMEZONE })
}

export function getBangkokClockParts(base: Date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: POS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(base)
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) || 0
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10) || 0
  return { hour: Math.min(23, Math.max(0, hour)), minute: Math.min(59, Math.max(0, minute)) }
}

/** @deprecated — `getBangkokClockParts` 사용 권장 */
export function getBangkokHour(base: Date = new Date()): number {
  return getBangkokClockParts(base).hour
}

export function clockToMinutes(h: number, m: number): number {
  return h * 60 + m
}

export function addDaysYmd(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

function bangkokWallToUtcMs(ymd: string, clock: PosBusinessClock): number {
  const d = ymd.trim().slice(0, 10)
  const pad = (n: number) => String(n).padStart(2, '0')
  const c = normalizeClock(clock)
  return Date.parse(`${d}T${pad(c.hour)}:${pad(c.minute)}:00+07:00`)
}

/**
 * 영업일 라벨 `businessDateYmd`(YYYY-MM-DD)에 해당하는 집계 UTC 구간 (끝 미포함).
 */
export function posBusinessDateYmdToUtcRange(
  businessDateYmd: string,
  hours: PosBusinessHoursConfig
): { startISO: string; endISOExclusive: string } {
  const d = businessDateYmd.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const now = getBangkokDateStr()
    return posBusinessDateYmdToUtcRange(now, hours)
  }
  const cfg = normalizeHours(hours)
  const sm = clockToMinutes(cfg.start.hour, cfg.start.minute)
  const em = clockToMinutes(cfg.end.hour, cfg.end.minute)

  if (em === sm) {
    const next = addDaysYmd(d, 1)
    const startMs = bangkokWallToUtcMs(d, cfg.start)
    const endMs = bangkokWallToUtcMs(next, cfg.start)
    return {
      startISO: new Date(startMs).toISOString(),
      endISOExclusive: new Date(endMs).toISOString(),
    }
  }
  if (em < sm) {
    const next = addDaysYmd(d, 1)
    const startMs = bangkokWallToUtcMs(d, cfg.start)
    const endMs = bangkokWallToUtcMs(next, cfg.end)
    return {
      startISO: new Date(startMs).toISOString(),
      endISOExclusive: new Date(endMs).toISOString(),
    }
  }
  const startMs = bangkokWallToUtcMs(d, cfg.start)
  const endMs = bangkokWallToUtcMs(d, cfg.end)
  return {
    startISO: new Date(startMs).toISOString(),
    endISOExclusive: new Date(endMs).toISOString(),
  }
}

export function getPosBusinessDateStrFromConfig(base: Date, hours: PosBusinessHoursConfig): string {
  const cfg = normalizeHours(hours)
  const sm = clockToMinutes(cfg.start.hour, cfg.start.minute)
  const em = clockToMinutes(cfg.end.hour, cfg.end.minute)
  const cal = getBangkokDateStr(base)
  const t = base.getTime()
  for (const delta of [-1, 0, 1] as const) {
    const d = addDaysYmd(cal, delta)
    const { startISO, endISOExclusive } = posBusinessDateYmdToUtcRange(d, cfg)
    const a = Date.parse(startISO)
    const b = Date.parse(endISOExclusive)
    if (Number.isFinite(a) && Number.isFinite(b) && t >= a && t < b) return d
  }
  // em > sm: [D@start,D@end)만 있으면 '전날 마감~자정~익일 오픈 전'이 어느 창에도 안 들어가 달력일로 떨어지던 문제 보정
  if (em > sm) {
    const prev = addDaysYmd(cal, -1)
    const gapStartMs = bangkokWallToUtcMs(prev, cfg.end)
    const dayBoundaryMs = bangkokWallToUtcMs(cal, { hour: 0, minute: 0 })
    const dayOpenMs = bangkokWallToUtcMs(cal, cfg.start)
    if (
      Number.isFinite(gapStartMs) &&
      Number.isFinite(dayBoundaryMs) &&
      Number.isFinite(dayOpenMs) &&
      dayOpenMs > dayBoundaryMs &&
      gapStartMs < dayBoundaryMs &&
      t >= dayBoundaryMs &&
      t < dayOpenMs
    ) {
      return prev
    }
  }
  return cal
}

export function getPosBusinessDateStr(base: Date = new Date()): string {
  const h = clientOverride ?? POS_BUSINESS_DAY_DEFAULT_HOURS
  return getPosBusinessDateStrFromConfig(base, h)
}
