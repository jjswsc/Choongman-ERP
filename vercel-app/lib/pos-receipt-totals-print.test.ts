import {
  appendPosReceiptFeeRateLabel,
  formatPosReceiptRoundingAmtText,
  inferPosReceiptFeePercent,
  resolvePosReceiptAmountBeforeVat,
  resolvePosReceiptPrintFeeRates,
  resolvePosReceiptRoundingAmt,
  resolvePosReceiptSeparateServiceAmtForPrint,
} from '@/lib/pos-receipt-totals-print'
import { buildPosHallOrderReceiptDocumentHtml } from '@/lib/pos-hall-order-receipt-document-html'
import { buildPosPaymentReceiptDocumentHtml } from '@/lib/pos-payment-receipt-document-html'
import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import { upsertPosOrderTaxInvoiceMemo } from '@/lib/pos-tax-invoice'

describe('pos-receipt-totals-print', () => {
  it('formats rate suffix in parentheses', () => {
    expect(appendPosReceiptFeeRateLabel('VAT', 7)).toBe('VAT (7%)')
    expect(appendPosReceiptFeeRateLabel('Service Charge', 10)).toBe('Service Charge (10%)')
  })

  it('Amount Before VAT is Sub + Service without rounding', () => {
    expect(
      resolvePosReceiptAmountBeforeVat({
        subtotalPrint: 100,
        serviceFeeAmt: 10,
        serviceFeeMode: 'separate',
      })
    ).toBe(110)
    expect(
      resolvePosReceiptAmountBeforeVat({
        subtotalPrint: 69,
        serviceFeeAmt: 6.9,
        serviceFeeMode: 'separate',
      })
    ).toBe(75.9)
  })

  it('Rounding is TOTAL − (Before VAT + VAT) with +/- text', () => {
    // 110 + 7.70 = 117.70 → TOTAL 118 → +0.30
    expect(
      resolvePosReceiptRoundingAmt({
        total: 118,
        amountBeforeVat: 110,
        vatPrint: 7.7,
      })
    ).toBe(0.3)
    expect(formatPosReceiptRoundingAmtText(0.3)).toBe('+0.30')

    // 75.90 + 5.31 = 81.21 → TOTAL 81 → -0.21
    expect(
      resolvePosReceiptRoundingAmt({
        total: 81,
        amountBeforeVat: 75.9,
        vatPrint: 5.31,
      })
    ).toBe(-0.21)
    expect(formatPosReceiptRoundingAmtText(-0.21)).toBe('-0.21')
  })

  it('QR buffet 299×2: TOTAL 704 → Rounding +0.15 (not −105.85 from stored 598)', () => {
    expect(
      resolvePosReceiptRoundingAmt({
        total: 704,
        amountBeforeVat: 657.8,
        vatPrint: 46.05,
      })
    ).toBe(0.15)
    expect(formatPosReceiptRoundingAmtText(0.15)).toBe('+0.15')
    expect(
      resolvePosReceiptRoundingAmt({
        total: 598,
        amountBeforeVat: 657.8,
        vatPrint: 46.05,
      })
    ).toBe(-105.85)
  })

  it('included service is not added into Amount Before VAT', () => {
    expect(
      resolvePosReceiptSeparateServiceAmtForPrint({
        serviceFeeAmt: 90,
        serviceFeeMode: 'included',
      })
    ).toBe(0)
    expect(
      resolvePosReceiptAmountBeforeVat({
        subtotalPrint: 935,
        serviceFeeAmt: 90.91,
        serviceFeeMode: 'included',
      })
    ).toBe(935)
  })

  it('infers percent and prefers printer rates', () => {
    expect(inferPosReceiptFeePercent(85, 850)).toBe(10)
    expect(
      resolvePosReceiptPrintFeeRates({
        showVatRow: true,
        showServiceRow: true,
        printerVatRate: 7,
        printerServiceRate: 10,
      })
    ).toEqual({ vatRate: 7, serviceRate: 10 })
  })
})

