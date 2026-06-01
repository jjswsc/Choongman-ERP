/**
 * 결제·홀 주문서 공통 — 품목별 할인 배분(저장된 lineDiscountAmt 우선)
 */

export type PosReceiptLineDiscountItem = {
  price: number
  qty: number
  lineDiscountAmt?: number
  name?: string
  menuId?: string
  promoId?: string
}

export function coercePosReceiptLineDiscountAmt(row: unknown): number {
  if (!row || typeof row !== 'object') return 0
  const r = row as Record<string, unknown>
  return Math.max(
    0,
    Number(r.lineDiscountAmt ?? r.line_discount_amt ?? 0) || 0
  )
}

export function sumPosReceiptLineDiscountAmt(items: PosReceiptLineDiscountItem[]): number {
  return (items || []).reduce(
    (sum, it) => sum + Math.max(0, Number(it.lineDiscountAmt) || 0),
    0
  )
}

export function allocatePosReceiptDiscountByItem(
  items: PosReceiptLineDiscountItem[],
  totalDiscount: number
): number[] {
  const discount = Math.max(0, Number(totalDiscount) || 0)
  if (!Array.isArray(items) || items.length === 0 || discount <= 0.0001) return []
  const lineTotals = items.map((it) => Math.max(0, (Number(it.price) || 0) * (Number(it.qty) || 0)))
  const gross = lineTotals.reduce((sum, v) => sum + v, 0)
  if (gross <= 0.0001) return items.map(() => 0)

  const out = items.map(() => 0)
  let used = 0
  const to2 = (n: number) => Math.round(n * 100) / 100
  for (let i = 0; i < items.length; i += 1) {
    if (i === items.length - 1) {
      out[i] = to2(Math.max(0, discount - used))
      break
    }
    const share = to2((discount * lineTotals[i]) / gross)
    out[i] = share
    used = to2(used + share)
  }
  return out
}

export function resolvePosReceiptLineDiscountAlloc(
  items: PosReceiptLineDiscountItem[],
  totalDiscount: number
): number[] {
  if (!Array.isArray(items) || items.length === 0) return []
  const total = Math.max(0, Number(totalDiscount) || 0)
  const hasSavedLineDiscount = items.some(
    (it) => Math.max(0, Number(it.lineDiscountAmt) || 0) > 0.0001
  )
  if (hasSavedLineDiscount) {
    return items.map((it) => Math.max(0, Number(it.lineDiscountAmt) || 0))
  }
  if (total <= 0.0001) return items.map(() => 0)
  return allocatePosReceiptDiscountByItem(items, total)
}
