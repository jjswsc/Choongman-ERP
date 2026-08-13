/**
 * 배달앱 확인 탭 — 배달 주문 vs 홀/포장 앱결제(GrabPay 등)를 분리 집계.
 * 홀 현금·카드 매출은 포함하지 않음.
 */
import {
  defaultPlatformSettlementFeePct,
  normalizeDeliveryAppFeePercent,
} from '@/lib/cost-data'
import { resolvePosDeliveryAppSettlementGross } from '@/lib/pos-delivery-app-settlement-amount'
import {
  parseDeliveryAppCodeFromItemsJson,
  resolveOrderDeliveryAppCode,
} from '@/lib/pos-delivery-order-meta'
import {
  normalizeDeliveryPaymentChannelKey,
} from '@/lib/pos-sales-delivery-payment-channel-aggregate'
import { POS_SALES_COMPLETED_STATUSES } from '@/lib/pos-sales-period-aggregate'
import { normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'
import { canonicalSalesStoreRowKey } from '@/lib/pos-sales-store-filter'
import { roundSettlementMoney } from '@/lib/pos-channel-settlement'

export const DELIVERY_APP_RECONCILE_FEE_APPS = ['grab', 'lineman', 'shopee'] as const
export type DeliveryAppReconcileFeeApp = (typeof DELIVERY_APP_RECONCILE_FEE_APPS)[number]

export type DeliveryAppReconcileOrderRow = {
  created_at?: string | null
  store_code?: string | null
  status?: string | null
  order_type?: string | null
  total?: number | null
  payment_delivery_app?: number | null
  payment_cash?: number | null
  payment_card?: number | null
  payment_qr?: number | null
  payment_other?: number | null
  discount_amt?: number | null
  coupon_discount_amt?: number | null
  subtotal?: number | null
  delivery_app_code?: string | null
  delivery_payment_channel?: string | null
  items_json?: string | null
}

export type DeliveryAppReconcileDayRow = {
  date: string
  deliveryCount: number
  deliverySales: number
  inStoreCount: number
  inStoreSales: number
}

export type DeliveryAppReconcileFeeSource = 'policy' | 'default' | 'none'

export type DeliveryAppReconcileRow = {
  storeCode: string
  appCode: string
  deliveryCount: number
  deliverySales: number
  inStoreCount: number
  inStoreSales: number
  appNetSales: number
  feePct: number
  feeSource: DeliveryAppReconcileFeeSource
  suggestedFee: number
  suggestedNet: number
  suggestedPayout: number
  settledFee: number | null
  settledNet: number | null
  days: DeliveryAppReconcileDayRow[]
}

export type DeliveryAppReconcileKpi = {
  appNetSales: number
  deliveryCount: number
  inStoreCount: number
  deliverySales: number
  inStoreSales: number
  suggestedFee: number
  suggestedPayout: number
}

export type DeliveryAppReconcileResult = {
  rows: DeliveryAppReconcileRow[]
  kpi: DeliveryAppReconcileKpi
}

type Bucket = {
  deliveryCount: number
  deliverySales: number
  inStoreCount: number
  inStoreSales: number
  days: Map<string, DeliveryAppReconcileDayRow>
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

function isCompleted(status: string | null | undefined): boolean {
  return (POS_SALES_COMPLETED_STATUSES as readonly string[]).includes(String(status ?? ''))
}

function emptyDay(date: string): DeliveryAppReconcileDayRow {
  return { date, deliveryCount: 0, deliverySales: 0, inStoreCount: 0, inStoreSales: 0 }
}

function emptyBucket(): Bucket {
  return {
    deliveryCount: 0,
    deliverySales: 0,
    inStoreCount: 0,
    inStoreSales: 0,
    days: new Map(),
  }
}

function dayOf(bucket: Bucket, date: string): DeliveryAppReconcileDayRow {
  let d = bucket.days.get(date)
  if (!d) {
    d = emptyDay(date)
    bucket.days.set(date, d)
  }
  return d
}

/** 테스트·폴백: 타임존 없는 YYYY-MM-DD 접두를 영업일로 사용 */
export function reconcileBusinessDateFromCreatedAt(createdAt: string | null | undefined): string {
  const m = String(createdAt || '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

function normalizeAppCode(raw: string): string {
  const k = normalizeDeliveryPaymentChannelKey(raw)
  if (k === 'dine_in') return '_unspecified'
  return k
}

/**
 * 홀·포장에서 배달앱으로 결제한 건의 앱 코드.
 * 배달 주문은 절대 여기로 넣지 않음.
 */
export function resolveInStoreDeliveryAppCode(row: DeliveryAppReconcileOrderRow): string {
  const orderType = normalizePosOrderTypeKey(row.order_type)
  if (orderType !== 'dine_in' && orderType !== 'takeout') return ''
  const amt = resolvePosDeliveryAppSettlementGross(row)
  if (amt <= 0.005) return ''
  const ch = String(row.delivery_payment_channel ?? '').trim().toLowerCase()
  if (ch && ch !== 'dine_in') return normalizeAppCode(ch)
  const code = String(row.delivery_app_code ?? '').trim().toLowerCase()
  if (code) return normalizeAppCode(code)
  const fromItems = parseDeliveryAppCodeFromItemsJson(row.items_json)
  if (fromItems) return normalizeAppCode(fromItems)
  return '_unspecified'
}

function deliverySalesAmount(row: DeliveryAppReconcileOrderRow): number {
  const total = Math.max(0, Number(row.total) || 0)
  if (total > 0.005) return round2(total)
  return resolvePosDeliveryAppSettlementGross(row)
}

function inStoreSalesAmount(row: DeliveryAppReconcileOrderRow): number {
  return resolvePosDeliveryAppSettlementGross(row)
}

export function computeSuggestedDeliveryFee(deliverySales: number, feePct: number): number {
  const gross = roundSettlementMoney(deliverySales)
  const pct = normalizeDeliveryAppFeePercent(feePct)
  if (gross <= 0 || pct <= 0) return 0
  return roundSettlementMoney((gross * pct) / 100)
}

function sortAppCodes(a: string, b: string): number {
  const rank = (c: string) => {
    const i = (DELIVERY_APP_RECONCILE_FEE_APPS as readonly string[]).indexOf(c)
    return i >= 0 ? i : 100
  }
  const ra = rank(a)
  const rb = rank(b)
  if (ra !== rb) return ra - rb
  return a.localeCompare(b)
}

function finalizeRow(
  storeCode: string,
  appCode: string,
  bucket: Bucket,
  fee: { pct: number; source: DeliveryAppReconcileFeeSource }
): DeliveryAppReconcileRow {
  const deliverySales = round2(bucket.deliverySales)
  const inStoreSales = round2(bucket.inStoreSales)
  const suggestedFee = computeSuggestedDeliveryFee(deliverySales, fee.pct)
  const suggestedNet = round2(Math.max(0, deliverySales - suggestedFee))
  const suggestedPayout = round2(suggestedNet + inStoreSales)
  return {
    storeCode,
    appCode,
    deliveryCount: bucket.deliveryCount,
    deliverySales,
    inStoreCount: bucket.inStoreCount,
    inStoreSales,
    appNetSales: round2(deliverySales + inStoreSales),
    feePct: fee.pct,
    feeSource: fee.source,
    suggestedFee,
    suggestedNet,
    suggestedPayout,
    settledFee: null,
    settledNet: null,
    days: [...bucket.days.values()]
      .sort((x, y) => x.date.localeCompare(y.date))
      .map((d) => ({
        date: d.date,
        deliveryCount: d.deliveryCount,
        deliverySales: round2(d.deliverySales),
        inStoreCount: d.inStoreCount,
        inStoreSales: round2(d.inStoreSales),
      })),
  }
}

export function emptyDeliveryAppReconcileKpi(): DeliveryAppReconcileKpi {
  return {
    appNetSales: 0,
    deliveryCount: 0,
    inStoreCount: 0,
    deliverySales: 0,
    inStoreSales: 0,
    suggestedFee: 0,
    suggestedPayout: 0,
  }
}

export function sumDeliveryAppReconcileKpi(rows: DeliveryAppReconcileRow[]): DeliveryAppReconcileKpi {
  const kpi = emptyDeliveryAppReconcileKpi()
  for (const r of rows) {
    kpi.appNetSales = round2(kpi.appNetSales + r.appNetSales)
    kpi.deliveryCount += r.deliveryCount
    kpi.inStoreCount += r.inStoreCount
    kpi.deliverySales = round2(kpi.deliverySales + r.deliverySales)
    kpi.inStoreSales = round2(kpi.inStoreSales + r.inStoreSales)
    kpi.suggestedFee = round2(kpi.suggestedFee + r.suggestedFee)
    kpi.suggestedPayout = round2(kpi.suggestedPayout + r.suggestedPayout)
  }
  return kpi
}

/**
 * 완료 주문만 집계. dine_in/takeout 앱결제는 배달 합계에 넣지 않음.
 */
export function aggregateDeliveryAppReconcileRows(
  rows: DeliveryAppReconcileOrderRow[],
  opts?: {
    businessDateForRow?: (row: DeliveryAppReconcileOrderRow) => string
  }
): DeliveryAppReconcileRow[] {
  const dateOf =
    opts?.businessDateForRow ??
    ((row: DeliveryAppReconcileOrderRow) => reconcileBusinessDateFromCreatedAt(row.created_at))
  const buckets = new Map<string, Bucket>()

  const keyOf = (store: string, app: string) => `${store}\t${app}`

  for (const row of rows) {
    if (!isCompleted(row.status)) continue
    const storeCode = canonicalSalesStoreRowKey(String(row.store_code ?? '').trim() || '(미지정)')
    const orderType = normalizePosOrderTypeKey(row.order_type)
    const date = dateOf(row)
    if (!date) continue

    if (orderType === 'delivery') {
      const appCode = resolveOrderDeliveryAppCode(row) || '_unspecified'
      const amt = deliverySalesAmount(row)
      if (amt <= 0.005) continue
      const k = keyOf(storeCode, appCode)
      const b = buckets.get(k) ?? emptyBucket()
      b.deliveryCount += 1
      b.deliverySales += amt
      const d = dayOf(b, date)
      d.deliveryCount += 1
      d.deliverySales += amt
      buckets.set(k, b)
      continue
    }

    if (orderType === 'dine_in' || orderType === 'takeout') {
      const appCode = resolveInStoreDeliveryAppCode(row)
      if (!appCode) continue
      const amt = inStoreSalesAmount(row)
      if (amt <= 0.005) continue
      const k = keyOf(storeCode, appCode)
      const b = buckets.get(k) ?? emptyBucket()
      b.inStoreCount += 1
      b.inStoreSales += amt
      const d = dayOf(b, date)
      d.inStoreCount += 1
      d.inStoreSales += amt
      buckets.set(k, b)
    }
  }

  const out: DeliveryAppReconcileRow[] = []
  for (const [key, bucket] of buckets) {
    const [storeCode, appCode] = key.split('\t')
    const pct = defaultPlatformSettlementFeePct(appCode)
    out.push(
      finalizeRow(storeCode, appCode, bucket, {
        pct,
        source: (DELIVERY_APP_RECONCILE_FEE_APPS as readonly string[]).includes(appCode)
          ? 'default'
          : 'none',
      })
    )
  }

  out.sort((a, b) => a.storeCode.localeCompare(b.storeCode) || sortAppCodes(a.appCode, b.appCode))
  return out
}

export function applyFeePctToReconcileRows(
  rows: DeliveryAppReconcileRow[],
  lookup: (storeCode: string, appCode: string) => { pct: number; source: DeliveryAppReconcileFeeSource } | null
): DeliveryAppReconcileRow[] {
  return rows.map((row) => {
    const found = lookup(row.storeCode, row.appCode)
    const feeApps = (DELIVERY_APP_RECONCILE_FEE_APPS as readonly string[]).includes(row.appCode)
    const pct = found?.pct ?? (feeApps ? defaultPlatformSettlementFeePct(row.appCode) : 0)
    const source: DeliveryAppReconcileFeeSource = found?.source ?? (feeApps ? 'default' : 'none')
    const suggestedFee = source === 'none' ? 0 : computeSuggestedDeliveryFee(row.deliverySales, pct)
    const suggestedNet = round2(Math.max(0, row.deliverySales - suggestedFee))
    const suggestedPayout = round2(suggestedNet + row.inStoreSales)
    return {
      ...row,
      feePct: source === 'none' ? 0 : pct,
      feeSource: source,
      suggestedFee,
      suggestedNet,
      suggestedPayout,
    }
  })
}

export function applySettledAmountsToReconcileRows(
  rows: DeliveryAppReconcileRow[],
  lookup: (storeCode: string, appCode: string) => { fee: number; net: number } | null
): DeliveryAppReconcileRow[] {
  return rows.map((row) => {
    const found = lookup(row.storeCode, row.appCode)
    if (!found) return row
    return {
      ...row,
      settledFee: round2(found.fee),
      settledNet: round2(found.net),
    }
  })
}

export function buildDeliveryAppReconcileResult(rows: DeliveryAppReconcileRow[]): DeliveryAppReconcileResult {
  return { rows, kpi: sumDeliveryAppReconcileKpi(rows) }
}
