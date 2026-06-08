import { normalizeCreditPaymentChannelKey } from '@/lib/linkpos-tender-classify'
import { normalizeDeliveryPaymentChannelKey } from '@/lib/pos-sales-delivery-payment-channel-aggregate'

export type PosSettlementBreakdownRow = {
  store_code?: string | null
  settle_date?: string | null
  cash_amt?: number | null
  card_amt?: number | null
  card_breakdown?: Record<string, unknown> | null
  qr_amt?: number | null
  qr_breakdown?: Record<string, unknown> | null
  other_amt?: number | null
  other_breakdown?: Record<string, unknown> | null
  delivery_app_amt?: number | null
  delivery_app_breakdown?: Record<string, unknown> | null
}

function roundBaht(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100
}

function sumBreakdownValues(breakdown: Record<string, unknown> | null | undefined): number {
  if (!breakdown || typeof breakdown !== 'object') return 0
  let s = 0
  for (const v of Object.values(breakdown)) {
    s += Math.max(0, Number(v) || 0)
  }
  return roundBaht(s)
}

function addBucket(bucket: Record<string, number>, label: string, amount: number) {
  const n = roundBaht(amount)
  if (n <= 0.005) return
  const key = normalizeCreditPaymentChannelKey(String(label || '').trim() || 'card_other')
  bucket[key] = roundBaht((bucket[key] || 0) + n)
}

function addDeliveryBucket(bucket: Record<string, number>, label: string, amount: number) {
  const n = roundBaht(amount)
  if (n <= 0.005) return
  const key = normalizeDeliveryPaymentChannelKey(String(label || '').trim())
  if (key === 'dine_in') return
  bucket[key] = roundBaht((bucket[key] || 0) + n)
}

function applyBreakdownOrFallback(
  bucket: Record<string, number>,
  breakdown: Record<string, unknown> | null | undefined,
  totalAmt: number,
  fallbackKey: string,
  add: (b: Record<string, number>, label: string, amount: number) => void
) {
  const lineSum = sumBreakdownValues(breakdown)
  if (breakdown && typeof breakdown === 'object' && lineSum > 0.005) {
    for (const [label, raw] of Object.entries(breakdown)) {
      add(bucket, label, Number(raw) || 0)
    }
    const total = Math.max(0, Number(totalAmt) || 0)
    if (total > lineSum + 0.02) add(bucket, fallbackKey, total - lineSum)
    return
  }
  const total = Math.max(0, Number(totalAmt) || 0)
  if (total > 0.005) add(bucket, fallbackKey, total)
}

/** POS 결산 저장값 — 카드·QR·기타·현금 (Credit Card 표) */
export function aggregateCreditFromSettlements(rows: PosSettlementBreakdownRow[]): Record<string, number> {
  const bucket: Record<string, number> = {}
  for (const row of rows) {
    applyBreakdownOrFallback(
      bucket,
      row.card_breakdown as Record<string, unknown> | null,
      Number(row.card_amt) || 0,
      'card_other',
      addBucket
    )
    applyBreakdownOrFallback(
      bucket,
      row.qr_breakdown as Record<string, unknown> | null,
      Number(row.qr_amt) || 0,
      'promptpay',
      addBucket
    )
    applyBreakdownOrFallback(
      bucket,
      row.other_breakdown as Record<string, unknown> | null,
      Number(row.other_amt) || 0,
      'card_other',
      addBucket
    )
    const cash = Math.max(0, Number(row.cash_amt) || 0)
    if (cash > 0.005) addBucket(bucket, 'cash', cash)
  }
  return bucket
}

/** POS 결산 저장값 — 배달 플랫폼 (Delivery 표). dine_in 하위는 제외 */
export function aggregateDeliveryFromSettlements(rows: PosSettlementBreakdownRow[]): Record<string, number> {
  const bucket: Record<string, number> = {}
  for (const row of rows) {
    applyBreakdownOrFallback(
      bucket,
      row.delivery_app_breakdown as Record<string, unknown> | null,
      Number(row.delivery_app_amt) || 0,
      'other',
      addDeliveryBucket
    )
  }
  return bucket
}

export function settlementCreditBreakdownTotal(rows: PosSettlementBreakdownRow[]): number {
  return roundBaht(
    rows.reduce(
      (a, r) =>
        a +
        sumBreakdownValues(r.card_breakdown as Record<string, unknown> | null) +
        sumBreakdownValues(r.qr_breakdown as Record<string, unknown> | null) +
        sumBreakdownValues(r.other_breakdown as Record<string, unknown> | null) +
        Math.max(0, Number(r.cash_amt) || 0) +
        (sumBreakdownValues(r.card_breakdown as Record<string, unknown> | null) <= 0.005
          ? Math.max(0, Number(r.card_amt) || 0)
          : 0) +
        (sumBreakdownValues(r.qr_breakdown as Record<string, unknown> | null) <= 0.005
          ? Math.max(0, Number(r.qr_amt) || 0)
          : 0) +
        (sumBreakdownValues(r.other_breakdown as Record<string, unknown> | null) <= 0.005
          ? Math.max(0, Number(r.other_amt) || 0)
          : 0),
      0
    )
  )
}

export function settlementDeliveryBreakdownTotal(rows: PosSettlementBreakdownRow[]): number {
  return roundBaht(
    rows.reduce((a, r) => {
      const lines = sumBreakdownValues(r.delivery_app_breakdown as Record<string, unknown> | null)
      const amt = Math.max(0, Number(r.delivery_app_amt) || 0)
      return a + (lines > 0.005 ? lines : amt)
    }, 0)
  )
}

/** 매장별 결산에 카드·QR 등 세부 breakdown 이 저장됐는지 */
export function storesWithSettlementCreditBreakdown(rows: PosSettlementBreakdownRow[]): Set<string> {
  const out = new Set<string>()
  for (const row of rows) {
    const store = String(row.store_code ?? '').trim().toLowerCase()
    if (!store) continue
    const hasLines =
      sumBreakdownValues(row.card_breakdown as Record<string, unknown> | null) > 0.005 ||
      sumBreakdownValues(row.qr_breakdown as Record<string, unknown> | null) > 0.005 ||
      sumBreakdownValues(row.other_breakdown as Record<string, unknown> | null) > 0.005 ||
      Math.max(0, Number(row.cash_amt) || 0) > 0.005 ||
      Math.max(0, Number(row.card_amt) || 0) > 0.005 ||
      Math.max(0, Number(row.qr_amt) || 0) > 0.005 ||
      Math.max(0, Number(row.other_amt) || 0) > 0.005
    if (hasLines) out.add(store)
  }
  return out
}

export function storesWithSettlementDeliveryBreakdown(rows: PosSettlementBreakdownRow[]): Set<string> {
  const out = new Set<string>()
  for (const row of rows) {
    const store = String(row.store_code ?? '').trim().toLowerCase()
    if (!store) continue
    const lines = sumBreakdownValues(row.delivery_app_breakdown as Record<string, unknown> | null)
    const amt = Math.max(0, Number(row.delivery_app_amt) || 0)
    if (lines > 0.005 || amt > 0.005) out.add(store)
  }
  return out
}

export function bucketToChannelRows(
  bucket: Record<string, number>
): { channelKey: string; sales: number }[] {
  return Object.entries(bucket)
    .filter(([, v]) => v > 0.005)
    .map(([channelKey, sales]) => ({ channelKey, sales: roundBaht(sales) }))
    .sort((a, b) => b.sales - a.sales)
}
