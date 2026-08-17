/**
 * Amount Before VAT + VAT + Rounding = TOTAL (포함/별도·스택 조합)
 */
import {
  computePosPricing,
  receiptTaxDisplayFieldsFromPricing,
  type PosFeeMode,
  type PosFeeStackMode,
} from '@/lib/pos-pricing'
import {
  resolvePosReceiptAmountBeforeVat,
  resolvePosReceiptRoundingAmt,
  resolvePosReceiptSeparateServiceAmtForPrint,
  resolvePosReceiptSubtotalAndVatPrint,
} from '@/lib/pos-receipt-totals-print'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

type MatrixCase = {
  name: string
  subtotal: number
  discountAmt?: number
  deliveryFee?: number
  vatRate: number
  vatMode: PosFeeMode
  serviceRate: number
  serviceMode: PosFeeMode
  feeStackMode?: PosFeeStackMode
  feeStackOrder?: Array<'vat' | 'service' | 'other'>
  roundPaymentTotalToWholeBaht?: boolean
}

function simulatePrint(c: MatrixCase) {
  const pricing = computePosPricing({
    subtotal: c.subtotal,
    discountAmt: c.discountAmt ?? 0,
    deliveryFee: c.deliveryFee ?? 0,
    adjustments: {
      vatRate: c.vatRate,
      vatMode: c.vatMode,
      serviceRate: c.serviceRate,
      serviceMode: c.serviceMode,
      feeStackMode: c.feeStackMode ?? 'parallel',
      feeStackOrder: c.feeStackOrder,
      roundPaymentTotalToWholeBaht: c.roundPaymentTotalToWholeBaht ?? false,
    },
  })
  const taxFields = receiptTaxDisplayFieldsFromPricing(pricing)
  const { subtotalPrint, vatPrint } = resolvePosReceiptSubtotalAndVatPrint({
    total: pricing.finalTotal,
    subtotal: pricing.subtotal,
    discountAmt: pricing.discountAmt,
    deliveryFee: pricing.deliveryFee,
    packagingFee: pricing.packagingFee,
    vatFeeAmt: pricing.vatFeeAmt,
    vatFeeMode: pricing.vatFeeMode,
    ...taxFields,
  })
  const amountBeforeVat = resolvePosReceiptAmountBeforeVat({
    subtotalPrint,
    discountAmtForPrint: pricing.discountAmt,
    deliveryFee: pricing.deliveryFee,
    packagingFee: pricing.packagingFee,
    serviceFeeAmt: pricing.serviceFeeAmt,
    serviceFeeMode: pricing.serviceFeeMode,
    vatFeeMode: pricing.vatFeeMode,
    vatPrint,
    receiptExclusiveSubtotalDisplay: taxFields.receiptExclusiveSubtotalDisplay,
    receiptTaxableGrossForDisplay: taxFields.receiptTaxableGrossForDisplay,
  })
  const rounding = resolvePosReceiptRoundingAmt({
    total: pricing.finalTotal,
    amountBeforeVat,
    vatPrint,
    cardFeeAmt: pricing.cardFeeAmt,
    cardFeeMode: pricing.cardFeeMode,
    otherFeeAmt: pricing.otherFeeAmt,
    otherFeeMode: pricing.otherFeeMode,
  })
  const sum = round2(amountBeforeVat + vatPrint + rounding)
  return {
    pricing,
    subtotalPrint,
    vatPrint,
    amountBeforeVat,
    rounding,
    total: pricing.finalTotal,
    identityOk: Math.abs(sum - pricing.finalTotal) <= 0.05,
    separateService: resolvePosReceiptSeparateServiceAmtForPrint({
      serviceFeeAmt: pricing.serviceFeeAmt,
      serviceFeeMode: pricing.serviceFeeMode,
    }),
  }
}

