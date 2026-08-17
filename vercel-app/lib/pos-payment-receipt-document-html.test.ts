import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildPosPaymentReceiptDocumentHtml,
  buildPosPaymentReceiptDocumentHtmlAsync,
} from '@/lib/pos-payment-receipt-document-html'

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

  it('does not embed quickchart.io for membership QR (local data URI only)', async () => {
    const html = await buildPosPaymentReceiptDocumentHtmlAsync({
      receiptData: baseReceipt,
      menus: [],
      orderTypeLabels: { delivery: 'Delivery' },
      t: (k) => k,
      lang: 'en',
      origin: 'https://example.com',
      designOverride: {
        receiptShowMembershipQr: true,
        receiptMembershipQrLinkUrl: 'https://example.com/m',
      },
    })
    expect(html).not.toContain('quickchart.io')
    expect(html).toMatch(/data:image\/(png|svg\+xml)/i)
  })

  it('sync builder never falls back to quickchart.io', () => {
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData: baseReceipt,
      menus: [],
      orderTypeLabels: { delivery: 'Delivery' },
      t: (k) => k,
      lang: 'en',
      origin: 'https://example.com',
      designOverride: {
        receiptShowMembershipQr: true,
        receiptMembershipQrLinkUrl: 'https://example.com/m',
      },
    })
    expect(html).not.toContain('quickchart.io')
  })

  it('prints POS ID from receiptBizAbn after business name when set', () => {
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData: { ...baseReceipt, receiptAutoPrintContext: 'payment' },
      menus: [],
      orderTypeLabels: { delivery: 'Delivery' },
      t: (k) =>
        k === 'posPosIdLabel' ? 'POS ID' : k === 'posTaxIdLabel' ? 'Tax ID' : k,
      lang: 'en',
      origin: 'https://example.com',
      designOverride: {
        receiptBizName: 'ZUS COFFEE - THYME BANGNA',
        receiptBizAbn: 'E020160003A0036',
        receiptBizTaxId: '0105568110459',
      },
    })
    expect(html).toContain('POS ID')
    expect(html).toContain('E020160003A0036')
    const nameIdx = html.indexOf('ZUS COFFEE - THYME BANGNA')
    const posIdIdx = html.indexOf('E020160003A0036')
    const taxIdx = html.indexOf('0105568110459')
    expect(nameIdx).toBeGreaterThanOrEqual(0)
    expect(posIdIdx).toBeGreaterThan(nameIdx)
    expect(taxIdx).toBeGreaterThan(posIdIdx)
  })

  it('omits POS ID line when receiptBizAbn is empty', () => {
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData: { ...baseReceipt, receiptAutoPrintContext: 'payment' },
      menus: [],
      orderTypeLabels: { delivery: 'Delivery' },
      t: (k) => (k === 'posPosIdLabel' ? 'POS ID' : k),
      lang: 'en',
      origin: 'https://example.com',
      designOverride: {
        receiptBizName: 'Demo Store',
        receiptBizAbn: '',
      },
    })
    expect(html).not.toMatch(/POS ID\s*:/)
  })

  it('does not embed remote https logo/stamp urls (Electron loadFile hang)', () => {
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData: { ...baseReceipt, receiptAutoPrintContext: 'payment' },
      menus: [],
      orderTypeLabels: { delivery: 'Delivery' },
      t: (k) => k,
      lang: 'en',
      origin: 'https://example.com',
      printerSettings: { logoPrint: true } as never,
      designOverride: {
        receiptLogoImageUrl: 'https://cdn.example.com/logo.png',
        receiptStampImageUrl: 'https://cdn.example.com/stamp.png',
        receiptShowStamp: true,
        receiptStampOnlyTaxInvoice: false,
      },
    })
    expect(html).not.toContain('https://cdn.example.com')
    expect(html).not.toContain('company-stamp.png')
  })

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

  it('does not duplicate banban grab flavors on simple receipt', () => {
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData: {
        ...baseReceipt,
        memo: 'grab_order:GF-832',
        deliveryAppCode: 'grab',
        items: [
          {
            id: 'grab:banban-832',
            name: 'Banban Chicken (SNOW ONION / CHEESE TORNADO)',
            price: 279,
            qty: 1,
            note: 'mods:Pickled Radish · banbanFlavors:SNOW ONION,CHEESE TORNADO',
            deliveryAppCode: 'grab',
          },
        ],
        subtotal: 279,
        total: 279,
        paymentCash: 279,
      },
      menus: [],
      orderTypeLabels: { delivery: 'Delivery' },
      t: (k) => k,
      lang: 'en',
      origin: 'https://example.com',
      printedAt: new Date('2026-06-06T10:24:00.000Z'),
      forceSimpleTextMode: true,
    })
    expect(html).toContain('Banban Chicken')
    expect(html).toContain('SNOW ONION')
    expect(html).toContain('CHEESE TORNADO')
    expect(html).toContain('Pickled Radish')
    expect(html).not.toContain('SNOW ONION / CHEESE TORNADO')
    const snowCount = (html.match(/SNOW ONION/g) || []).length
    const cheeseCount = (html.match(/CHEESE TORNADO/g) || []).length
    expect(snowCount).toBe(1)
    expect(cheeseCount).toBe(1)
  })
})

