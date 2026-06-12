/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import { mapPosOrderRowForKitchenPrint } from '@/lib/pos-kitchen-print-item-map'
import {
  buildKitchenSlipGroupOpts,
  buildKitchenSlipGroups,
  preparePosOrderItemsForKitchenSlip,
  type KitchenSlipRoutingItem,
} from '@/lib/pos-kitchen-slip-routing'
import { mapKitchenSlipGroupItemsForPrint } from '@/lib/pos-kitchen-slip-display'
import { formatGrabLineNoteForKitchenPrint } from '@/lib/grab-pos-order-enrich'
import { buildKitchenSlipItemsHtml, resolveKitchenSlipDesign } from '@/lib/pos-kitchen-slip-html'
import { mergeSetChildrenForReceipt } from '@/lib/pos-hall-order-receipt-document-html'

// 실제 Grab 주문(CM Silom / The Street, 2026-06-12) 데이터를 그대로 주방 인쇄 파이프라인에 흘려
// 맛·사이즈가 주방 슬립 HTML에 남는지 회귀 검증한다.
const MENUS = [
  { id: '11', name: 'SNOW ONION', code: 'C008', category: 'SNOW', categoryMain: 'Chicken' },
  { id: '75', name: 'Banban Chicken', code: 'C024', isBanban: true, category: 'Banban', categoryMain: 'Chicken' },
  { id: '71', name: 'GUCHUJANG Bar.B.Q FRIED CHICKEN', code: 'C020', category: 'Bar.B.Q', categoryMain: 'Chicken' },
  { id: '26', name: 'GOLDEN FRIED CHICKEN', code: 'C011', category: 'ORIGINAL', categoryMain: 'Chicken' },
  { id: '360', name: 'Kimchi 30 g.', code: 'S015', category: 'Side', categoryMain: 'Side' },
  { id: '7', name: 'RED HOT CHICKEN', code: 'C004', category: 'HOT', categoryMain: 'Chicken' },
  { id: '28', name: 'SPICY YANGNYEOM', code: 'C013', category: 'YANG', categoryMain: 'Chicken' },
  { id: '22', name: 'Rice', code: 'S010', category: 'Side', categoryMain: 'Side' },
  { id: '52', name: 'Pepsi', code: 'D008', category: 'Drink', categoryMain: 'Drink' },
] as any[]

const OPTION_MAP = new Map<string, string>([
  ['C008-3', 'M - Boneless'],
  ['C008-5', 'Pickled Radish'],
  ['C024-1', 'Kimchi'],
  ['C024-2', 'Pickled Radish'],
])

function renderKitchenHtml(rawItems: Record<string, unknown>[]): string {
  const mapped = rawItems.map((it) =>
    mapPosOrderRowForKitchenPrint(it, { menus: MENUS, deliveryAppCode: 'grab' })
  )
  const prepared0 = preparePosOrderItemsForKitchenSlip(
    mapped as unknown as KitchenSlipRoutingItem[],
    { menus: MENUS } as any
  )
  const prepared = mergeSetChildrenForReceipt(prepared0 as any, {
    optionNameByCode: OPTION_MAP,
  }) as unknown as KitchenSlipRoutingItem[]
  const groupOpts = buildKitchenSlipGroupOpts({ kitchenMode: 1 }, MENUS, {
    kitchen1: 'ครัว 1',
    kitchen2: 'ครัว 2',
    kitchen3: 'ครัว 3',
  } as any)
  const slips = buildKitchenSlipGroups(prepared, groupOpts)
  const design = resolveKitchenSlipDesign({})
  let html = ''
  for (const slip of slips) {
    const rows = mapKitchenSlipGroupItemsForPrint(slip.items, {
      orderItems: prepared,
      menuNameByMenuId: Object.fromEntries(MENUS.map((m) => [String(m.id), m.name])),
      menuCodeByMenuId: Object.fromEntries(MENUS.map((m) => [String(m.id), m.code])),
      optionNameByCode: OPTION_MAP,
      translateName: (n) => n,
      formatNote: (note?: string) => formatGrabLineNoteForKitchenPrint(note, OPTION_MAP) || undefined,
    })
    html += buildKitchenSlipItemsHtml(rows, (s) => s, design, '', OPTION_MAP)
  }
  return html
}

