/**
 * pos_orders 행 → 기간(월/주/일/요일/시간) 버킷 집계. posSalesByPeriod와 splitByStore에서 공용.
 */
import {
  toDateStrBangkok,
  getDayOfWeekBangkok,
  getBangkokHour,
} from '@/lib/attendance-utils'
import {
  getPosBusinessDateStrFromConfig,
  POS_BUSINESS_DAY_DEFAULT_HOURS,
  type PosBusinessHoursConfig,
} from '@/lib/pos-business-day'
import {
  normalizePosOrderTypeKey,
  rowMatchesOrderFilter,
  type PosOrderTypeValue,
} from '@/lib/pos-sales-order-type-filter'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']

export type PeriodOrderRow = {
  created_at?: string
  total?: number
  subtotal?: number
  vat?: number
  discount_amt?: number
  coupon_discount_amt?: number
  service_amt?: number
  guest_count?: number
  status?: string
  order_type?: string
  store_code?: string
}

type Bucket = {
  count: number
  subtotal: number
  vat: number
  discount: number
  service: number
  total: number
  guestSum: number
  dineInOrderCount: number
  dineInTotal: number
  dineInGuestSum: number
}

export type PeriodAggRow = {
  label: string
  key: string
  sales: number
  count: number
  subtotal: number
  vat: number
  discount: number
  service: number
  total: number
  guestSum: number
  dineInOrderCount: number
  dineInTotal: number
  dineInGuestSum: number
  salesPerDineInOrder: number
  salesPerGuest: number
  salesPerOrder: number
}

function getStartOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = x.getUTCDay()
  x.setUTCDate(x.getUTCDate() - day)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function toRow(k: string, v: Bucket): PeriodAggRow {
  return {
    label: k,
    key: k,
    sales: v.total,
    count: v.count,
    subtotal: v.subtotal,
    vat: v.vat,
    discount: v.discount,
    service: v.service,
    total: v.total,
    guestSum: v.guestSum,
    dineInOrderCount: v.dineInOrderCount,
    dineInTotal: v.dineInTotal,
    dineInGuestSum: v.dineInGuestSum,
    salesPerDineInOrder:
      v.dineInOrderCount > 0 ? Math.round((v.dineInTotal / v.dineInOrderCount) * 100) / 100 : 0,
    salesPerGuest:
      v.dineInGuestSum > 0 ? Math.round((v.dineInTotal / v.dineInGuestSum) * 100) / 100 : 0,
    salesPerOrder: v.count > 0 ? Math.round((v.total / v.count) * 100) / 100 : 0,
  }
}

const emptyBucket = (): Bucket => ({
  count: 0,
  subtotal: 0,
  vat: 0,
  discount: 0,
  service: 0,
  total: 0,
  guestSum: 0,
  dineInOrderCount: 0,
  dineInTotal: 0,
  dineInGuestSum: 0,
})

/**
 * @param orderTypesAllowed - parseOrderTypesParam 결과(null = 전체)
 */