describe('receipt totals layout with Rounding', () => {
  it('payment: round up shows Amount Before VAT 110 + Rounding +0.30', () => {
    const receiptData: ReceiptModalData = {
      orderNo: '008',
      items: [{ id: '1', name: 'Bibimbap C', price: 100, qty: 1 }],
      subtotal: 100,
      discountAmt: 0,
      total: 118,
      storeCode: 'ST01',
      orderType: 'dine-in',
      vatFeeAmt: 7.7,
      vatFeeMode: 'separate',
      serviceFeeAmt: 10,
      serviceFeeMode: 'separate',
      vatRate: 7,
      serviceRate: 10,
      receiptAutoPrintContext: 'payment',
    }
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData,
      menus: [],
      orderTypeLabels: {},
      t: (k) => k,
      lang: 'en',
      origin: '',
      printerSettings: { vatRate: 7, serviceRate: 10 } as never,
      forceSimpleTextMode: true,
    })
    expect(html).toContain('Amount Before VAT')
    expect(html).toMatch(/Amount Before VAT<\/td><td class="simple-v">110\.00/)
    expect(html).toContain('Rounding')
    expect(html).toContain('+0.30')
    expect(html).not.toMatch(/Amount Before VAT<\/td><td class="simple-v">110\.30/)
    const vatIdx = html.indexOf('VAT (7%)')
    const roundIdx = html.indexOf('Rounding')
    const totalIdx = html.indexOf('TOTAL')
    expect(roundIdx).toBeGreaterThan(vatIdx)
    expect(totalIdx).toBeGreaterThan(roundIdx)
  })

  it('tax invoice: keeps Amount Before VAT 110 + Rounding +0.30 (not 110.30)', () => {
    const memo = upsertPosOrderTaxInvoiceMemo('', {
      memberNo: '',
      customerType: 'company',
      name: 'TT Company',
      taxId: '0123456789878',
      branchNo: '00000',
      phone: '000000000',
      email: '00@mail.com',
      address: '0000',
      member: false,
    })
    const receiptData: ReceiptModalData = {
      orderNo: '100120260724001',
      items: [{ id: '1', name: 'Bibimbap C', price: 100, qty: 1 }],
      subtotal: 100,
      discountAmt: 0,
      total: 118,
      storeCode: 'ST01',
      orderType: 'dine-in',
      memo,
      vatFeeAmt: 7.7,
      vatFeeMode: 'separate',
      serviceFeeAmt: 10,
      serviceFeeMode: 'separate',
      vatRate: 7,
      serviceRate: 10,
      receiptAutoPrintContext: 'payment',
    }
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData,
      menus: [],
      orderTypeLabels: {},
      t: (k) => k,
      lang: 'en',
      origin: '',
      printerSettings: { vatRate: 7, serviceRate: 10 } as never,
      forceSimpleTextMode: true,
    })
    expect(html).toContain('TT Company')
    expect(html).toMatch(/Service Charge/)
    expect(html).toMatch(/Amount Before VAT<\/td><td class="simple-v">110\.00/)
    expect(html).not.toMatch(/Amount Before VAT<\/td><td class="simple-v">110\.30/)
    expect(html).toContain('VAT (7%)')
    expect(html).toContain('7.70')
    expect(html).toContain('Rounding')
    expect(html).toContain('+0.30')
  })

  it('payment: round down shows Amount Before VAT 75.90 + Rounding -0.21', () => {
    const receiptData: ReceiptModalData = {
      orderNo: '009',
      items: [{ id: '1', name: 'Mama', price: 69, qty: 1 }],
      subtotal: 69,
      discountAmt: 0,
      total: 81,
      storeCode: 'ST01',
      orderType: 'dine-in',
      vatFeeAmt: 5.31,
      vatFeeMode: 'separate',
      serviceFeeAmt: 6.9,
      serviceFeeMode: 'separate',
      vatRate: 7,
      serviceRate: 10,
      receiptAutoPrintContext: 'payment',
    }
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData,
      menus: [],
      orderTypeLabels: {},
      t: (k) => k,
      lang: 'en',
      origin: '',
      printerSettings: { vatRate: 7, serviceRate: 10 } as never,
      forceSimpleTextMode: true,
    })
    expect(html).toMatch(/Amount Before VAT<\/td><td class="simple-v">75\.90/)
    expect(html).toContain('-0.21')
    expect(html).not.toMatch(/Amount Before VAT<\/td><td class="simple-v">75\.69/)
  })

  it('hall order also prints Rounding separately', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '008',
        storeCode: 'ST01',
        orderType: 'dine-in',
        items: [{ id: '1', name: 'Bibimbap C', price: 100, qty: 1 }],
        subtotal: 100,
        discountAmt: 0,
        total: 118,
        vatFeeAmt: 7.7,
        vatFeeMode: 'separate',
        serviceFeeAmt: 10,
        serviceFeeMode: 'separate',
        vatRate: 7,
        serviceRate: 10,
      },
      t: (k) => k,
      lang: 'en',
      printerSettings: { vatRate: 7, serviceRate: 10 } as never,
    })
    expect(html).toContain('110.00')
    expect(html).toContain('Rounding')
    expect(html).toContain('+0.30')
  })
})
