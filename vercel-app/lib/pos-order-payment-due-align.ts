import {
  computePosOrderDueTotalFromLines,
} from '@/lib/pos-dine-in-table-merge-rules'
import {
  posPricingAdjustmentsFromPrinterSettings,
  type PosPricingAdjustments,
} from '@/lib/pos-pricing'

const PAY_EPS = 0.02

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
