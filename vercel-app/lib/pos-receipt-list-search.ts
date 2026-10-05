import { resolvePosOrderDisplayTotal } from '@/lib/pos-order-coupon-fields'

/** 영수증 목록 검색 — 화면 합계·결제액과 같은 금액인지 볼 때 쓰는 필드 */
export type PosReceiptAmountSearchOrder = {
  total?: number | null
  discountAmt?: number | null
  couponDiscountAmt?: number | null
  paymentCash?: number | null
  paymentCashTendered?: number | null
  paymentCard?: number | null
  paymentQr?: number | null
  paymentOther?: number | null
  paymentDeliveryApp?: number | null
  paymentCrypto?: number | null
  linkposRequestedAmount?: number | null
  linkposApprovedAmount?: number | null
}

/**
 * 검색칸에 금액만 넣은 경우. `350`, `1,234.50`, `฿199`, `199 บาท`.
 * 주문번호·메뉴가 섞이면 null — 그때는 글자 검색만 한다.
 */
export function parsePosReceiptAmountQuery(raw: string): number | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/฿/g, '')
    .replace(/บาท/g, '')
    .replace(/baht/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

function satang(n: number): number {
  return Math.round(n * 100)
}

function pushNonZero(out: number[], value: number | null | undefined) {
  const n = Number(value)
  if (!Number.isFinite(n) || Math.abs(n) <= 0.004) return
  out.push(n)
}

/** 목록 합계(쿠폰 반영) 또는 결제수단 금액이 검색 숫자와 같으면 true. 0원 결제칸은 제외. */
export function posReceiptOrderMatchesAmountQuery(
  order: PosReceiptAmountSearchOrder,
  rawQuery: string
): boolean {
  const query = parsePosReceiptAmountQuery(rawQuery)
  if (query == null) return false
  const amounts: number[] = [resolvePosOrderDisplayTotal(order)]
  const stored = Number(order.total)
  if (Number.isFinite(stored)) amounts.push(stored)
  pushNonZero(amounts, order.paymentCash)
  pushNonZero(amounts, order.paymentCashTendered)
  pushNonZero(amounts, order.paymentCard)
  pushNonZero(amounts, order.paymentQr)
  pushNonZero(amounts, order.paymentOther)
  pushNonZero(amounts, order.paymentDeliveryApp)
  pushNonZero(amounts, order.paymentCrypto)
  pushNonZero(amounts, order.linkposRequestedAmount)
  pushNonZero(amounts, order.linkposApprovedAmount)
  const q = satang(query)
  return amounts.some((n) => satang(n) === q)
}
