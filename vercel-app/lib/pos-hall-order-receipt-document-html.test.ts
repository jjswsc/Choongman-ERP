import { buildGrabPosCatalog } from '@/lib/grab-pos-order-enrich'
import { upsertPosOrderTaxInvoiceMemo } from '@/lib/pos-tax-invoice'
import {
  buildPosHallOrderReceiptDocumentHtml,
  mergeSetChildrenForReceipt,
  resolveHallOrderReceiptDiscountAmt,
} from '@/lib/pos-hall-order-receipt-document-html'

type MergeSetTestItem = {
  id: string
  name: string
  price?: number
  qty: number
  promoId?: string
  promoCode?: string
}

describe('mergeSetChildrenForReceipt', () => {
  it('merges children by shared promoCode when bracket child markers are missing', () => {
    const rows = mergeSetChildrenForReceipt([
      { id: 'p1', name: '[April] Set 3', qty: 1, promoId: '3', promoCode: '260457-S03' },
      { id: 'c1', name: 'PEPSI MEGA 1', qty: 1, promoCode: '260457-S03' },
      { id: 'c2', name: 'PEPSI MEGA 2', qty: 1, promoCode: '260457-S03' },
    ] satisfies MergeSetTestItem[])

    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toContain('Set 3')
    expect(rows[0]?.promoItems?.map((x) => x.menuName)).toEqual([
      'PEPSI MEGA 1',
      'PEPSI MEGA 2',
    ])
  })
})

describe('resolveHallOrderReceiptDiscountAmt', () => {
  it('uses resolvePosSalesDiscountAmount for discount_amt and coupon_discount_amt', () => {
    expect(
      resolveHallOrderReceiptDiscountAmt({
        discountAmt: 10,
        couponDiscountAmt: 5,
        items: [{ price: 100, qty: 1 }],
        total: 85,
      })
    ).toBe(10)
    expect(
      resolveHallOrderReceiptDiscountAmt({
        discountAmt: 0,
        couponDiscountAmt: 5,
        items: [{ price: 100, qty: 1 }],
        total: 95,
      })
    ).toBe(5)
  })

  it('infers platform discount when line gross exceeds stored total', () => {
    expect(
      resolveHallOrderReceiptDiscountAmt({
        discountAmt: 0,
        items: [{ price: 100, qty: 1 }],
        subtotal: 100,
        total: 77,
      })
    ).toBe(23)
  })

  it('does not treat included VAT as discount when totals match line gross', () => {
    expect(
      resolveHallOrderReceiptDiscountAmt({
        discountAmt: 0,
        items: [
          { price: 111, qty: 1 },
          { price: 111, qty: 1 },
          { price: 111, qty: 1 },
        ],
        subtotal: 333,
        total: 333,
        vatFeeAmt: 21.79,
        vatFeeMode: 'included',
      })
    ).toBe(0)
  })
})

describe('buildPosHallOrderReceiptDocumentHtml — discount row', () => {
  it('omits discount row for VAT-included orders with no real discount', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '123',
        storeCode: 'CM Asoke',
        orderType: 'delivery',
        tableName: 'Shopee #123',
        items: [
          { id: '1', name: '[April] Set 1', price: 111, qty: 1 },
          { id: '2', name: '[April] Set 2', price: 111, qty: 1 },
          { id: '3', name: '[April] Set 3', price: 111, qty: 1 },
        ],
        subtotal: 333,
        discountAmt: 0,
        total: 333,
        vatFeeAmt: 21.79,
        vatFeeMode: 'included',
      },
      t: (k) => (k === 'posDiscount' ? 'Discount' : k),
      lang: 'en',
    })
    expect(html).not.toMatch(/Discount[\s\S]*?-21\.79/)
    expect(html).toContain('333')
  })
})

