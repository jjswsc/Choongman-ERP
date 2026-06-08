import {
  CREDIT_PAYMENT_CHANNEL_DISPLAY_ORDER,
  normalizeCreditPaymentChannelKey,
} from '@/lib/linkpos-tender-classify'
import {
  parsePaymentOtherBreakdown,
  sumPaymentOtherBreakdown,
} from '@/lib/pos-payment-other-breakdown'

export type CreditPaymentOrderRow = {
  payment_cash?: number | null
  payment_card?: number | null
  payment_qr?: number | null
  payment_other?: number | null
  payment_other_breakdown?: unknown
  payment_delivery_app?: number | null
}

function roundBaht(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100
}

function addBucket(bucket: Record<string, number>, key: string, amount: number) {
  const n = roundBaht(amount)
  if (n <= 0.005) return
  const nk = normalizeCreditPaymentChannelKey(key)
  bucket[nk] = roundBaht((bucket[nk] || 0) + n)
}

/** 카드·QR·기타(배달앱 제외) — LINKPOS 미연동 주문 fallback */
export function aggregateCreditPaymentChannelFromOrders(rows: CreditPaymentOrderRow[]): Record<string, number> {
  const bucket: Record<string, number> = {}

  for (const row of rows) {
    const cash = Math.max(0, Number(row.payment_cash) || 0)
    const card = Math.max(0, Number(row.payment_card) || 0)
    const qr = Math.max(0, Number(row.payment_qr) || 0)
    const other = Math.max(0, Number(row.payment_other) || 0)

    if (cash > 0.005) addBucket(bucket, 'cash', cash)
    if (card > 0.005) addBucket(bucket, 'card_other', card)
    if (qr > 0.005) addBucket(bucket, 'promptpay', qr)

    if (other > 0.005) {
      const bo = parsePaymentOtherBreakdown(row.payment_other_breakdown)
      if (bo && Math.abs(sumPaymentOtherBreakdown(bo) - other) <= 0.02) {
        addBucket(bucket, 'true_money_wallet', Number(bo.trueMoney) || 0)
        addBucket(bucket, 'wechat', Number(bo.weChat) || 0)
        addBucket(bucket, 'alipay', Number(bo.alipay) || 0)
        addBucket(bucket, 'unionpay', Number(bo.unionPay) || 0)
        addBucket(bucket, 'line_pay', Number(bo.linePay) || 0)
        addBucket(bucket, 'shopee_pay', Number(bo.shopeePay) || 0)
        addBucket(bucket, 'card_other', Number(bo.misc) || 0)
        if (bo.admin && typeof bo.admin === 'object') {
          for (const [, rawAmt] of Object.entries(bo.admin)) {
            addBucket(bucket, 'card_other', Number(rawAmt) || 0)
          }
        }
      } else {
        addBucket(bucket, 'card_other', other)
      }
    }
  }

  return bucket
}

export function mergeCreditPaymentBuckets(
  base: Record<string, number>,
  extra: Record<string, number>
): Record<string, number> {
  const out = { ...base }
  for (const [k, v] of Object.entries(extra)) {
    addBucket(out, k, v)
  }
  return out
}

export function creditPaymentBucketToRows(
  bucket: Record<string, number>
): { channelKey: string; sales: number }[] {
  const result: { channelKey: string; sales: number }[] = []
  const seen = new Set<string>()

  for (const k of CREDIT_PAYMENT_CHANNEL_DISPLAY_ORDER) {
    const sales = bucket[k]
    if (sales != null && sales > 0.005) {
      result.push({ channelKey: k, sales: roundBaht(sales) })
      seen.add(k)
    }
  }
  for (const [k, sales] of Object.entries(bucket)) {
    if (seen.has(k) || sales <= 0.005) continue
    result.push({ channelKey: k, sales: roundBaht(sales) })
  }

  return result.sort((a, b) => b.sales - a.sales)
}

export function sumCreditPaymentChannelSales(rows: { sales: number }[]): number {
  return roundBaht(rows.reduce((a, r) => a + Number(r.sales ?? 0), 0))
}
