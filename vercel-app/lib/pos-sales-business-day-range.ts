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

/**
 * 영수증·주문 이력 날짜 기준.
 * - created: 주문 생성(영업일) — 기존 getPosOrders 기본
 * - paid: 결제 시각(paid_at)이 해당 영업일
 * - either: 생성일 또는 결제일 중 하나라도 해당 영업일(전날 연 테이블·당일 결제 포함)
 */
export type PosOrdersDateBasis = 'created' | 'paid' | 'either'

export function parsePosOrdersDateBasis(raw: string | null | undefined): PosOrdersDateBasis {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
  if (v === 'paid' || v === 'paid_at') return 'paid'
  if (v === 'either' || v === 'created_or_paid' || v === 'both') return 'either'
  return 'created'
}

/** paid_at 이 영업일 라벨 start~end 안인지 (시각 해석은 created_at 과 동일) */
export function posOrderPaidAtInSalesBusinessDateRange(
  paidAt: string | null | undefined,
  storeCode: string | null | undefined,
  ctx: PosBusinessDaySettingsContext,
  startYmd: string,
  endYmd: string
): boolean {
  return posOrderCreatedAtInSalesBusinessDateRange(paidAt, storeCode, ctx, startYmd, endYmd)
}

export function posOrderInSalesBusinessDateRangeByBasis(
  row: {
    created_at?: string | null
    paid_at?: string | null
    store_code?: string | null
  },
  ctx: PosBusinessDaySettingsContext,
  startYmd: string,
  endYmd: string,
  basis: PosOrdersDateBasis
): boolean {
  if (basis === 'paid') {
    return posOrderPaidAtInSalesBusinessDateRange(row.paid_at, row.store_code, ctx, startYmd, endYmd)
  }
  const inCreated = posOrderCreatedAtInSalesBusinessDateRange(
    row.created_at,
    row.store_code,
    ctx,
    startYmd,
    endYmd
  )
  if (basis === 'created') return inCreated
  if (inCreated) return true
  return posOrderPaidAtInSalesBusinessDateRange(row.paid_at, row.store_code, ctx, startYmd, endYmd)
}

export function filterRowsByPosSalesBusinessDateRange<
  T extends { created_at?: string | null; store_code?: string | null },
>(rows: T[], ctx: PosBusinessDaySettingsContext, startYmd: string, endYmd: string): T[] {
  return rows.filter((r) =>
    posOrderCreatedAtInSalesBusinessDateRange(r.created_at, r.store_code, ctx, startYmd, endYmd)
  )
}

export function filterRowsByPosSalesBusinessDateRangeBasis<
  T extends {
    created_at?: string | null
    paid_at?: string | null
    store_code?: string | null
  },
>(
  rows: T[],
  ctx: PosBusinessDaySettingsContext,
  startYmd: string,
  endYmd: string,
  basis: PosOrdersDateBasis
): T[] {
  if (basis === 'created') {
    return filterRowsByPosSalesBusinessDateRange(rows, ctx, startYmd, endYmd)
  }
  return rows.filter((r) => posOrderInSalesBusinessDateRangeByBasis(r, ctx, startYmd, endYmd, basis))
}

/**
 * either/paid 조회용 created_at UTC 봉투 — 전날 생성·당일 결제 주문을 담기 위해 시작일을 padStartDays 만큼 앞당김.
 */
export function posSalesBusinessDateRangeUtcEnvelopeForDateBasis(
  ctx: PosBusinessDaySettingsContext,
  startYmd: string,
  endYmd: string,
  basis: PosOrdersDateBasis,
  padStartDays = 1
): { startISO: string; endISOExclusive: string } {
  const pad = basis === 'created' ? 0 : Math.max(0, Math.trunc(Number(padStartDays) || 0))
  const lo = normalizeYmd(startYmd)
  const fetchStart = pad > 0 ? addDaysYmd(lo, -pad) : lo
  return posSalesBusinessDateRangeUtcEnvelope(ctx, fetchStart, endYmd)
}
