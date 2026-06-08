import { resolveOrderDeliveryAppCode } from '@/lib/pos-delivery-order-meta'
import {
  resolvePosDeliveryAppSettlementGross,
  type PosDeliveryAppSettlementOrderRow,
} from '@/lib/pos-delivery-app-settlement-amount'
import {
  parsePaymentOtherBreakdown,
  sumPaymentOtherBreakdown,
} from '@/lib/pos-payment-other-breakdown'

/** Flowaccount·회계 PP30 배달 Card Type 표 행 순서 */
export const DELIVERY_PAYMENT_CHANNEL_DISPLAY_ORDER = [
  'foodpanda',
  'grab',
  'lineman',
  'robinhood',
  'shopee',
  'shopee_pay',
] as const

export type DeliveryPaymentChannelKey = (typeof DELIVERY_PAYMENT_CHANNEL_DISPLAY_ORDER)[number] | 'other' | '_unspecified'

export type DeliveryPaymentChannelOrderRow = PosDeliveryAppSettlementOrderRow & {
  delivery_payment_channel?: string | null
  items_json?: string | null
  payment_other?: number | null
  payment_other_breakdown?: unknown
}

function roundBaht(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100
}

/** POS·결산·매출관리 공통 — 배달 결제 채널 코드 정규화 */
export function normalizeDeliveryPaymentChannelKey(raw: string | null | undefined): DeliveryPaymentChannelKey | 'dine_in' {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
  if (!v) return '_unspecified'
  if (v === 'dine_in') return 'dine_in'
  if (v.includes('foodpanda') || v.includes('food_panda')) return 'foodpanda'
  if (v.includes('robinhood') || v.includes('robin_hood')) return 'robinhood'
  if (v === 'shopee_pay' || v === 'shopeepay') return 'shopee_pay'
  if (v.includes('shopee')) return 'shopee'
  if (v === 'grab') return 'grab'
  if (v === 'lineman' || v === 'line_man') return 'lineman'
  if (v === 'other') return 'other'
  return 'other'
}

function resolveDeliveryChannelForOrder(row: DeliveryPaymentChannelOrderRow): DeliveryPaymentChannelKey | 'dine_in' | null {
  const deliveryAmt = resolvePosDeliveryAppSettlementGross(row)
  if (deliveryAmt <= 0.005) return null

  const channel = String(row.delivery_payment_channel ?? '')
    .trim()
    .toLowerCase()
  const orderType = String(row.order_type ?? '').trim().toLowerCase()
  if (orderType === 'dine_in' || channel === 'dine_in') {
    return 'dine_in'
  }

  const appCode = resolveOrderDeliveryAppCode(row)
  return normalizeDeliveryPaymentChannelKey(appCode || channel)
}

function addBucket(bucket: Record<string, number>, key: string, amount: number) {
  const n = roundBaht(amount)
  if (n <= 0.005) return
  bucket[key] = roundBaht((bucket[key] || 0) + n)
}

/**
 * 완료 주문에서 배달앱 결제(`payment_delivery_app`)를 채널별 GROSS로 집계.
 * POS 결산 autoDeliveryAppBreakdown 과 동일 기준.
 */
export function aggregateDeliveryPaymentChannelSales(
  rows: DeliveryPaymentChannelOrderRow[]
): { channelKey: string; sales: number }[] {
  const bucket: Record<string, number> = {}

  for (const row of rows) {
    const deliveryAmt = resolvePosDeliveryAppSettlementGross(row)
    if (deliveryAmt <= 0.005) continue

    const channel = resolveDeliveryChannelForOrder(row)
    if (!channel || channel === 'dine_in') continue
    addBucket(bucket, channel, deliveryAmt)

    const orderType = String(row.order_type ?? '').trim().toLowerCase()
    const other = Math.max(0, Number(row.payment_other) || 0)
    if (orderType === 'delivery' && other > 0.005) {
      const bo = parsePaymentOtherBreakdown(row.payment_other_breakdown)
      if (bo && Math.abs(sumPaymentOtherBreakdown(bo) - other) <= 0.02) {
        const sp = Number(bo.shopeePay) || 0
        if (sp > 0.005) {
          addBucket(bucket, 'shopee_pay', sp)
          const mainKey = channel === 'shopee_pay' ? 'shopee' : channel
          if (bucket[mainKey] != null && bucket[mainKey] >= sp - 0.02) {
            bucket[mainKey] = roundBaht(Math.max(0, bucket[mainKey] - sp))
            if (bucket[mainKey] <= 0.005) delete bucket[mainKey]
          }
        }
      }
    }
  }

  const orderedKeys = [
    ...DELIVERY_PAYMENT_CHANNEL_DISPLAY_ORDER,
    'other',
    '_unspecified',
  ] as const

  const result: { channelKey: string; sales: number }[] = []
  const seen = new Set<string>()

  for (const k of orderedKeys) {
    const sales = bucket[k]
    if (sales != null && sales > 0.005) {
      result.push({ channelKey: k, sales })
      seen.add(k)
    }
  }
  for (const [k, sales] of Object.entries(bucket)) {
    if (seen.has(k) || sales <= 0.005) continue
    result.push({ channelKey: k, sales })
  }

  return result.sort((a, b) => b.sales - a.sales)
}

export function sumDeliveryPaymentChannelSales(rows: { sales: number }[]): number {
  return roundBaht(rows.reduce((a, r) => a + Number(r.sales ?? 0), 0))
}
