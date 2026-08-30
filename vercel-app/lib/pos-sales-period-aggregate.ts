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
  payment_crypto?: number
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
  cryptoSales: number
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
  cryptoSales?: number
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
    cryptoSales: v.cryptoSales,
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
  cryptoSales: 0,
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
    b.cryptoSales += Number(r.payment_crypto) || 0
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

function emptyPeriodAggRow(key: string): PeriodAggRow {
  return {
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
    cryptoSales: 0,
  }
}

function addPeriodAggRow(into: PeriodAggRow, row: PeriodAggRow): void {
  into.count += row.count
  into.subtotal += row.subtotal
  into.vat += row.vat
  into.discount += row.discount
  into.service += row.service
  into.total += row.total
  into.guestSum += row.guestSum
  into.dineInOrderCount += row.dineInOrderCount
  into.dineInTotal += row.dineInTotal
  into.dineInGuestSum += row.dineInGuestSum
  into.cashSales += row.cashSales
  into.creditSales += row.creditSales
  into.qrSales += row.qrSales
  into.otherSales += row.otherSales
  into.deliveryAppSales += row.deliveryAppSales
  into.cryptoSales = (into.cryptoSales || 0) + (row.cryptoSales || 0)
}

function finalizePeriodAggRow(row: PeriodAggRow): PeriodAggRow {
  row.sales = row.total
  row.salesPerDineInOrder =
    row.dineInOrderCount > 0
      ? Math.round((row.dineInTotal / row.dineInOrderCount) * 100) / 100
      : 0
  row.salesPerGuest =
    row.dineInGuestSum > 0 ? Math.round((row.dineInTotal / row.dineInGuestSum) * 100) / 100 : 0
  row.salesPerOrder = row.count > 0 ? Math.round((row.total / row.count) * 100) / 100 : 0
  return row
}

/** RPC 일별 버킷만 골라 요일 필터 (key = YYYY-MM-DD) */
export function filterPeriodDayRowsByDow(
  dayRows: PeriodAggRow[],
  allowed: PosSalesDowValue[] | null
): PeriodAggRow[] {
  if (allowed == null) return dayRows
  return dayRows.filter((r) => {
    const ymd = String(r.key || '').trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false
    return rowMatchesDowFilter(ymd, allowed, getDayOfWeekBangkok)
  })
}

/**
 * 일별 PeriodAggRow → 요청 groupBy로 재합산.
 * 요일 필터 시 RPC(day) 결과를 쓰며 주문 풀스캔을 피한다 (hour는 호출하지 말 것).
 */
export function rollupPeriodDayRows(
  dayRows: PeriodAggRow[],
  groupBy: string,
  daysOfWeekAllowed?: PosSalesDowValue[] | null
): PeriodAggRow[] {
  const filtered = filterPeriodDayRowsByDow(dayRows, daysOfWeekAllowed ?? null)
  const g = String(groupBy || 'day').toLowerCase()
  if (g === 'day') {
    return [...filtered].sort((a, b) => a.key.localeCompare(b.key))
  }
  if (g === 'hour') {
    return filtered
  }

  const byKey: Record<string, PeriodAggRow> = {}
  const addTo = (key: string, row: PeriodAggRow) => {
    const b = (byKey[key] ??= emptyPeriodAggRow(key))
    addPeriodAggRow(b, row)
  }

  for (const r of filtered) {
    const ymd = String(r.key || '').trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue
    if (g === 'month') addTo(ymd.slice(0, 7), r)
    else if (g === 'year') addTo(ymd.slice(0, 4), r)
    else if (g === 'week') {
      const mon = getMondayOfWeekBangkok(ymd)
      const sun = addDayBangkok(mon, 6)
      addTo(`${mon}~${sun}`, r)
    } else if (g === 'dow') addTo(String(getDayOfWeekBangkok(ymd)), r)
    else addTo(ymd, r)
  }

  if (g === 'dow') {
    const dowAxis =
      daysOfWeekAllowed != null && daysOfWeekAllowed.length > 0
        ? daysOfWeekAllowed
        : ([0, 1, 2, 3, 4, 5, 6] as const)
    return dowAxis.map((dow) => finalizePeriodAggRow(byKey[String(dow)] ?? emptyPeriodAggRow(String(dow))))
  }

  return Object.keys(byKey)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => finalizePeriodAggRow(byKey[k]!))
}

/** split 시리즈(일별)에 요일 필터 + groupBy rollup */
export function rollupPeriodDaySeries(
  daySeries: Record<string, PeriodAggRow[]>,
  groupBy: string,
  daysOfWeekAllowed?: PosSalesDowValue[] | null
): Record<string, PeriodAggRow[]> {
  const out: Record<string, PeriodAggRow[]> = {}
  for (const [store, rows] of Object.entries(daySeries)) {
    out[store] = rollupPeriodDayRows(rows, groupBy, daysOfWeekAllowed)
  }
  return out
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

  // 요일 필터 등으로 매장별 잔여 일자가 달라도, 전 매장 키를 합집합으로 합산
  const keyOrder: string[] = []
  const seenKeys = new Set<string>()
  const labelByKey = new Map<string, string>()
  for (const sc of storeCodes) {
    for (const row of series[sc] || []) {
      const k = String(row.key || '')
      if (!k || seenKeys.has(k)) continue
      seenKeys.add(k)
      keyOrder.push(k)
      labelByKey.set(k, String(row.label || k))
    }
  }
  if (keyOrder.length === 0) return []

  const sumForKey = (key: string): PeriodAggRow => {
    const merged: PeriodAggRow = {
      key,
      label: labelByKey.get(key) || key,
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
      cryptoSales: 0,
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
      merged.cryptoSales = (merged.cryptoSales || 0) + (row.cryptoSales || 0)
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

  return keyOrder.map((k) => sumForKey(k))
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