describe('buildPosHallOrderReceiptDocumentHtml', () => {
  it('prints discount row when effective discount is positive', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: 'sp-638',
        storeCode: 'CM The Street',
        orderType: 'delivery',
        tableName: 'Shopee #sp-638',
        items: [{ id: '1', name: '[April] Set 3', price: 111, qty: 1 }],
        subtotal: 111,
        discountAmt: 23,
        total: 88,
        vatFeeAmt: 6,
      },
      t: (k) => (k === 'posDiscount' ? 'Discount' : k),
      lang: 'en',
    })
    expect(html).toContain('Discount')
    expect(html).toContain('-23')
    expect(html).toContain('88')
  })

  it('prefixes add-on order lines with > before item name', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '009',
        storeCode: 'CM Union Mall',
        orderType: 'dine-in',
        tableName: 'T5',
        items: [
          { id: '1', name: 'Banban Chicken', price: 239, qty: 1 },
          { id: '2', name: 'Squid Ring', price: 130, qty: 1, isAddon: true },
        ],
        subtotal: 369,
        discountAmt: 0,
        total: 369,
      },
      t: (k) => k,
      lang: 'en',
    })
    expect(html).toContain('1x Banban Chicken')
    expect(html).toContain('1x &gt; Squid Ring')
    expect(html).not.toContain('1x &gt; Banban Chicken')
  })

  it('prints banban flavors on separate lines', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '006',
        storeCode: 'CM Huamak',
        orderType: 'dine-in',
        tableName: '1',
        guestCount: 1,
        items: [
          {
            id: 'banban-1',
            name: 'Banban Chicken (CHEESE TORNADO / GARLIC Bar.B.Q FRIED CHICKEN)',
            price: 239,
            qty: 1,
          },
        ],
        subtotal: 239,
        discountAmt: 0,
        total: 239,
      },
      t: (k) => k,
      lang: 'en',
    })
    expect(html).toContain('1x Banban Chicken')
    expect(html).toContain('- CHEESE TORNADO')
    expect(html).toContain('- GARLIC Bar.B.Q FRIED CHICKEN')
    expect(html).not.toContain('CHEESE TORNADO / GARLIC')
  })

  it('prints digits-only POS order number below date and omits store name', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: 'CMUNIONMALL-20260601-004',
        storeCode: 'CM Union Mall',
        orderType: 'delivery',
        tableName: 'Shopee #762',
        items: [{ id: '1', name: 'Set 1', price: 111, qty: 1 }],
        subtotal: 111,
        discountAmt: 23,
        total: 88,
      },
      t: (k) => (k === 'posOrderNo' ? 'Order No' : k),
      lang: 'en',
    })
    expect(html).not.toContain('CM Union Mall')
    expect(html).toMatch(/Order No[\s\S]*?20260601004/)
    expect(html).not.toContain('CMUNIONMALL')
  })

  it('does not print internal memo stamps inside tax invoice address', () => {
    const tax = {
      memberNo: '',
      customerType: 'person' as const,
      name: 'ABC',
      taxId: '1234567890123',
      branchNo: '00000',
      phone: '0987654321',
      email: 'a@b.com',
      address: 'Bangkok',
      member: false,
    }
    const memo =
      upsertPosOrderTaxInvoiceMemo('', tax) +
      '\n[ORDER_CANCELLED 2026-05-22T08:39:34.240Z] pressed wrong'
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '001',
        storeCode: 'CM Union Mall',
        orderType: 'dine-in',
        memo,
        items: [{ id: '1', name: '7UP', price: 30, qty: 1 }],
        subtotal: 30,
        discountAmt: 0,
        total: 30,
      },
      t: (k) => k,
      lang: 'en',
    })
    expect(html).toContain('Bangkok')
    expect(html).not.toContain('ORDER_CANCELLED')
    expect(html).not.toContain('PAY_CORRECT')
  })

  it('prints grab option codes from item fields on hall order receipt', () => {
    const catalog = buildGrabPosCatalog(
      [],
      [
        { optionCode: 'C011-2', name: 'M - Drumette' },
        { optionCode: 'C011-5', name: 'Kimchi 30g.' },
      ]
    )
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '011',
        storeCode: 'CM True Digital',
        orderType: 'delivery',
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
        discountAmt: 0,
        total: 159,
      },
      t: (k) => k,
      lang: 'en',
      optionNameByCode: catalog.optionNameByCode,
    })
    expect(html).toContain('SPICY YANGNYEOM')
    expect(html).toContain('M - Drumette')
    expect(html).toContain('Kimchi 30g.')
  })
})