describe('buildPosPaymentReceiptDocumentHtmlAsync — Windows hybrid logo', () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        cmPosShell: {
          printHtml: vi.fn(async () => ({ ok: true })),
        },
      },
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: originalWindow,
    })
  })

  it('inlines https logo as data URI on hybrid (does not drop Choongman logo)', async () => {
    const tinyPng = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
      0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ])
    globalThis.fetch = vi.fn(async () => {
      return new Response(tinyPng, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      })
    }) as unknown as typeof fetch

    const html = await buildPosPaymentReceiptDocumentHtmlAsync({
      receiptData: {
        orderNo: 'CMTEST-20260722-021',
        storeCode: 'CM Farwell',
        orderType: 'dine_in',
        items: [{ id: '1', name: 'Soy Sauce Chicken', price: 99, qty: 2 }],
        subtotal: 198,
        discountAmt: 0,
        total: 198,
        paymentQr: 198,
        receiptAutoPrintContext: 'payment',
      },
      menus: [],
      orderTypeLabels: { dine_in: 'Dine-in' },
      t: (k) => k,
      lang: 'th',
      origin: 'https://choongman-erp.vercel.app',
      printerSettings: { logoPrint: true } as never,
      designOverride: {
        receiptLogoImageUrl: 'https://choongman-erp.vercel.app/company-stamp.png',
      },
    })

    expect(html).toContain('receipt-brand-logo')
    expect(html).toMatch(/src="data:image\/png;base64,/)
    expect(html).not.toContain('https://choongman-erp.vercel.app/company-stamp.png')
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('hides buffet-included 0฿ lines and Extra tags on payment receipt when the setting is on', () => {
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData: {
        orderNo: '100120260817001',
        storeCode: '1001',
        orderType: 'dine_in',
        items: [
          { id: 'buffet-entry-1', name: '[Buffet] Buffet 299 × 2', price: 299, qty: 2 },
          { id: 'c1', name: 'Chicken สันในไก่', price: 0, qty: 1, note: 'Buffet', buffetIncluded: true },
          { id: 'e1', name: 'Mama', price: 69, qty: 1, note: 'Extra' },
        ],
        subtotal: 667,
        discountAmt: 0,
        total: 667,
        paymentCash: 667,
        receiptAutoPrintContext: 'payment',
      },
      menus: [],
      orderTypeLabels: { dine_in: 'Dine-in' },
      t: (k) => (k === 'posLineNote' ? 'Item' : k),
      lang: 'en',
      origin: 'https://example.com',
      printerSettings: { hideBuffetIncludedOnGuestBill: true } as never,
    })
    expect(html).toContain('Buffet 299')
    expect(html).toContain('Mama')
    expect(html).not.toContain('Chicken')
    expect(html).not.toContain('Item: Buffet')
    expect(html).not.toContain('Item: Extra')
  })
})
