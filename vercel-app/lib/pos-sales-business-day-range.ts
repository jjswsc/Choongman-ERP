/**
 * 매출 관리(posSales*) 조회: UI의 startStr~endStr 은 POS 영업일 라벨(YYYY-MM-DD)로 해석하고,
 * getPosTodaySales / getPosOrders(posBizDayScope) 와 동일한 영업일 구간으로 맞춘다.
 */
import { iterBangkokYmdInclusive } from '@/lib/attendance-utils'
import { addDaysYmd, getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import {
  type PosBusinessDaySettingsContext,
  posBusinessDayUtcEnvelopeBangkokYmd,
  resolvePosBusinessHoursFromContext,
} from '@/lib/pos-business-day-server'

function normalizeYmd(s: string): string {
  return s.trim().slice(0, 10)
}

/** POS 영업일 라벨(YYYY-MM-DD)이 start~end(포함) 안인지 — 손익·매출 관리 월 조회 클램프용 */
export function isPosSalesBusinessYmdInInclusiveRange(
  ymd: string,
  startYmd: string,
  endYmd: string
): boolean {
  const d = normalizeYmd(ymd)
  const lo = normalizeYmd(startYmd)
  const hi = normalizeYmd(endYmd)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{4}-\d{2}-\d{2}$/.test(lo) || !/^\d{4}-\d{2}-\d{2}$/.test(hi)) {
    return false
  }
  const loEff = lo <= hi ? lo : hi
  const hiEff = lo <= hi ? hi : lo
  return d >= loEff && d <= hiEff
}

/**
 * 영업일 라벨 startYmd~endYmd(포함)에 속할 수 있는 주문의 created_at UTC 봉투.
 * 매장별 영업시간이 다를 수 있으므로, 가능한 모든 영업시간 설정에 대한 일별 봉투를 합친다.
 */
export function posSalesBusinessDateRangeUtcEnvelope(
  ctx: PosBusinessDaySettingsContext,
  startYmd: string,
  endYmd: string
): { startISO: string; endISOExclusive: string } {
  const days = iterBangkokYmdInclusive(startYmd, endYmd)
  if (days.length === 0) {
    return posBusinessDayUtcEnvelopeBangkokYmd(normalizeYmd(startYmd) || normalizeYmd(endYmd), ctx)
  }
  let minMs = Infinity
  let maxMs = -Infinity
  for (const d of days) {
    const { startISO, endISOExclusive } = posBusinessDayUtcEnvelopeBangkokYmd(d, ctx)
    const a = Date.parse(startISO)
    const b = Date.parse(endISOExclusive)
    if (Number.isFinite(a)) minMs = Math.min(minMs, a)
    if (Number.isFinite(b)) maxMs = Math.max(maxMs, b)
  }
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    return posBusinessDayUtcEnvelopeBangkokYmd(days[0]!, ctx)
  }
  return {
    startISO: new Date(minMs).toISOString(),
    endISOExclusive: new Date(maxMs).toISOString(),
  }
}

/**
 * 방콕 달력일 start~end(포함)의 UTC 봉투.
 * padDays>0 이면 양쪽으로 하루씩 넓혀, 전날 생성·당일 결제 주문을 created_at 조회로 담는다.
 */
export function posSalesBangkokCalendarRangeUtcEnvelope(
  startYmd: string,
  endYmd: string,
  padDays = 0
): { startISO: string; endISOExclusive: string } {
  const pad = Math.max(0, Math.trunc(Number(padDays) || 0))
  const lo = normalizeYmd(startYmd)
  const hi = normalizeYmd(endYmd)
  const start = addDaysYmd(lo, -pad)
  const end = addDaysYmd(hi, pad)
  const startMs = Date.parse(`${start}T00:00:00+07:00`)
  const endExclusive = addDaysYmd(end, 1)
  const endMs = Date.parse(`${endExclusive}T00:00:00+07:00`)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    const fbStart = Date.parse(`${lo}T00:00:00+07:00`)
    const fbEnd = Date.parse(`${addDaysYmd(hi, 1)}T00:00:00+07:00`)
    return {
      startISO: new Date(Number.isFinite(fbStart) ? fbStart : Date.now()).toISOString(),
      endISOExclusive: new Date(Number.isFinite(fbEnd) ? fbEnd : Date.now()).toISOString(),
    }
  }
  return {
    startISO: new Date(startMs).toISOString(),
    endISOExclusive: new Date(endMs).toISOString(),
  }
}

export function posOrderCreatedAtInSalesBusinessDateRange(
  createdAt: string | null | undefined,
  storeCode: string | null | undefined,
  ctx: PosBusinessDaySettingsContext,
  startYmd: string,
  endYmd: string
): boolean {
  if (!createdAt) return false
  const lo = normalizeYmd(startYmd)
  const hi = normalizeYmd(endYmd)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lo) || !/^\d{4}-\d{2}-\d{2}$/.test(hi)) return false
  const loEff = lo <= hi ? lo : hi
  const hiEff = lo <= hi ? hi : lo
  const biz = getPosBusinessDateStrFromConfig(
    new Date(createdAt),
    resolvePosBusinessHoursFromContext(ctx, String(storeCode ?? '').trim())
  )
  return biz >= loEff && biz <= hiEff
}

export function filterRowsByPosSalesBusinessDateRange<
  T extends { created_at?: string | null; store_code?: string | null },
>(rows: T[], ctx: PosBusinessDaySettingsContext, startYmd: string, endYmd: string): T[] {
  return rows.filter((r) =>
    posOrderCreatedAtInSalesBusinessDateRange(r.created_at, r.store_code, ctx, startYmd, endYmd)
  )
}
