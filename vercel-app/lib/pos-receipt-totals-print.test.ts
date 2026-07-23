import {
  appendPosReceiptFeeRateLabel,
  buildPosReceiptTotalsLabels,
  inferPosReceiptFeePercent,
  resolvePosReceiptAmountBeforeVat,
  resolvePosReceiptPrintFeeRates,
  resolvePosReceiptSeparateServiceAmtForPrint,
} from '@/lib/pos-receipt-totals-print'
import { buildPosHallOrderReceiptDocumentHtml } from '@/lib/pos-hall-order-receipt-document-html'
import { buildPosPaymentReceiptDocumentHtml } from '@/lib/pos-payment-receipt-document-html'
import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'

describe('pos-receipt-totals-print', () => {
  it('formats rate suffix in parentheses', () => {
    expect(appendPosReceiptFeeRateLabel('VAT', 7)).toBe('VAT (7%)')
    expect(appendPosReceiptFeeRateLabel('Service Charge', 10)).toBe('Service Charge (10%)')
    expect(appendPosReceiptFeeRateLabel('VAT', 0)).toBe('VAT')
  })

  it('Amount Before VAT = TOTAL − VAT (separate service already inside total)', () => {
    expect(
      resolvePosReceiptAmountBeforeVat({
        total: 1000,
        vatPrint: 65.45,
      })
    ).toBe(934.55)
    // 사용자 예시: 850+85=935, VAT 65.45, TOTAL 1000.45 → 반올림 1000이면 Before=934.55
    expect(
      resolvePosReceiptAmountBeforeVat({
        total: 1000.45,
        vatPrint: 65.45,
      })
    ).toBe(935)
  })

  it('does not subtract included card/other from Amount Before VAT', () => {
    expect(
      resolvePosReceiptAmountBeforeVat({
        total: 1100,
        vatPrint: 70,
        cardFeeAmt: 30,
        cardFeeMode: 'included',
        otherFeeAmt: 10,
        otherFeeMode: 'included',
      })
    ).toBe(1030)
  })

  it('subtracts separate card/other so Before+VAT+card+other = TOTAL', () => {
    expect(
      resolvePosReceiptAmountBeforeVat({
        total: 1100,
        vatPrint: 70,
        cardFeeAmt: 30,
        cardFeeMode: 'separate',
      })
    ).toBe(1000)
  })

  it('included service is not treated as additive for Sub+Service path', () => {
    expect(
      resolvePosReceiptSeparateServiceAmtForPrint({
        serviceFeeAmt: 90,
        serviceFeeMode: 'included',
      })
    ).toBe(0)
    expect(
      resolvePosReceiptSeparateServiceAmtForPrint({
        serviceFeeAmt: 85,
        serviceFeeMode: 'separate',
      })
    ).toBe(85)
  })

  it('infers percent from amounts', () => {
    expect(inferPosReceiptFeePercent(85, 850)).toBe(10)
    expect(inferPosReceiptFeePercent(65.45, 935)).toBe(7)
  })

  it('prefers printer rates then defaults VAT 7%', () => {
    expect(
      resolvePosReceiptPrintFeeRates({
        showVatRow: true,
        showServiceRow: true,
        printerVatRate: 7,
        printerServiceRate: 10,
      })
    ).toEqual({ vatRate: 7, serviceRate: 10 })
  })

  it('marks included service on label', () => {
    const labels = buildPosReceiptTotalsLabels({
      tr: (_k, fb) => fb,
      serviceFeeMode: 'included',
      serviceRate: 10,
      vatRate: 7,
      vatFeeMode: 'included',
    })
    expect(labels.serviceLabel).toContain('(10%)')
    expect(labels.serviceLabel).toContain('incl. in total')
    expect(labels.vatLabel).toContain('(7%)')
    expect(labels.vatLabel).toContain('VAT incl. in total')
  })
})

