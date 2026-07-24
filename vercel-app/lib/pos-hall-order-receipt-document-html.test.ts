import { buildGrabPosCatalog } from '@/lib/grab-pos-order-enrich'
import { upsertPosOrderTaxInvoiceMemo } from '@/lib/pos-tax-invoice'
import {
  buildPosHallOrderReceiptDocumentHtml,
  mergeSetChildrenForReceipt,
  resolveHallOrderReceiptDiscountAmt,
} from '@/lib/pos-hall-order-receipt-document-html'
import { mergeGrabSetChildLinesIntoPromoParents } from '@/lib/grab-set-pos-lines'

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

  it('merges children by shared promoId when promoCode is missing on child lines', () => {
    const rows = mergeSetChildrenForReceipt([
      {
        id: 'p1',
        name: 'Choongman Festival Set 2',
        qty: 1,
        promoId: '99',
        promoItems: [{ menuId: '1', optionId: null, menuName: 'GOLDEN FRIED CHICKEN', quantity: 1 }],
      },
      { id: 'c1', name: 'Aquafina', qty: 1, promoId: '99', menuId: '2' },
      { id: 'c2', name: 'Rice', qty: 1, promoId: '99', menuId: '3' },
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]?.promoItems?.map((x) => x.menuName)).toEqual([
      'GOLDEN FRIED CHICKEN',
      'Aquafina',
      'Rice',
    ])
  })

  it('merges [[promo]] bracket child lines onto parent by label match', () => {
    const rows = mergeSetChildrenForReceipt([
      {
        id: 'p1',
        name: '[April] Set 2',
        price: 111,
        qty: 1,
        promoItems: [
          { menuId: '22', optionId: null, quantity: 1 },
          { menuId: '25', optionId: null, quantity: 1 },
        ],
      },
      { id: 'c1', name: '[[April] Set 2] Rice', price: 0, qty: 1, menuId: '22' },
      {
        id: 'c2',
        name: '[[April] Set 2] SOY SAUCE CHICKEN',
        price: 0,
        qty: 1,
        menuId: '25',
        note: 'mods:S Boneless',
      },
    ] satisfies MergeSetTestItem[])

    expect(rows).toHaveLength(1)
    expect(rows[0]?.promoItems?.map((x) => x.menuName)).toEqual([
      undefined,
      undefined,
      'Rice',
      'SOY SAUCE CHICKEN',
    ])
  })

  it('keeps option text from child line name for hall orders', () => {
    const rows = mergeSetChildrenForReceipt([
      { id: 'p1', name: 'Festival Set 2', qty: 1, promoId: '9', promoCode: 'SET-S02' },
      { id: 'c1', name: 'Aquafina (500ml)', qty: 1, promoCode: 'SET-S02' },
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]?.promoItems?.[0]?.menuName).toBe('Aquafina')
    expect(rows[0]?.promoItems?.[0]?.optionName).toBe('500ml')
  })

  it('keeps two POS promo sets separate when they share promoId but have different choices', () => {
    const rows = mergeSetChildrenForReceipt([
      {
        id: 'promo-99-set-a',
        name: 'Choongman Festival Set 2',
        price: 333,
        qty: 1,
        promoId: '99',
        promoCode: 'FEST-S02',
        promoItems: [
          { menuId: '1', optionId: 's', menuName: 'GOLDEN FRIED CHICKEN', optionName: 'S Boneless', quantity: 1 },
          { menuId: '2', optionId: 'sea', menuName: 'Seafood-jjigae Soup with rice', quantity: 1 },
        ],
      },
      {
        id: 'promo-99-set-b',
        name: 'Choongman Festival Set 2',
        price: 333,
        qty: 1,
        promoId: '99',
        promoCode: 'FEST-S02',
        promoItems: [
          { menuId: '1', optionId: 's', menuName: 'GOLDEN FRIED CHICKEN', optionName: 'S Boneless', quantity: 1 },
          { menuId: '3', optionId: 'kim', menuName: 'Kimchi Soup with rice', quantity: 1 },
        ],
      },
    ])

    expect(rows).toHaveLength(2)
    expect(rows[0]?.promoItems?.map((x) => x.menuName)).toEqual([
      'GOLDEN FRIED CHICKEN',
      'Seafood-jjigae Soup with rice',
    ])
    expect(rows[1]?.promoItems?.map((x) => x.menuName)).toEqual([
      'GOLDEN FRIED CHICKEN',
      'Kimchi Soup with rice',
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

  it('prefers lineDiscountAmt sum when explicit double-counts coupon', () => {
    expect(
      resolveHallOrderReceiptDiscountAmt({
        discountAmt: 94,
        couponDiscountAmt: 223,
        items: [
          { price: 219, qty: 1, lineDiscountAmt: 172.06 },
          { price: 259, qty: 1, lineDiscountAmt: 50.94 },
        ],
        subtotal: 478,
        total: 255,
      })
    ).toBe(223)
  })

  it('prefers lineDiscountAmt sum when it exceeds discount_amt without coupon field', () => {
    expect(
      resolveHallOrderReceiptDiscountAmt({
        discountAmt: 94,
        couponDiscountAmt: 0,
        items: [
          { price: 219, qty: 1, lineDiscountAmt: 172.06 },
          { price: 259, qty: 1, lineDiscountAmt: 50.94 },
        ],
        subtotal: 478,
        total: 255,
      })
    ).toBe(223)
  })

  it('sums lineDiscountAmt when order discount_amt is zero', () => {
    expect(
      resolveHallOrderReceiptDiscountAmt({
        discountAmt: 0,
        items: [
          { price: 111, qty: 1, lineDiscountAmt: 15 },
          { price: 111, qty: 1, lineDiscountAmt: 15 },
        ],
        subtotal: 222,
        total: 192,
        vatFeeAmt: 12.56,
        vatFeeMode: 'included',
      })
    ).toBe(30)
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
  it('shows delivery platform on order type chip for ShopeeFood webhook orders', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '20260628015',
        storeCode: 'CM Silom',
        orderType: 'delivery',
        tableName: 'ShopeeFood #2278',
        memo: 'sf_order:778899',
        items: [{ id: '1', name: 'Snow Onion Chicken Dosirak', price: 129, qty: 1, deliveryAppCode: 'shopee' }],
        subtotal: 129,
        discountAmt: 0,
        total: 129,
      },
      t: (k) =>
        k === 'posOrderTypeDelivery'
          ? 'Delivery'
          : k === 'posOrderNo'
            ? 'Order No'
            : k === 'posMenuName'
              ? 'Menu'
              : k === 'amount'
                ? 'Amount'
                : k,
      lang: 'en',
    })
    expect(html).toContain('receipt-order-type-chip')
    expect(html).toContain('Delivery · Shopee')
  })

  it('prints per-line and total discount for Shopee-style line discounts', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '444',
        storeCode: 'CM Silom',
        orderType: 'delivery',
        tableName: 'Shopee #444',
        items: [
          { id: '1', name: '[April] Set 2', price: 111, qty: 1, lineDiscountAmt: 15 },
          { id: '2', name: '[April] Set 3', price: 111, qty: 1, lineDiscountAmt: 15 },
        ],
        subtotal: 222,
        discountAmt: 0,
        total: 192,
        vatFeeAmt: 12.56,
        vatFeeMode: 'included',
      },
      t: (k) => (k === 'posDiscount' ? 'Discount' : k),
      lang: 'en',
    })
    expect(html).toContain('Discount')
    expect(html).toContain('-15')
    expect(html).toContain('-30')
    expect(html).toContain('192')
    expect(html).not.toContain('>222<')
  })

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

  it('does not print the option twice when it is in both the name and the note', () => {
    // 사진 케이스: 이름의 "(M - Boneless)" → 옵션 줄, note 의 "M - Boneless" → 비고 줄.
    // 같은 값이 두 번 찍히지 않고 옵션 줄만 한 번 나와야 한다.
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '060',
        storeCode: 'CM Ekkamai',
        orderType: 'dine-in',
        tableName: '7',
        items: [
          { id: '1', name: 'GOLDEN FRIED CHICKEN (M - Boneless)', price: 219, qty: 1, note: 'M - Boneless' },
        ],
        subtotal: 219,
        discountAmt: 0,
        total: 219,
      },
      t: (k) => k,
      lang: 'en',
    })
    expect(html).toContain('- M - Boneless')
    expect(html).not.toContain('posLineNote')
    // "M - Boneless" 문자열은 옵션 줄에서 딱 한 번만 등장
    expect(html.split('M - Boneless').length - 1).toBe(1)
  })

  it('keeps a genuine customer note that differs from the option', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '061',
        storeCode: 'CM Ekkamai',
        orderType: 'dine-in',
        tableName: '7',
        items: [
          { id: '1', name: 'GOLDEN FRIED CHICKEN (M - Boneless)', price: 219, qty: 1, note: 'no spicy' },
        ],
        subtotal: 219,
        discountAmt: 0,
        total: 219,
      },
      t: (k) => k,
      lang: 'en',
    })
    expect(html).toContain('- M - Boneless')
    expect(html).toContain('no spicy')
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

  it('GF-258 Grab banban keeps sidedish on hall receipt (flavors separate, Pickled Radish not dropped)', () => {
    const catalog = buildGrabPosCatalog([], [{ optionCode: 'C008-5', name: 'Pickled Radish (30 g.)' }])
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: 'GF-258',
        storeCode: 'CM The Street',
        orderType: 'delivery',
        tableName: 'Grab #GF-258',
        items: [
          {
            id: 'grab:banban-258',
            name: 'Banban Chicken (SNOW ONION / CURRY Bar.B.Q FRIED CHICKEN)',
            price: 279,
            qty: 1,
            note: 'mods:Pickled Radish (30 g.) · optc:C008-5 · banbanFlavors:SNOW ONION,CURRY Bar.B.Q FRIED CHICKEN · eco:no plastic cutlery requested',
            deliveryAppCode: 'grab',
          },
        ],
        subtotal: 498,
        discountAmt: 0,
        total: 498,
      },
      t: (k) => k,
      lang: 'en',
      optionNameByCode: catalog.optionNameByCode,
    })
    expect(html).toContain('Banban Chicken')
    expect(html).toContain('SNOW ONION')
    expect(html).toContain('CURRY Bar.B.Q FRIED CHICKEN')
    expect(html).toContain('Pickled Radish')
    expect(html).not.toContain('SNOW ONION / CURRY')
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

  it('prints two festival sets as separate lines on hall order receipt', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '017',
        storeCode: 'CM Silom',
        orderType: 'Dine In',
        tableName: 'T - 5',
        guestCount: 3,
        items: [
          {
            id: 'promo-99-set-a',
            name: 'Choongman Festival Set 2',
            price: 333,
            qty: 1,
            promoId: '99',
            promoItems: [
              { menuId: '1', optionId: 's', menuName: 'GOLDEN FRIED CHICKEN', optionName: 'S Boneless', quantity: 1 },
              { menuId: '2', optionId: null, menuName: 'Seafood-jjigae Soup with rice', quantity: 1 },
            ],
          },
          {
            id: 'promo-99-set-b',
            name: 'Choongman Festival Set 2',
            price: 333,
            qty: 1,
            promoId: '99',
            promoItems: [
              { menuId: '1', optionId: 's', menuName: 'GOLDEN FRIED CHICKEN', optionName: 'S Boneless', quantity: 1 },
              { menuId: '3', optionId: null, menuName: 'Kimchi Soup with rice', quantity: 1 },
            ],
          },
        ],
        subtotal: 666,
        discountAmt: 0,
        total: 666,
      },
      t: (k) => k,
      lang: 'en',
    })
    expect(html.match(/Choongman Festival Set 2/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(html).toContain('Seafood-jjigae Soup with rice')
    expect(html).toContain('Kimchi Soup with rice')
    expect(html).not.toMatch(/- Choongman Festival Set 2 x1/)
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

  it('GF-078 Grab Set 2 hall receipt shows sidedish after grabSetChild rows are removed', () => {
    const catalog = buildGrabPosCatalog(
      [
        { id: 22, name: 'Rice', code: 'C022' },
        { id: 11, name: 'SOY SAUCE CHICKEN', code: 'C011' },
      ],
      [
        { name: 'S - Boneless', optionCode: 'C011-1' },
        { name: 'Kimchi 30 g.', optionCode: 'C011-5' },
      ],
      [{ id: '2', name: '[111] Set 2', code: 'SET2', items: [] }]
    )
    const merged = mergeGrabSetChildLinesIntoPromoParents(
      [
        {
          id: 'grab:p1',
          name: '[111] Set 2',
          price: 159,
          qty: 1,
          promoId: '2',
          deliveryAppCode: 'grab',
          note: 'eco:no plastic cutlery requested',
          promoItems: [
            { menuId: '22', menuName: 'Rice', optionId: null, quantity: 1 },
            { menuId: '11', menuName: 'SOY SAUCE CHICKEN', optionId: null, quantity: 1 },
          ],
        },
        {
          id: 'grab:c1',
          name: '[[111] Set 2] SOY SAUCE CHICKEN',
          price: 0,
          qty: 1,
          menuId1: '11',
          note: 'mods:Kimchi 30 g. · optc:C011-5',
        },
        {
          id: 'grab:soup',
          name: 'KIMCHI SOUP With Rice',
          price: 219,
          qty: 1,
        },
      ],
      catalog
    )
    const receiptItems = merged.filter((it) => !it.grabSetChild)
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: 'GF-078',
        storeCode: 'CM Bangna',
        orderType: 'delivery',
        tableName: 'Grab #GF-078',
        memo: 'grab_order:GF-078',
        items: receiptItems,
        subtotal: 378,
        discountAmt: 48,
        total: 330,
      },
      t: (k) => k,
      lang: 'en',
      optionNameByCode: catalog.optionNameByCode,
    })
    expect(html).toContain('[111] Set 2')
    expect(html).toContain('Kimchi 30 g.')
    expect(html).toContain('KIMCHI SOUP With Rice')
  })

  it('GF-320 Grab Set 1 hall receipt shows Pickled Radish (parent-only line, optc only)', () => {
    const catalog = buildGrabPosCatalog(
      [{ id: 20, name: 'GOLDEN FRIED CHICKEN', code: 'C020' }],
      [{ name: 'Pickled Radish 30 g.', optionCode: 'C020-5' }],
      [{ id: '1', name: '[111] Set 1', code: 'SET1', items: [] }]
    )
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: 'GF-320',
        storeCode: 'CM MBK',
        orderType: 'delivery',
        tableName: 'Grab #GF-320',
        memo: 'grab_order:GF-320',
        items: [
          {
            id: 'grab:320',
            name: '[111] Set 1 Golden Fried Chicken',
            price: 159,
            qty: 1,
            deliveryAppCode: 'grab',
            note: 'eco:no plastic cutlery requested',
            optionCodes: ['C020-5'],
            optionCode1: 'C020-5',
          },
          {
            id: 'grab:t1',
            name: 'Tteokbokki',
            price: 219,
            qty: 1,
            deliveryAppCode: 'grab',
          },
        ],
        subtotal: 378,
        discountAmt: 48,
        total: 330,
      },
      t: (k) => k,
      lang: 'en',
      optionNameByCode: catalog.optionNameByCode,
    })
    expect(html).toContain('[111] Set 1 Golden Fried Chicken')
    expect(html).toContain('Pickled Radish 30 g.')
    expect(html).toContain('Tteokbokki')
  })

  it('GF-320 Grab Set 1 hall receipt shows Pickled Radish from promoItems sidedish choice', () => {
    const catalog = buildGrabPosCatalog(
      [
        { id: 22, name: 'Rice', code: 'C022' },
        { id: 20, name: 'GOLDEN FRIED CHICKEN', code: 'C020' },
      ],
      [{ name: 'S - Boneless', optionCode: 'C020-1' }],
      [{ id: '1', name: '[111] Set 1', code: 'SET1', items: [] }]
    )
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: 'GF-320',
        storeCode: 'CM MBK',
        orderType: 'delivery',
        memo: 'grab_order:GF-320',
        items: [
          {
            id: 'grab:320',
            name: '[111] Set 1 Golden Fried Chicken',
            price: 159,
            qty: 1,
            deliveryAppCode: 'grab',
            note: 'eco:no plastic cutlery requested',
            promoItems: [
              { menuId: '22', menuName: 'Rice', quantity: 1 },
              {
                menuId: '20',
                menuName: 'GOLDEN FRIED CHICKEN',
                optionName: 'S - Boneless',
                quantity: 1,
              },
              { menuId: '8', menuName: 'Pickled Radish 30 g.', quantity: 1 },
            ],
          },
        ],
        subtotal: 159,
        discountAmt: 48,
        total: 111,
      },
      t: (k) => k,
      lang: 'en',
      optionNameByCode: catalog.optionNameByCode,
    })
    expect(html).toContain('Pickled Radish 30 g.')
  })

  it('emphasizes channel order token (e.g. GF-268) only once on hall order receipt header', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '20260608033',
        storeCode: 'CM Test',
        orderType: 'delivery',
        tableName: 'Grab #GF-268',
        memo: 'grab_order:GF-268',
        items: [{ id: '1', name: '[April] Set 2', price: 189, qty: 1 }],
        subtotal: 189,
        discountAmt: 78,
        total: 111,
      },
      t: (k) => k,
      lang: 'th',
    })
    expect(html.match(/class="receipt-delivery-channel-no"/g)?.length ?? 0).toBe(1)
    expect(html.match(/GF-268/g)?.length ?? 0).toBe(1)
    expect(html).not.toContain('posChannelOrderNo')
    expect(html).toContain('receipt-delivery-channel-no">GF-268</span>')
    expect(html).not.toContain('receipt-delivery-channel-no">Grab')
  })

  it('keeps Grab delivery context on hall receipt table row without repeating channel no', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '20260608033',
        storeCode: 'CM Test',
        orderType: 'delivery',
        tableName: 'Grab #GF-636 · Delivery · Somchai · ID BUANUTVT',
        memo: 'grab_order:GF-636',
        items: [{ id: '1', name: 'Set 2', price: 189, qty: 1 }],
        subtotal: 189,
        discountAmt: 0,
        total: 189,
      },
      t: (k) => k,
      lang: 'en',
    })
    expect(html.match(/GF-636/g)?.length ?? 0).toBe(1)
    expect(html).toContain('Somchai')
    expect(html).toContain('BUANUTVT')
    expect(html).not.toContain('Grab #GF-636')
  })

  it('replaces promo placeholder code with menu name on hall order receipt', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '562',
        storeCode: 'CM Silom',
        orderType: 'delivery',
        tableName: 'Grab #562',
        items: [
          {
            id: 'set-3',
            name: '[April] Set 3',
            price: 111,
            qty: 1,
            promoItems: [{ menuId: '22', optionId: null, menuName: '#22', quantity: 1 }],
          },
        ],
        subtotal: 111,
        discountAmt: 0,
        total: 111,
      },
      t: (k) => k,
      lang: 'en',
      menuNameById: (menuId: string) => (menuId === '22' ? 'Rice' : ''),
      menuCodeByMenuId: { '22': 'C022' },
    })
    expect(html).toContain('Rice x1')
    expect(html).not.toContain('#22 x1')
  })

  it('keeps pre-translated takeout order type label instead of defaulting to dine-in', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '021',
        storeCode: 'CM True Digital',
        orderType: 'ซื้อกลับบ้าน',
        tableName: '회원주문 · ประวัตร · M007359',
        memo: '[회원주문] · 회원 주문입니다 · 픽업희망:2026-06-23 15:02 · 회원:ประวัตร · 번호:M007359',
        items: [{ id: '1', name: 'GOLDEN FRIED CHICKEN', price: 219, qty: 1 }],
        subtotal: 219,
        discountAmt: 0,
        total: 219,
      },
      t: (k) =>
        ({
          posOrderTypeTakeout: 'ซื้อกลับบ้าน',
          posOrderTypeDineIn: 'ทานที่ร้าน',
          posMemberPortalOrder: 'สั่งซื้อสมาชิก',
          posMemberPortalOrderNotice: 'คำสั่งซื้อสมาชิก',
          posPickupAtShort: 'รับสินค้า',
          posMember: 'สมาชิก',
          posMemberNo: 'เลขสมาชิก',
          posCustomerMemo: 'บันทึกจากลูกค้า',
          posTable: 'โต๊ะ',
        })[k] ?? k,
      lang: 'th',
    })
    expect(html).toContain('ซื้อกลับบ้าน')
    expect(html).not.toContain('ทานที่ร้าน')
    expect(html).toContain('สั่งซื้อสมาชิก · ประวัตร · M007359')
    expect(html).toContain('คำสั่งซื้อสมาชิก')
    expect(html).not.toContain('회원 주문입니다')
  })

  it('shows Amount Before VAT + VAT when receiptVatDisplayAmt is coerced 0 (separate VAT)', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '100120260724001',
        storeCode: '1001',
        orderType: 'dine_in',
        tableName: '1',
        memo: '',
        items: [{ id: '1', name: 'Bibimbap C', price: 100, qty: 1 }],
        subtotal: 100,
        discountAmt: 0,
        total: 118,
        vatFeeAmt: 7.7,
        vatFeeMode: 'separate',
        receiptVatDisplayAmt: 0,
        serviceFeeAmt: 10,
        serviceFeeMode: 'separate',
      },
      t: (k) => k,
      lang: 'en',
      printerSettings: { vatRate: 7, serviceRate: 10 } as never,
    })
    expect(html).not.toMatch(/Tax Invoice/i)
    expect(html).toContain('Amount Before VAT')
    expect(html).toContain('110.00')
    expect(html).toContain('VAT (7%)')
    expect(html).toContain('7.70')
    expect(html).toContain('+0.30')
    expect(html).not.toContain('+8.00')
  })
})