describe('kitchen print preserves Grab flavor/size (real Silom/The Street data)', () => {
  it('GF-048 standalone SNOW ONION keeps M - Boneless', () => {
    const html = renderKitchenHtml([
      {
        id: 'grab:item-11-c008',
        name: 'SNOW ONION',
        price: 279,
        qty: 1,
        note: 'mods:M - Boneless,Pickled Radish · optc:C008-3,C008-5 · eco:no plastic cutlery requested',
      },
    ])
    expect(html).toContain('SNOW ONION')
    expect(html).toContain('M - Boneless')
  })

  it('GF-054 standalone Banban keeps both flavors', () => {
    const html = renderKitchenHtml([
      {
        id: 'grab:item-75-c024',
        name: 'Banban Chicken (SNOW ONION / GUCHUJANG Bar.B.Q FRIED CHICKEN)',
        price: 279,
        qty: 1,
        note: 'mods:Kimchi · optc:C024-1 · banbanFlavors:SNOW ONION,GUCHUJANG Bar.B.Q FRIED CHICKEN · eco:plastic cutlery requested',
        menuId1: '11',
      },
    ])
    expect(html).toContain('Banban Chicken')
    expect(html).toContain('SNOW ONION')
    expect(html).toContain('GUCHUJANG Bar.B.Q FRIED CHICKEN')
  })

  // 핵심 회귀: 세트명이 닭 메뉴명을 포함해도(예: "Set 1 Golden Fried Chicken") 주방에서
  // 메뉴명을 지우고 "Size S"만 남기면 안 된다.
  it('GF-049 SET 1 keeps GOLDEN FRIED CHICKEN name with size', () => {
    const html = renderKitchenHtml([
      {
        id: 'grab:item-412-260609-s01',
        name: '[111] Set 1 Golden Fried Chicken',
        price: 149,
        qty: 1,
        note: 'eco:no plastic cutlery requested',
        promoId: '51',
        promoCode: '260609-S01',
        promoItems: [
          { menuId: '26', optionId: null, menuName: 'GOLDEN FRIED CHICKEN', quantity: 1, optionName: 'Size S', menuCode: 'C011' },
          { menuId: '360', optionId: null, menuName: 'Kimchi 30 g.', quantity: 1, menuCode: 'S015' },
        ],
      },
    ])
    expect(html).toContain('GOLDEN FRIED CHICKEN')
    expect(html).toContain('Size S')
  })

  it('GF-071 SET 3 keeps RED HOT CHICKEN name with size', () => {
    const html = renderKitchenHtml([
      {
        id: 'grab:item-413-260609-s02',
        name: '[111] Set 3 Red Hot Chicken',
        price: 159,
        qty: 1,
        note: 'eco:no plastic cutlery requested',
        promoId: '52',
        promoCode: '260609-S02',
        promoItems: [
          { menuId: '7', optionId: null, menuName: 'RED HOT CHICKEN', quantity: 1, optionName: 'Size S', menuCode: 'C004' },
          { menuId: '360', optionId: null, menuName: 'Kimchi 30 g.', quantity: 1, menuCode: 'S015' },
        ],
      },
    ])
    expect(html).toContain('RED HOT CHICKEN')
    expect(html).toContain('Size S')
  })

  it('GF-064 multi-chicken set keeps each chicken name with size', () => {
    const html = renderKitchenHtml([
      {
        id: 'grab:item-355-260457-s02',
        name: 'สุดซ่า 1',
        price: 388,
        qty: 1,
        note: 'eco:no plastic cutlery requested',
        promoId: '35',
        promoCode: '260457-S02',
        promoItems: [
          { menuId: '11', optionId: null, menuName: 'SNOW ONION', quantity: 1, optionName: 'Size S', menuCode: 'C008' },
          { menuId: '28', optionId: null, menuName: 'SPICY YANGNYEOM', quantity: 1, optionName: 'Size S', menuCode: 'C013' },
          { menuId: '22', optionId: null, menuName: 'Rice', quantity: 1, menuCode: 'S010' },
          { menuId: '52', optionId: null, menuName: 'Pepsi', quantity: 1, menuCode: 'D008' },
        ],
      },
    ])
    expect(html).toContain('SNOW ONION')
    expect(html).toContain('SPICY YANGNYEOM')
    expect(html).toContain('Size S')
  })
})
