import { describe, expect, it } from 'vitest'
import type { PosMenu, PosPromoWithItems } from '@/lib/api-client'
import { buildPosPaymentReceiptDocumentHtml } from '@/lib/pos-payment-receipt-document-html'
import { enrichReceiptModalItemsForPromoDisplay } from '@/lib/pos-payment-receipt-from-order'

const menus: PosMenu[] = [
  {
    id: '7',
    code: 'C007',
    name: 'SNOW ONION',
    category: 'Chicken',
    price: 0,
    imageUrl: '',
    vatIncluded: true,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: '8',
    code: 'C008',
    name: 'SPICY YANGNYEOM',
    category: 'Chicken',
    price: 0,
    imageUrl: '',
    vatIncluded: true,
    isActive: true,
    sortOrder: 2,
  },
  {
    id: '22',
    code: 'C022',
    name: 'Rice',
    category: 'Side',
    price: 30,
    imageUrl: '',
    vatIncluded: true,
    isActive: true,
    sortOrder: 3,
  },
  {
    id: '41',
    code: 'C041',
    name: 'Pepsi',
    category: 'Drink',
    price: 0,
    imageUrl: '',
    vatIncluded: true,
    isActive: true,
    sortOrder: 4,
  },
  {
    id: '33',
    code: 'C033',
    name: 'Kimchi 30 g.',
    category: 'Side',
    price: 0,
    imageUrl: '',
    vatIncluded: true,
    isActive: true,
    sortOrder: 5,
  },
]

const promoCatalogById = new Map<string, PosPromoWithItems>([
  [
    '35',
    {
      id: '35',
      code: 'SP-SUDSA1',
      name: 'สุดซ่า 1',
      items: [
        { menuId: '7', optionId: '1', menuName: 'SNOW ONION', quantity: 1, choiceGroup: null },
        { menuId: '8', optionId: '2', menuName: 'SPICY YANGNYEOM', quantity: 1, choiceGroup: null },
        { menuId: '22', optionId: null, menuName: 'Rice', quantity: 1, choiceGroup: null },
        { menuId: '41', optionId: null, menuName: 'Pepsi', quantity: 1, choiceGroup: null },
      ],
    } as PosPromoWithItems,
  ],
])