describe('receipt Amount Before VAT + Rounding vs fee modes', () => {
  const cases: MatrixCase[] = [
    {
      name: 'VAT sep + Service sep parallel',
      subtotal: 850,
      vatRate: 7,
      vatMode: 'separate',
      serviceRate: 10,
      serviceMode: 'separate',
      feeStackMode: 'parallel',
    },
    {
      name: 'VAT sep + Service sep sequential service→vat + whole baht',
      subtotal: 100,
      vatRate: 7,
      vatMode: 'separate',
      serviceRate: 10,
      serviceMode: 'separate',
      feeStackMode: 'sequential',
      feeStackOrder: ['service', 'vat', 'other'],
      roundPaymentTotalToWholeBaht: true,
    },
    {
      name: 'round down Mama case',
      subtotal: 69,
      vatRate: 7,
      vatMode: 'separate',
      serviceRate: 10,
      serviceMode: 'separate',
      feeStackMode: 'sequential',
      feeStackOrder: ['service', 'vat', 'other'],
      roundPaymentTotalToWholeBaht: true,
    },
    {
      name: 'VAT included + Service separate',
      subtotal: 850,
      vatRate: 7,
      vatMode: 'included',
      serviceRate: 10,
      serviceMode: 'separate',
    },
    {
      name: 'VAT included + Service included',
      subtotal: 1000,
      vatRate: 7,
      vatMode: 'included',
      serviceRate: 10,
      serviceMode: 'included',
    },
    {
      name: 'VAT separate + Service included',
      subtotal: 1000,
      vatRate: 7,
      vatMode: 'separate',
      serviceRate: 10,
      serviceMode: 'included',
    },
    {
      name: 'VAT included + 99 discount on 199 (bibimbap)',
      subtotal: 199,
      discountAmt: 99,
      vatRate: 7,
      vatMode: 'included',
      serviceRate: 0,
      serviceMode: 'separate',
    },
    {
      name: 'VAT included + delivery (subtotal stays item gross)',
      subtotal: 2500,
      vatRate: 7,
      vatMode: 'included',
      serviceRate: 0,
      serviceMode: 'separate',
      deliveryFee: 100,
    },
  ]

  it('Before VAT + VAT + Rounding = TOTAL for every mode', () => {
    for (const c of cases) {
      const r = simulatePrint(c)
      expect(r.identityOk, c.name).toBe(true)
    }
  })

  it('user round-up sample: Before 110, Rounding +0.30', () => {
    const r = simulatePrint({
      name: 'up',
      subtotal: 100,
      vatRate: 7,
      vatMode: 'separate',
      serviceRate: 10,
      serviceMode: 'separate',
      feeStackMode: 'sequential',
      feeStackOrder: ['service', 'vat', 'other'],
      roundPaymentTotalToWholeBaht: true,
    })
    expect(r.amountBeforeVat).toBe(110)
    expect(r.vatPrint).toBe(7.7)
    expect(r.total).toBe(118)
    expect(r.rounding).toBe(0.3)
  })

  it('user round-down sample: Before 75.90, Rounding -0.21', () => {
    const r = simulatePrint({
      name: 'down',
      subtotal: 69,
      vatRate: 7,
      vatMode: 'separate',
      serviceRate: 10,
      serviceMode: 'separate',
      feeStackMode: 'sequential',
      feeStackOrder: ['service', 'vat', 'other'],
      roundPaymentTotalToWholeBaht: true,
    })
    expect(r.amountBeforeVat).toBe(75.9)
    expect(r.vatPrint).toBe(5.31)
    expect(r.total).toBe(81)
    expect(r.rounding).toBe(-0.21)
  })

  it('VAT included + discount: Before VAT 93, Rounding 0 (not −7)', () => {
    const r = simulatePrint({
      name: 'included discount bibimbap',
      subtotal: 199,
      discountAmt: 99,
      vatRate: 7,
      vatMode: 'included',
      serviceRate: 0,
      serviceMode: 'separate',
    })
    expect(r.subtotalPrint).toBe(199)
    expect(r.amountBeforeVat).toBe(93)
    expect(r.vatPrint).toBe(7)
    expect(r.total).toBe(100)
    expect(r.rounding).toBe(0)
    expect(r.identityOk).toBe(true)
  })

  it('VAT included + delivery: Before VAT is exclusive of 2600, Rounding 0', () => {
    const r = simulatePrint({
      name: 'included delivery',
      subtotal: 2500,
      deliveryFee: 100,
      vatRate: 7,
      vatMode: 'included',
      serviceRate: 0,
      serviceMode: 'separate',
    })
    expect(r.subtotalPrint).toBe(2500)
    expect(r.amountBeforeVat).toBe(2430)
    expect(r.vatPrint).toBe(170)
    expect(r.total).toBe(2600)
    expect(r.rounding).toBe(0)
  })
})