export function aggregatePosSalesByPeriod(
  rows: PeriodOrderRow[],
  groupBy: string,
  orderTypesAllowed: PosOrderTypeValue[] | null,
  businessDayStart?: PosBusinessHoursConfig,
  /** 제공 시 매장별 영업 시간(행의 store_code 기준), 없으면 `businessDayStart` 단일값 */
  resolveBusinessDayStart?: (storeCode: string) => PosBusinessHoursConfig
): PeriodAggRow[] {
  const defaultHours = businessDayStart ?? POS_BUSINESS_DAY_DEFAULT_HOURS
  const getHours = (sc: string) => (resolveBusinessDayStart ? resolveBusinessDayStart(sc) : defaultHours)
  const byKey: Record<string, Bucket> = {}

  const add = (key: string, r: PeriodOrderRow) => {
    const b = (byKey[key] ??= emptyBucket())
    b.count += 1
    b.subtotal += Number(r.subtotal) || 0
    b.vat += Number(r.vat) || 0
    b.discount += (Number(r.discount_amt) || 0) + (Number(r.coupon_discount_amt) || 0)
    b.service += Number(r.service_amt) || 0
    b.total += Number(r.total) || 0
    const gc = Math.max(0, Math.trunc(Number(r.guest_count) || 0))
    b.guestSum += gc
    {
      const k = normalizePosOrderTypeKey(r.order_type)
      if (k === 'dine_in' || k === '') {
        b.dineInOrderCount += 1
        b.dineInTotal += Number(r.total) || 0
        b.dineInGuestSum += gc
      }
    }
  }

  for (const r of rows) {
    if (!rowMatchesOrderFilter(r.order_type, orderTypesAllowed)) continue
    if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
    const dt = r.created_at
    if (!dt) continue

    const bkkDate = toDateStrBangkok(dt)
    if (!bkkDate) continue
    /** 월·연만 POS 영업일 라벨(자정 넘김 매장). 일·요일은 조회 기간과 맞추기 위해 방콕 달력일 사용 */
    const bizYmd = getPosBusinessDateStrFromConfig(new Date(dt), getHours(String(r.store_code ?? '').trim()))

    if (groupBy === 'month') {
      add(bizYmd.slice(0, 7), r)
    } else if (groupBy === 'year') {
      add(bizYmd.slice(0, 4), r)
    } else if (groupBy === 'week') {
      const start = getStartOfWeek(new Date(dt))
      const end = new Date(start)
      end.setUTCDate(end.getUTCDate() + 6)
      const k = `${start.toISOString().slice(0, 10)}~${end.toISOString().slice(0, 10)}`
      add(k, r)
    } else if (groupBy === 'dow') {
      const dow = getDayOfWeekBangkok(bkkDate)
      add(String(dow), r)
    } else if (groupBy === 'hour') {
      const h = getBangkokHour(dt)
      const hk = String(Math.min(23, Math.max(0, h))).padStart(2, '0')
      add(hk, r)
    } else {
      add(bkkDate, r)
    }
  }

  if (groupBy === 'month') {
    return Object.entries(byKey)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => toRow(k, v))
  }
  if (groupBy === 'year') {
    return Object.entries(byKey)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => toRow(k, v))
  }
  if (groupBy === 'week') {
    return Object.entries(byKey)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => toRow(k, v))
  }
  if (groupBy === 'dow') {
    return [0, 1, 2, 3, 4, 5, 6].map((dow) =>
      toRow(String(dow), byKey[String(dow)] ?? emptyBucket())
    )
  }
  if (groupBy === 'hour') {
    const empty = emptyBucket()
    return Array.from({ length: 24 }, (_, h) => {
      const hk = String(h).padStart(2, '0')
      return toRow(hk, byKey[hk] ?? { ...empty })
    })
  }
  return Object.entries(byKey)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => toRow(k, v))
}

/** 매장별 시리즈를 동일 축(key 순서는 기준 매장 행 순서)으로 합산 */
export function mergePeriodSeriesToAggregated(
  series: Record<string, PeriodAggRow[]>,
  storeOrder?: string[]
): PeriodAggRow[] {
  const orderedCodes =
    storeOrder?.filter((c) => (series[c]?.length ?? 0) > 0) ?? Object.keys(series).sort()
  if (orderedCodes.length === 0) return []
  const storeCodes = orderedCodes
  const baseRows = series[storeCodes[0]]
  if (!baseRows?.length) return []

  const sumForKey = (key: string): PeriodAggRow => {
    const merged: PeriodAggRow = {
      key,
      label: key,
      sales: 0,
      count: 0,
      subtotal: 0,
      vat: 0,
      discount: 0,
      service: 0,
      total: 0,
      guestSum: 0,
      dineInOrderCount: 0,
      dineInTotal: 0,
      dineInGuestSum: 0,
      salesPerDineInOrder: 0,
      salesPerGuest: 0,
      salesPerOrder: 0,
    }
    for (const sc of storeCodes) {
      const row = series[sc]?.find((r) => r.key === key)
      if (!row) continue
      merged.count += row.count
      merged.subtotal += row.subtotal
      merged.vat += row.vat
      merged.discount += row.discount
      merged.service += row.service
      merged.total += row.total
      merged.guestSum += row.guestSum
      merged.dineInOrderCount += row.dineInOrderCount
      merged.dineInTotal += row.dineInTotal
      merged.dineInGuestSum += row.dineInGuestSum
    }
    merged.sales = merged.total
    merged.salesPerDineInOrder =
      merged.dineInOrderCount > 0
        ? Math.round((merged.dineInTotal / merged.dineInOrderCount) * 100) / 100
        : 0
    merged.salesPerGuest =
      merged.dineInGuestSum > 0
        ? Math.round((merged.dineInTotal / merged.dineInGuestSum) * 100) / 100
        : 0
    merged.salesPerOrder =
      merged.count > 0 ? Math.round((merged.total / merged.count) * 100) / 100 : 0
    return merged
  }

  return baseRows.map((r) => sumForKey(r.key))
}
