/**
 * 영수증 Amount Before VAT — VAT/서비스 포함·별도·스택 조합 항등식 검증
 */
import {
  computePosPricing,
  receiptTaxDisplayFieldsFromPricing,
  type PosFeeMode,
  type PosFeeStackMode,
} from '@/lib/pos-pricing'
import {
  resolvePosReceiptAmountBeforeVat,
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
  const { subtotalPrint, vatPrint, showVatRow } = resolvePosReceiptSubtotalAndVatPrint({
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
    total: pricing.finalTotal,
    vatPrint,
    cardFeeAmt: pricing.cardFeeAmt,
    cardFeeMode: pricing.cardFeeMode,
    otherFeeAmt: pricing.otherFeeAmt,
    otherFeeMode: pricing.otherFeeMode,
  })
  const separateService = resolvePosReceiptSeparateServiceAmtForPrint({
    serviceFeeAmt: pricing.serviceFeeAmt,
    serviceFeeMode: pricing.serviceFeeMode,
  })
  return {
    pricing,
    subtotalPrint,
    vatPrint,
    showVatRow,
    amountBeforeVat,
    separateService,
    total: pricing.finalTotal,
    identityOk: Math.abs(round2(amountBeforeVat + vatPrint) - pricing.finalTotal) <= 0.05,
  }
}

describe('receipt Amount Before VAT vs fee modes', () => {
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
      name: 'VAT sep + Service sep sequential service→vat',
      subtotal: 850,
      vatRate: 7,
      vatMode: 'separate',
      serviceRate: 10,
      serviceMode: 'separate',
      feeStackMode: 'sequential',
      feeStackOrder: ['service', 'vat', 'other'],
      roundPaymentTotalToWholeBaht: true,
    },
    {
      name: 'VAT sep + Service sep sequential vat→service',
      subtotal: 850,
      vatRate: 7,
      vatMode: 'separate',
      serviceRate: 10,
      serviceMode: 'separate',
      feeStackMode: 'sequential',
      feeStackOrder: ['vat', 'service', 'other'],
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
      name: 'VAT included only',
      subtotal: 1000,
      vatRate: 7,
      vatMode: 'included',
      serviceRate: 0,
      serviceMode: 'separate',
    },
    {
      name: 'VAT separate only',
      subtotal: 1000,
      vatRate: 7,
      vatMode: 'separate',
      serviceRate: 0,
      serviceMode: 'separate',
    },
    {
      name: 'VAT included + Service separate + whole-baht rounding',
      subtotal: 850.4,
      vatRate: 7,
      vatMode: 'included',
      serviceRate: 10,
      serviceMode: 'separate',
      roundPaymentTotalToWholeBaht: true,
    },
  ]

  it('Amount Before VAT + VAT = TOTAL for every mode combination', () => {
    for (const c of cases) {
      const r = simulatePrint(c)
      expect(r.identityOk, c.name).toBe(true)
    }
  })

  it('included service is informational only (not added into Before VAT identity)', () => {
    const r = simulatePrint({
      name: 'both included',
      subtotal: 1000,
      vatRate: 7,
      vatMode: 'included',
      serviceRate: 10,
      serviceMode: 'included',
    })
    expect(r.separateService).toBe(0)
    expect(r.identityOk).toBe(true)
    // Before VAT ≈ exclusive display when VAT included and no separate add-ons
    expect(Math.abs(r.amountBeforeVat - r.subtotalPrint)).toBeLessThanOrEqual(1)
  })

  it('user photo path: sequential service→vat yields Before VAT ≈ Sub+Service', () => {
    const r = simulatePrint({
      name: 'photo',
      subtotal: 850,
      vatRate: 7,
      vatMode: 'separate',
      serviceRate: 10,
      serviceMode: 'separate',
      feeStackMode: 'sequential',
      feeStackOrder: ['service', 'vat', 'other'],
      roundPaymentTotalToWholeBaht: false,
    })
    expect(r.pricing.serviceFeeAmt).toBe(85)
    expect(r.pricing.vatFeeAmt).toBe(65.45)
    expect(r.amountBeforeVat).toBe(935)
    expect(r.identityOk).toBe(true)
  })
})
