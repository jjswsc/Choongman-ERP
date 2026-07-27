/**
 * 영수증 결제 정정(PAY_CORRECT) — 합계 변경 시 금액 스냅샷 재계산.
 *
 * 이전 방식(비율 스케일)은 total 1→230 처럼 이전 합계가 비정상적으로 작을 때
 * discount/subtotal이 수백 배로 부풀어 협업 할인 집계까지 오염시켰다.
 * 메뉴 소계·배달·포장·쿠폰은 유지하고, 할인·VAT만 새 합계에 맞춘다.
 */

export type PosPayCorrectAmountInput = {
  prevTotal: number
  effectiveTotal: number
  subtotal: number
  discountAmt: number
  couponDiscountAmt: number
  deliveryFee: number
  packagingFee: number
  vat: number
  collabDiscountAmt?: number
  tierDiscountAmt?: number
}

export type PosPayCorrectAmountPatch = {
  subtotal: number
  discountAmt: number
  couponDiscountAmt: number
  deliveryFee: number
  packagingFee: number
  vat: number
  collabDiscountAmt: number
  tierDiscountAmt: number
}

function round2(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100
}

/** 합계 정정 시 적용할 금액 패치. 합계 변화가 없으면 null. */
export function computePayCorrectAmountPatch(
  input: PosPayCorrectAmountInput
): PosPayCorrectAmountPatch | null {
  const prevTotal = round2(Number(input.prevTotal) || 0)
  const effectiveTotal = round2(Number(input.effectiveTotal) || 0)
  if (!(effectiveTotal > 0.005)) return null
  if (Math.abs(effectiveTotal - prevTotal) <= 0.02) return null

  const subtotal = round2(Number(input.subtotal) || 0)
  const couponDiscountAmt = round2(Number(input.couponDiscountAmt) || 0)
  const deliveryFee = round2(Number(input.deliveryFee) || 0)
  const packagingFee = round2(Number(input.packagingFee) || 0)
  const prevCollab = round2(Number(input.collabDiscountAmt) || 0)
  const prevTier = round2(Number(input.tierDiscountAmt) || 0)

  // total ≈ subtotal - discount + delivery + packaging - coupon + vat
  // → discount 목표 = subtotal + delivery + packaging - coupon - total (vat=0일 때)
  const undiscountedBase = round2(subtotal + deliveryFee + packagingFee - couponDiscountAmt)
  let discountAmt = round2(Math.min(subtotal, Math.max(0, undiscountedBase - effectiveTotal)))
  let basePart = round2(Math.max(0, subtotal - discountAmt + deliveryFee + packagingFee - couponDiscountAmt))
  let vat = round2(Math.max(0, effectiveTotal - basePart))

  // 부동소수 잔차 보정
  const recomputed = round2(basePart + vat)
  if (Math.abs(recomputed - effectiveTotal) > 0.02 && discountAmt > 0) {
    const delta = round2(recomputed - effectiveTotal)
    discountAmt = round2(Math.min(subtotal, Math.max(0, discountAmt + delta)))
    basePart = round2(Math.max(0, subtotal - discountAmt + deliveryFee + packagingFee - couponDiscountAmt))
    vat = round2(Math.max(0, effectiveTotal - basePart))
  }

  // 협업·등급 할인은 discount_amt 한도 안에서만 유지.
  // coupon_discount_amt 는 별도 필드라 floor/room 에 넣지 않음(쿠폰+협업 동시 주문에서 collab 가 0으로 깎이는 것 방지).
  const nonCollabFloor = round2(Math.min(discountAmt, prevTier))
  const collabRoom = round2(Math.max(0, discountAmt - nonCollabFloor))
  const collabDiscountAmt =
    prevCollab > 0.005 ? round2(Math.min(prevCollab, collabRoom, discountAmt)) : 0
  const tierRoom = round2(Math.max(0, discountAmt - collabDiscountAmt))
  const tierDiscountAmt =
    prevTier > 0.005 ? round2(Math.min(prevTier, tierRoom, discountAmt)) : 0

  return {
    subtotal,
    discountAmt,
    couponDiscountAmt,
    deliveryFee,
    packagingFee,
    vat,
    collabDiscountAmt,
    tierDiscountAmt,
  }
}
