import {
  computePosOrderDueTotalFromLines,
} from '@/lib/pos-dine-in-table-merge-rules'
import {
  posPricingAdjustmentsFromPrinterSettings,
  type PosPricingAdjustments,
} from '@/lib/pos-pricing'

const PAY_EPS = 0.02

/**
 * 결제액이 DB 청구액과 다를 때 settleFast가 품목·할인으로 합계를 다시 맞출지.
 * - exceeds: 결제액이 DB 합계보다 큼 (합석·요율 누락). 재계산이 안 맞으면 거절.
 * - discount: 결제 모달에서 할인을 넣어 결제액이 DB 합계보다 작음. 재계산이 결제액과 맞을 때만 합계·할인을 저장.
 * 할인 없이 덜 낸 부분결제는 null — 기존 합계를 내리지 않는다.
 */
export function shouldRealignSettleFastDue(params: {
  collectableDue: number
  nextPaymentSum: number
  incomingDiscountAmt?: number
  incomingCouponDiscountAmt?: number
  incomingPointUsed?: number
}): 'exceeds' | 'discount' | null {
  const due = Math.max(0, Number(params.collectableDue) || 0)
  const pay = Math.max(0, Number(params.nextPaymentSum) || 0)
  if (due > 0.02 && pay > due + PAY_EPS) return 'exceeds'
  const discountSignal =
    Math.max(0, Number(params.incomingDiscountAmt) || 0) > 0.02 ||
    Math.max(0, Number(params.incomingCouponDiscountAmt) || 0) > 0.02 ||
    Math.max(0, Number(params.incomingPointUsed) || 0) > 0.02
  if (discountSignal && due > 0.02 && pay > 0.02 && pay + PAY_EPS < due) return 'discount'
  return null
}

/**
 * 결제액이 청구 합계를 덮는지.
 * POS는 최종 합계를 정수 바트로 반올림하므로, 703.85 vs 704 같은 잔차는 허용한다.
 */
export function resolveAlignedDueTotal(paymentSum: number, dueTotal: number): number | null {
  const pay = Math.max(0, Number(paymentSum) || 0)
  const due = Math.max(0, Number(dueTotal) || 0)
  if (pay <= due + PAY_EPS) {
    if (pay >= due - PAY_EPS) return due
    return null
  }
  const rounded = Math.round(due)
  if (Math.abs(pay - rounded) <= PAY_EPS && rounded > due && rounded - due < 1) {
    return rounded
  }
  return null
}

export function coercePosPricingAdjustmentsFromBody(raw: unknown): PosPricingAdjustments | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const hasFeeHint =
    o.vatRate != null ||
    o.vatMode != null ||
    o.serviceRate != null ||
    o.serviceMode != null ||
    o.feeStackMode != null ||
    o.paymentTotalRoundingMode != null ||
    o.roundPaymentTotalToWholeBaht != null
  if (!hasFeeHint) return null
  return posPricingAdjustmentsFromPrinterSettings({
    vatRate: o.vatRate as number | undefined,
    vatMode: o.vatMode as string | undefined,
    serviceRate: o.serviceRate as number | undefined,
    serviceMode: o.serviceMode as string | undefined,
    cardRate: o.cardRate as number | undefined,
    cardMode: o.cardMode as string | undefined,
    cardBaseMode: o.cardBaseMode as string | undefined,
    otherRate: o.otherRate as number | undefined,
    otherMode: o.otherMode as string | undefined,
    feeStackMode: o.feeStackMode as string | undefined,
    feeStackOrder: o.feeStackOrder,
    paymentTotalRoundingMode: o.paymentTotalRoundingMode as string | undefined,
    roundPaymentTotalToWholeBaht:
      o.roundPaymentTotalToWholeBaht === false
        ? false
        : o.roundPaymentTotalToWholeBaht === true
          ? true
          : undefined,
  })
}

export function alignPaymentToRecomputedDue(params: {
  items: Record<string, unknown>[]
  paymentSum: number
  paymentCard?: number
  discountAmt?: number
  couponDiscountAmt?: number
  pointUsed?: number
  adjustments: PosPricingAdjustments
}): { total: number; vat: number; serviceAmt: number } | null {
  if (!params.items.length) return null
  const due = computePosOrderDueTotalFromLines({
    items: params.items,
    discountAmt: Math.max(0, Number(params.discountAmt) || 0),
    couponDiscountAmt: Math.max(0, Number(params.couponDiscountAmt) || 0),
    pointUsed: Math.max(0, Number(params.pointUsed) || 0),
    cardPaymentAmount: Math.max(0, Number(params.paymentCard) || 0),
    adjustments: params.adjustments,
  })
  const fit = resolveAlignedDueTotal(params.paymentSum, due.total)
  if (fit == null) return null
  return { total: fit, vat: due.vat, serviceAmt: due.serviceAmt }
}
