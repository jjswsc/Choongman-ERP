/**
 * pos_orders 행 → 기간(월/주/일/요일/시간) 버킷 집계. posSalesByPeriod와 splitByStore에서 공용.
 * 일·주·요일·월·연은 매장별 POS 영업일 라벨(`getPosBusinessDateStrFromConfig`) 기준. 시간대만 방콕 벽시계 시각.
 */
import {
  getDayOfWeekBangkok,
  getBangkokHour,
  getMondayOfWeekBangkok,
  addDayBangkok,
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
import {
  rowMatchesDowFilter,
  type PosSalesDowValue,
} from '@/lib/pos-sales-dow-filter'
import { resolvePosSalesDiscountAmount } from '@/lib/pos-coupon-domain'
import {
  canonicalSalesStoreRowKey,
  rowMatchesSalesStoreSelection,
} from '@/lib/pos-sales-store-filter'

export const POS_SALES_COMPLETED_STATUSES = ['completed', 'paid', 'ready'] as const

const COMPLETED_STATUSES: readonly string[] = POS_SALES_COMPLETED_STATUSES

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
  payment_cash?: number
  payment_card?: number
  payment_qr?: number
  payment_other?: number
  payment_delivery_app?: number
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
  cashSales: number
  creditSales: number
  qrSales: number
  otherSales: number
  deliveryAppSales: number
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
  cashSales: number
  creditSales: number
  qrSales: number
  otherSales: number
  deliveryAppSales: number
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
    cashSales: v.cashSales,
    creditSales: v.creditSales,
    qrSales: v.qrSales,
    otherSales: v.otherSales,
    deliveryAppSales: v.deliveryAppSales,
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
  cashSales: 0,
  creditSales: 0,
  qrSales: 0,
  otherSales: 0,
  deliveryAppSales: 0,
})

/** posSalesByStore·기간 집계 공통 — 완료 건·주문유형 필터 */
export function filterCompletedPosSalesRows(
  rows: PeriodOrderRow[],
  orderTypesAllowed: PosOrderTypeValue[] | null
): PeriodOrderRow[] {
  return rows.filter(
    (r) =>
      rowMatchesOrderFilter(r.order_type, orderTypesAllowed) &&
      COMPLETED_STATUSES.includes(String(r.status ?? ''))
  )
}

/**
 * posSalesByStore 와 동일: DB store_code → canonical 매장별 행 묶음.
 */
export function groupPosSalesRowsByCanonicalStore(
  rows: PeriodOrderRow[],
  orderTypesAllowed: PosOrderTypeValue[] | null
): Map<string, PeriodOrderRow[]> {
  const map = new Map<string, PeriodOrderRow[]>()
  for (const r of filterCompletedPosSalesRows(rows, orderTypesAllowed)) {
    const key = canonicalSalesStoreRowKey(String(r.store_code ?? '').trim() || '(미지정)')
    const list = map.get(key)
    if (list) list.push(r)
    else map.set(key, [r])
  }
  return map
}

/**
 * @param orderTypesAllowed - parseOrderTypesParam 결과(null = 전체)
 * @param daysOfWeekAllowed - parseDowsParam 결과(null = 전체). 영업일 요일 기준.
 */
