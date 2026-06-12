import type { PosPromoSalesKind, PosSalesPromoKindTotals } from '@/lib/pos-sales-promo-discount-aggregate'
import type {
  PosPaymentDiscountKind,
  PosSalesPaymentKindTotals,
} from '@/lib/pos-sales-payment-discount-aggregate'

export type PosSalesCombinedDiscountLayer = 'bundle' | 'payment'

export type PosSalesCombinedKindTotals = {
  layer: PosSalesCombinedDiscountLayer
  kind: PosPromoSalesKind | PosPaymentDiscountKind
  label: string
  discountAmount: number
  discountPctOfGross: number
  discountSharePct: number
}

export type PosSalesCombinedDiscountTotals = {
  periodGrossSales: number
  periodOrderCount: number
  bundleDiscount: number
  paymentDiscount: number
  totalDiscount: number
  bundleDiscountPctOfGross: number
  paymentDiscountPctOfGross: number
  totalDiscountPctOfGross: number
  promoLineSaleSharePct: number
  promoLineSaleAmount: number
  paymentOrderSharePct: number
}

export type PosSalesCombinedDiscountResult = {
  totals: PosSalesCombinedDiscountTotals
  byKind: PosSalesCombinedKindTotals[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pctOf(part: number, whole: number): number {
  if (whole <= 0.0001) return 0
  return round2((part / whole) * 100)
}

export function buildPosSalesCombinedDiscount(params: {
  periodGrossSales: number
  periodOrderCount: number
  bundleDiscount: number
  paymentDiscount: number
  promoLineSaleAmount: number
  paymentOrderCountWithDiscount: number
  bundleByKind: PosSalesPromoKindTotals[]
  paymentByKind: PosSalesPaymentKindTotals[]
}): PosSalesCombinedDiscountResult {
  const periodGrossSales = round2(params.periodGrossSales)
  const bundleDiscount = round2(params.bundleDiscount)
  const paymentDiscount = round2(params.paymentDiscount)
  const totalDiscount = round2(bundleDiscount + paymentDiscount)

  const totals: PosSalesCombinedDiscountTotals = {
    periodGrossSales,
    periodOrderCount: params.periodOrderCount,
    bundleDiscount,
    paymentDiscount,
    totalDiscount,
    bundleDiscountPctOfGross: pctOf(bundleDiscount, periodGrossSales),
    paymentDiscountPctOfGross: pctOf(paymentDiscount, periodGrossSales),
    totalDiscountPctOfGross: pctOf(totalDiscount, periodGrossSales),
    promoLineSaleSharePct: pctOf(params.promoLineSaleAmount, periodGrossSales),
    promoLineSaleAmount: round2(params.promoLineSaleAmount),
    paymentOrderSharePct: pctOf(params.paymentOrderCountWithDiscount, params.periodOrderCount),
  }

  const byKind: PosSalesCombinedKindTotals[] = [
    ...params.bundleByKind.map((row) => ({
      layer: 'bundle' as const,
      kind: row.kind,
      label: '',
      discountAmount: row.bundleDiscount,
      discountPctOfGross: row.bundleDiscountPctOfGross,
      discountSharePct: pctOf(row.bundleDiscount, totalDiscount),
    })),
    ...params.paymentByKind.map((row) => ({
      layer: 'payment' as const,
      kind: row.kind,
      label: '',
      discountAmount: row.discountAmount,
      discountPctOfGross: row.discountPctOfGross,
      discountSharePct: pctOf(row.discountAmount, totalDiscount),
    })),
  ].sort((a, b) => b.discountAmount - a.discountAmount)

  return { totals, byKind }
}
