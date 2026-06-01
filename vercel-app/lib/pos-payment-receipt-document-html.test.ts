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

  it('prints Grab option lines from optionCodes (standard layout)', () => {
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData: {
        ...baseReceipt,
        memo: 'grab_order:GF-565',
        items: [
          {
            id: 'grab:line-1',
            name: 'SPICY YANGNYEOM',
            price: 159,
            qty: 1,
            note: 'mods:Kimchi 30g.',
            optionCodes: ['C011-2', 'C011-5'],
          },
        ],
        subtotal: 159,
        total: 159,
        paymentCash: 159,
      },
      menus: [],
      orderTypeLabels: { delivery: 'Delivery' },
      t: (k) => k,
      lang: 'en',
      origin: 'https://example.com',
      printedAt: new Date('2026-06-01T03:49:00.000Z'),
      optionNameByCode: new Map([
        ['C011-2', 'M - Drumette'],
        ['C011-5', 'Kimchi 30g.'],
      ]),
    })
    expect(html).toContain('SPICY YANGNYEOM')
    expect(html).toContain('M - Drumette')
    expect(html).toContain('Kimchi 30g.')
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

  it('replaces promo placeholder code with menu name on payment receipt', () => {
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData: {
        ...baseReceipt,
        items: [
          {
            id: 'set-1',
            name: '[April] Set 3',
            price: 111,
            qty: 1,
            promoItems: [{ menuId: '22', optionId: null, menuName: '#22', quantity: 1 }],
          },
        ],
        subtotal: 111,
        total: 111,
        paymentCash: 111,
      },
      menus: [
        {
          id: '22',
          code: 'C022',
          name: 'Rice',
          category: 'Set',
          price: 0,
          imageUrl: '',
          vatIncluded: true,
          isActive: true,
          sortOrder: 1,
        },
        {
          id: '33',
          code: 'C033',
          name: 'Kimchi',
          category: 'Set',
          price: 0,
          imageUrl: '',
          vatIncluded: true,
          isActive: true,
          sortOrder: 2,
        },
      ],
      orderTypeLabels: { delivery: 'Delivery' },
      t: (k) => k,
      lang: 'en',
      origin: 'https://example.com',
      printedAt: new Date('2026-06-01T03:49:00.000Z'),
    })
    expect(html).toContain('Rice x1')
    expect(html).not.toContain('#22 x1')
  })
})