describe('Grab payment receipt promo compose (GF-636 / The Street)', () => {
  it('enrichReceiptModalItemsForPromoDisplay keeps id-only promo lines when some lines are named', () => {
    const items = [
      {
        id: 'grab:line-1',
        name: 'สุดซ่า 1',
        price: 388,
        qty: 1,
        promoId: '35',
        deliveryAppCode: 'grab',
        promoItems: [
          { menuId: '7', optionId: '1', menuName: 'SNOW ONION', optionName: 'Size S', quantity: 1 },
          { menuId: '8', optionId: '2', menuName: '', quantity: 1 },
          { menuId: '22', optionId: null, menuName: '', quantity: 1 },
          { menuId: '41', optionId: null, menuName: '', quantity: 1 },
        ],
      },
    ]
    const enriched = enrichReceiptModalItemsForPromoDisplay(items, {
      promoCatalogById,
      menus,
      memo: 'grab_order:GF-636',
      deliveryAppCode: 'grab',
    })
    expect(enriched[0]?.promoItems).toHaveLength(4)
  })

  it('payment receipt prints all Grab set components under promo header', () => {
    const items = enrichReceiptModalItemsForPromoDisplay(
      [
        {
          id: 'grab:line-1',
          name: 'สุดซ่า 1',
          price: 388,
          qty: 1,
          promoId: '35',
          deliveryAppCode: 'grab',
          promoItems: [
            { menuId: '7', optionId: '1', menuName: 'SNOW ONION', optionName: 'Size S', quantity: 1 },
            { menuId: '8', optionId: '2', menuName: 'SPICY YANGNYEOM', optionName: 'Size S', quantity: 1 },
            { menuId: '22', optionId: null, menuName: 'Rice', quantity: 1 },
            { menuId: '41', optionId: null, menuName: 'Pepsi', quantity: 1 },
          ],
        },
        { id: 'grab:line-2', name: 'Rice', price: 30, qty: 1, deliveryAppCode: 'grab' },
      ],
      { promoCatalogById, menus, memo: 'grab_order:GF-636', deliveryAppCode: 'grab' }
    )
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData: {
        orderNo: 'CMTHESTREET-20260626-099',
        storeCode: 'The Street',
        orderType: 'delivery',
        tableName: 'Grab #GF-636',
        memo: 'grab_order:GF-636',
        deliveryAppCode: 'grab',
        items,
        subtotal: 418,
        discountAmt: 145,
        total: 273,
        paymentDeliveryApp: 273,
        receiptAutoPrintContext: 'payment',
      },
      menus,
      orderTypeLabels: { delivery: 'Delivery' },
      t: (k) => k,
      lang: 'en',
      origin: 'https://example.com',
      printedAt: new Date('2026-06-27T00:01:00+07:00'),
    })
    expect(html).toContain('SNOW ONION')
    expect(html).toContain('SPICY YANGNYEOM')
    expect(html).toContain('Rice x1')
    expect(html).toContain('Pepsi x1')
  })

  it('REAL GF-636 snapshot (id 33485) renders all set parts even with empty menus cache', () => {
    // 실제 DB pos_orders.items_json 그대로 (menus 캐시가 비어 있어도 menuName 스냅샷으로 출력돼야 함)
    const realItems = [
      {
        id: 'grab:item-355-260457-s02',
        name: 'สุดซ่า 1',
        price: 388,
        qty: 1,
        note: 'eco:no plastic cutlery requested',
        promoId: '35',
        promoCode: '260457-S02',
        deliveryAppCode: 'grab',
        lineDiscountAmt: 134.59,
        promoItems: [
          { menuId: '11', optionId: null, menuName: 'SNOW ONION', quantity: 1, optionName: 'Size S', menuCode: 'C008' },
          { menuId: '28', optionId: null, menuName: 'SPICY YANGNYEOM', quantity: 1, optionName: 'Size S', menuCode: 'C013' },
          { menuId: '22', optionId: null, menuName: 'Rice', quantity: 1, menuCode: 'S010' },
          { menuId: '52', optionId: null, menuName: 'Pepsi', quantity: 1, menuCode: 'D008' },
        ],
      },
      { id: 'grab:item-22-s010', name: 'Rice', price: 30, qty: 1, deliveryAppCode: 'grab', lineDiscountAmt: 10.41 },
    ]
    const items = enrichReceiptModalItemsForPromoDisplay(realItems, {
      menus: [],
      memo: 'grab_order:00101796574-C8BEVPBUANUTVT|grab_state:DELIVERED',
      deliveryAppCode: 'grab',
    })
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData: {
        orderNo: 'CMTHESTREET-20260626-099',
        storeCode: 'CM The street',
        orderType: 'delivery',
        tableName: 'Grab #GF-636 · Delivery · Kanchana · ID BUANUTVT',
        memo: 'grab_order:00101796574-C8BEVPBUANUTVT|grab_state:DELIVERED',
        deliveryAppCode: 'grab',
        items,
        subtotal: 418,
        discountAmt: 145,
        total: 273,
        paymentDeliveryApp: 273,
        receiptAutoPrintContext: 'payment',
      },
      menus: [],
      orderTypeLabels: { delivery: 'Delivery' },
      t: (k) => k,
      lang: 'en',
      origin: 'https://example.com',
      printedAt: new Date('2026-06-27T00:01:00+07:00'),
    })
    expect(html).toContain('SNOW ONION')
    expect(html).toContain('SPICY YANGNYEOM')
    expect(html).toContain('Rice x1')
    expect(html).toContain('Pepsi x1')
  })

  it('[111] set payment receipt shows sidedish and chicken from promoItems snapshot', () => {
    const items = enrichReceiptModalItemsForPromoDisplay(
      [
        {
          id: 'grab:set-111',
          name: '[111] Set 2 Soy Sauce Chicken',
          price: 159,
          qty: 1,
          promoId: '111',
          deliveryAppCode: 'grab',
          promoItems: [
            { menuId: '33', optionId: null, menuName: 'Kimchi 30 g.', quantity: 1 },
            {
              menuId: '5',
              optionId: '3',
              menuName: 'SOY SAUCE CHICKEN',
              optionName: 'Size S',
              quantity: 1,
            },
          ],
        },
      ],
      { promoCatalogById, menus, memo: 'grab_order:GF-877', deliveryAppCode: 'grab' }
    )
    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData: {
        orderNo: 'CMTHESTREET-20260626-079',
        storeCode: 'The Street',
        orderType: 'delivery',
        tableName: 'Grab #GF-877',
        memo: 'grab_order:GF-877',
        deliveryAppCode: 'grab',
        items,
        subtotal: 159,
        discountAmt: 48,
        total: 111,
        paymentDeliveryApp: 111,
        receiptAutoPrintContext: 'payment',
      },
      menus,
      orderTypeLabels: { delivery: 'Delivery' },
      t: (k) => k,
      lang: 'en',
      origin: 'https://example.com',
      printedAt: new Date('2026-06-26T21:37:12+07:00'),
    })
    expect(html).toContain('Kimchi 30 g.')
    expect(html).toContain('SOY SAUCE CHICKEN')
    expect(html).toContain('Size S')
  })
})