describe('receipt totals layout', () => {
  const tr = (key: string, fallback: string) => fallback

  it('payment receipt: Service → Amount Before VAT → VAT → TOTAL with rates', () => {
    const labels = buildPosReceiptTotalsLabels({
      tr,
      vatRate: 7,
      serviceRate: 10,
    })
    const receiptData: ReceiptModalData = {
      orderNo: '2607230001',
      items: [{ id: '1', name: 'Bibimbap', price: 850, qty: 1 }],
      subtotal: 850,
      discountAmt: 0,
      total: 1000.45,
      storeCode: 'ST01',
      orderType: 'dine-in',
      vatFeeAmt: 65.45,
      vatFeeMode: 'separate',
      serviceFeeAmt: 85,
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
    expect(html).toContain(labels.subtotalLabel)
    expect(html).toContain('Service Charge (10%)')
    expect(html).toContain('Amount Before VAT')
    expect(html).toContain('935.00')
    expect(html).toContain('VAT (7%)')
    expect(html).toContain('================================')
    expect(html).toContain('TOTAL')
    const serviceIdx = html.indexOf('Service Charge (10%)')
    const beforeIdx = html.indexOf('Amount Before VAT')
    const vatIdx = html.indexOf('VAT (7%)')
    const totalIdx = html.indexOf('TOTAL')
    expect(serviceIdx).toBeGreaterThan(-1)
    expect(beforeIdx).toBeGreaterThan(serviceIdx)
    expect(vatIdx).toBeGreaterThan(beforeIdx)
    expect(totalIdx).toBeGreaterThan(vatIdx)
  })

  it('hall order: single dashed divider then fee block and eq rule (no double dashed before total)', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '2607230001',
        storeCode: 'ST01',
        orderType: 'dine-in',
        items: [{ id: '1', name: 'Bibimbap', price: 850, qty: 1 }],
        subtotal: 850,
        discountAmt: 0,
        total: 1000.45,
        vatFeeAmt: 65.45,
        vatFeeMode: 'separate',
        serviceFeeAmt: 85,
        serviceFeeMode: 'separate',
        vatRate: 7,
        serviceRate: 10,
      },
      t: (k) => k,
      lang: 'en',
      printerSettings: { vatRate: 7, serviceRate: 10 } as never,
    })
    expect(html).toContain('Sub Total')
    expect(html).toContain('Service Charge (10%)')
    expect(html).toContain('Amount Before VAT')
    expect(html).toContain('935.00')
    expect(html).toContain('VAT (7%)')
    expect(html).toContain('================================')
    expect(html).toContain('TOTAL')
    expect(html).not.toMatch(/receipt-divider"><\/div>\s*<div class="receipt-divider">/)
    const serviceIdx = html.indexOf('Service Charge (10%)')
    const beforeIdx = html.indexOf('Amount Before VAT')
    const vatIdx = html.indexOf('VAT (7%)')
    expect(beforeIdx).toBeGreaterThan(serviceIdx)
    expect(vatIdx).toBeGreaterThan(beforeIdx)
  })

  it('included service: Amount Before VAT + VAT = TOTAL (no double-count)', () => {
    const receiptData: ReceiptModalData = {
      orderNo: '2607230002',
      items: [{ id: '1', name: 'Set', price: 1000, qty: 1 }],
      subtotal: 1000,
      discountAmt: 0,
      total: 1000,
      storeCode: 'ST01',
      orderType: 'dine-in',
      vatFeeAmt: 65.42,
      vatFeeMode: 'included',
      receiptExclusiveSubtotalDisplay: 935,
      receiptVatDisplayAmt: 65,
      receiptTaxableGrossForDisplay: 1000,
      serviceFeeAmt: 90.91,
      serviceFeeMode: 'included',
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
    // TOTAL 1000, VAT display 65 → Before = 935 (서비스 포함분을 다시 더하지 않음)
    expect(html).toContain('Amount Before VAT')
    expect(html).toMatch(/Amount Before VAT<\/td><td class="simple-v">935\.00/)
    expect(html).toContain('incl. in total')
  })
})
