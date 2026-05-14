/**
 * 매출 관리(posSales*) 조회: UI의 startStr~endStr 은 POS 영업일 라벨(YYYY-MM-DD)로 해석하고,
 * getPosTodaySales / getPosOrders(posBizDayScope) 와 동일한 영업일 구간으로 맞춘다.
 */
import { iterBangkokYmdInclusive } from '@/lib/attendance-utils'
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import {
  type PosBusinessDaySettingsContext,
  posBusinessDayUtcEnvelopeBangkokYmd,
  resolvePosBusinessHoursFromContext,
} from '@/lib/pos-business-day-server'

function normalizeYmd(s: string): string {
  return s.trim().slice(0, 10)
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