export function aggregatePosSalesByPeriod(
  rows: PeriodOrderRow[],
  groupBy: string,
  orderTypesAllowed: PosOrderTypeValue[] | null,
  businessDayStart?: PosBusinessHoursConfig,
  /** 제공 시 매장별 영업 시간(행의 store_code 기준), 없으면 `businessDayStart` 단일값 */
  resolveBusinessDayStart?: (storeCode: string) => PosBusinessHoursConfig,
  daysOfWeekAllowed?: PosSalesDowValue[] | null
): PeriodAggRow[] {
  const defaultHours = businessDayStart ?? POS_BUSINESS_DAY_DEFAULT_HOURS
  const getHours = (sc: string) => (resolveBusinessDayStart ? resolveBusinessDayStart(sc) : defaultHours)
  const dowFilter = daysOfWeekAllowed ?? null
  const byKey: Record<string, Bucket> = {}

  const add = (key: string, r: PeriodOrderRow) => {
    const b = (byKey[key] ??= emptyBucket())
    b.count += 1
    b.subtotal += Number(r.subtotal) || 0
    b.vat += Number(r.vat) || 0
    b.discount += resolvePosSalesDiscountAmount(Number(r.discount_amt) || 0, Number(r.coupon_discount_amt) || 0)
    b.service += Number(r.service_amt) || 0
    b.total += Number(r.total) || 0
    b.cashSales += Number(r.payment_cash) || 0
    b.creditSales += Number(r.payment_card) || 0
    b.qrSales += Number(r.payment_qr) || 0
    b.otherSales += Number(r.payment_other) || 0
    b.deliveryAppSales += Number(r.payment_delivery_app) || 0
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

    /** 일·주·요일·월·연: 모두 POS 영업일 라벨(매장별 영업시간) 기준 */
    const bizYmd = getPosBusinessDateStrFromConfig(new Date(dt), getHours(String(r.store_code ?? '').trim()))
    if (!rowMatchesDowFilter(bizYmd, dowFilter, getDayOfWeekBangkok)) continue

    if (groupBy === 'month') {
      add(bizYmd.slice(0, 7), r)
    } else if (groupBy === 'year') {
      add(bizYmd.slice(0, 4), r)
    } else if (groupBy === 'week') {
      const mon = getMondayOfWeekBangkok(bizYmd)
      const sun = addDayBangkok(mon, 6)
      const k = `${mon}~${sun}`
      add(k, r)
    } else if (groupBy === 'dow') {
      const dow = getDayOfWeekBangkok(bizYmd)
      add(String(dow), r)
    } else if (groupBy === 'hour') {
      const h = getBangkokHour(dt)
      const hk = String(Math.min(23, Math.max(0, h))).padStart(2, '0')
      add(hk, r)
    } else {
      add(bizYmd, r)
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
    const dowAxis =
      dowFilter != null && dowFilter.length > 0 ? dowFilter : ([0, 1, 2, 3, 4, 5, 6] as const)
    return dowAxis.map((dow) => toRow(String(dow), byKey[String(dow)] ?? emptyBucket()))
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
      cashSales: 0,
      creditSales: 0,
      qrSales: 0,
      otherSales: 0,
      deliveryAppSales: 0,
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
      merged.cashSales += row.cashSales
      merged.creditSales += row.creditSales
      merged.qrSales += row.qrSales
      merged.otherSales += row.otherSales
      merged.deliveryAppSales += row.deliveryAppSales
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

/** split 시리즈 객체에서 UI 매장 코드에 해당하는 키 (canonical·별칭 매칭) */
export function resolvePeriodSeriesStoreKey(
  series: Record<string, PeriodAggRow[]>,
  storeCode: string
): string | undefined {
  const code = String(storeCode || '').trim()
  if (!code) return undefined
  const canon = canonicalSalesStoreRowKey(code)
  if (series[canon]?.length) return canon
  return Object.keys(series).find((k) => rowMatchesSalesStoreSelection(k, code))
}

/**
 * split 시리즈 → 화면용 기간 행.
 * 매장 선택 시: 선택 매장(표기 차이 포함)에 해당하는 시리즈만 합산 — posSalesByStore 와 동일 범위.
 */
export function periodRowsForStoreSelection(
  series: Record<string, PeriodAggRow[]>,
  storeCodes?: string[]
): PeriodAggRow[] {
  if (!storeCodes?.length) {
    return mergePeriodSeriesToAggregated(series)
  }
  if (storeCodes.length === 1) {
    const hit = resolvePeriodSeriesStoreKey(series, storeCodes[0]!)
    return hit && series[hit]?.length ? series[hit]! : []
  }
  const matchingKeys = Object.keys(series).filter((k) =>
    storeCodes.some((code) => rowMatchesSalesStoreSelection(k, code))
  )
  if (matchingKeys.length === 0) return []
  if (matchingKeys.length === 1) return series[matchingKeys[0]!]!
  const sub: Record<string, PeriodAggRow[]> = {}
  for (const k of matchingKeys) sub[k] = series[k]!
  return mergePeriodSeriesToAggregated(sub, matchingKeys)
}

type BuildSplitSeriesParams = {
  rows: PeriodOrderRow[]
  stores: string[]
  groupBy: string
  orderTypesAllowed: PosOrderTypeValue[] | null
  resolveBusinessDayStart: (storeCode: string) => PosBusinessHoursConfig
  daysOfWeekAllowed?: PosSalesDowValue[] | null
}

/** splitByStore 응답 — 매장 키는 canonicalSalesStoreRowKey (posSalesByStore 와 동일) */
export function buildPosSalesSplitSeriesByStore(params: BuildSplitSeriesParams): Record<string, PeriodAggRow[]> {
  const { rows, stores, groupBy, orderTypesAllowed, resolveBusinessDayStart, daysOfWeekAllowed } = params
  const series: Record<string, PeriodAggRow[]> = {}
  const grouped = groupPosSalesRowsByCanonicalStore(rows, orderTypesAllowed)

  for (const [storeKey, subset] of grouped) {
    if (
      stores.length >= 1 &&
      !stores.some((code) => rowMatchesSalesStoreSelection(storeKey, code))
    ) {
      continue
    }
    series[storeKey] = aggregatePosSalesByPeriod(
      subset,
      groupBy,
      orderTypesAllowed,
      undefined,
      resolveBusinessDayStart,
      daysOfWeekAllowed ?? null
    )
  }
  return series
}
