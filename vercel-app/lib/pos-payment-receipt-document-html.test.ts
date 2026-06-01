import { describe, expect, it } from 'vitest'
import { buildPosPaymentReceiptDocumentHtml } from '@/lib/pos-payment-receipt-document-html'

describe('buildPosPaymentReceiptDocumentHtml — POS order number digits', () => {
  const baseReceipt = {
    orderNo: 'CMUNIONMALL-20260601-004',
    storeCode: 'CM Union Mall',
    orderType: 'delivery',
    tableName: 'Shopee #762',
    items: [{ id: '1', name: 'Set 1', price: 88, qty: 1 }],
    subtotal: 88,
    discountAmt: 0,
    total: 88,
    paymentCash: 88,
  }

  it('prints digits-only order number below date and omits store name (standard layout)', () => {
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData: baseReceipt,
      menus: [],
      orderTypeLabels: { delivery: 'Delivery' },
      t: (k) => (k === 'posOrderNo' ? 'Order No' : k),
      lang: 'en',
      origin: 'https://example.com',
      printedAt: new Date('2026-06-01T03:49:00.000Z'),
    })
    expect(html).not.toContain('CM Union Mall')
    expect(html).toMatch(/Date[\s\S]*?Order No[\s\S]*?20260601004/)
    expect(html).not.toContain('CMUNIONMALL')
  })

  it('prints digits-only order number below date and omits store name (simple layout)', () => {
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData: baseReceipt,
      menus: [],
      orderTypeLabels: { delivery: 'Delivery' },
      t: (k) => (k === 'posOrderNo' ? 'Order No' : k),
      lang: 'en',
      origin: 'https://example.com',
      printedAt: new Date('2026-06-01T03:49:00.000Z'),
      forceSimpleTextMode: true,
    })
    expect(html).not.toContain('CM Union Mall')
    expect(html).toMatch(/Date[\s\S]*?Order No[\s\S]*?20260601004/)
    expect(html).not.toContain('simple-store')
  })
})
