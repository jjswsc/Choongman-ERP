import { describe, expect, it } from 'vitest'
import {
  buildKitchenHallStyleSlipLines,
  mapKitchenSlipGroupItemsForPrint,
  parseKitchenSplitPromoLineName,
} from './pos-kitchen-slip-display'
import { formatKitchenSlipItemRowHtml } from './pos-kitchen-slip-html'
import { buildGrabPosCatalog } from './grab-pos-order-enrich'
import type { KitchenSlipRoutingItem } from './pos-kitchen-slip-routing'

describe('pos-kitchen-slip-display', () => {
  it('parseKitchenSplitPromoLineName handles menu code prefix', () => {
    const parsed = parseKitchenSplitPromoLineName('[C001] [Set 1] GOLDEN FRIED CHICKEN')
    expect(parsed).toEqual({
      codePrefix: '[C001] ',
      parentLabel: 'Set 1',
      childLabel: 'GOLDEN FRIED CHICKEN',
    })
  })

  it('groups split promo children under set header and keeps station-specific children', () => {
    const orderItems: KitchenSlipRoutingItem[] = [
      {
        id: 'set-1',
        name: '[April] Set 1',
        qty: 1,
        promoItems: [
          { menuId: 'rice', menuName: 'Rice', optionId: null, quantity: 1 },
          { menuId: 'chicken', menuName: 'GOLDEN FRIED CHICKEN', optionId: null, optionName: 'S Boneless', quantity: 1 },
        ],
      },
    ]
    const slipItems: KitchenSlipRoutingItem[] = [
      {
        id: 'set-1-k1',
        name: '[Set 1] GOLDEN FRIED CHICKEN (S Boneless)',
        qty: 1,
        kitchenRouteMenuId: 'chicken',
        kitchenPromoGroupId: 'set-1',
        kitchenPromoParentName: '[April] Set 1',
        kitchenPromoParentQty: 1,
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      orderItems,
      menuNameByMenuId: { chicken: 'GOLDEN FRIED CHICKEN' },
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].name).toContain('Set 1')
    expect(lines[0].qty).toBe(1)
    expect(lines[0].promoComposeLines).toEqual(['GOLDEN FRIED CHICKEN (S Boneless) x1'])
  })

  it('recovers split set-child name from slip label when menuId is missing in store-scoped map (no #26)', () => {
    // 회귀: 매장 판매목록(store-scoped)에 세트 전용 구성품(26/29)이 없어 menuNameByMenuId 조회가 비면
    // 주방 슬립이 `#26`/`#29` 로 찍히던 문제. 줄 이름에 이미 들어 있는 사람이 읽는 이름으로 폴백해야 한다.
    const slipItems: KitchenSlipRoutingItem[] = [
      {
        id: 'set-2-k1',
        name: '[Choongman Festival Set 2] GOLDEN FRIED CHICKEN (S Boneless)',
        qty: 1,
        kitchenRouteMenuId: '26',
        kitchenPromoGroupId: 'set-2',
        kitchenPromoParentName: 'Choongman Festival Set 2',
        kitchenPromoParentQty: 1,
      },
      {
        id: 'set-2-k2',
        name: '[Choongman Festival Set 2] KIMCHI SOUP With Rice',
        qty: 1,
        kitchenRouteMenuId: '29',
        kitchenPromoGroupId: 'set-2',
        kitchenPromoParentName: 'Choongman Festival Set 2',
        kitchenPromoParentQty: 1,
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      // 26/29 가 없는 매장 스코프 맵
      menuNameByMenuId: {},
    })
    const compose = lines.flatMap((l) => l.promoComposeLines ?? [])
    const composeText = compose.join('\n')
    expect(composeText).toContain('GOLDEN FRIED CHICKEN')
    expect(composeText).toContain('KIMCHI SOUP')
    expect(composeText).not.toContain('#26')
    expect(composeText).not.toContain('#29')
  })

  it('keeps same-menu different-size singles as separate kitchen lines (not merged by code prefix)', () => {
    // 라우팅 후(withKitchenCodeName) 단품에도 `[SC001]` 코드 접두가 붙는다.
    // 같은 메뉴(코드 동일) 다른 사이즈 두 단품이 promo 부모(SC001)로 오인되어 합쳐지면 안 된다.
    const slipItems: KitchenSlipRoutingItem[] = [
      { id: 'soy-s', name: '[SC001] SOY SAUCE CHICKEN (S Boneless)', qty: 1, note: 'S Boneless' },
      { id: 'soy-m', name: '[SC001] SOY SAUCE CHICKEN (M Boneless)', qty: 1, note: 'M Boneless' },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      menuNameByMenuId: { soy: 'SOY SAUCE CHICKEN' },
      menuCodeByMenuId: { soy: 'SC001' },
    })
    expect(lines).toHaveLength(2)
    expect(lines.every((l) => l.qty === 1)).toBe(true)
    const noteText = lines.map((l) => `${l.name} ${l.note ?? ''} ${(l.promoComposeLines ?? []).join(' ')}`).join('\n')
    expect(noteText).toContain('S Boneless')
    expect(noteText).toContain('M Boneless')
  })

  it('falls back to name-embedded size when optc code lookup fails (no intermittent size drop)', () => {
    // optc:CODE 가 옵션맵에 없을 때(일시적 fetch 실패/콜드 캐시) 사이즈가 사라지면 안 된다.
    // 이름에 (S Boneless) 가 있으므로 그대로 폴백해야 한다(홀과 동일 값).
    const slipItems: KitchenSlipRoutingItem[] = [
      {
        id: 'soy-s',
        name: 'SOY SAUCE CHICKEN (S Boneless)',
        qty: 1,
        note: 'optc:C999-1',
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      menuNameByMenuId: { soy: 'SOY SAUCE CHICKEN' },
      // optionNameByCode 비움 → C999-1 해석 실패 상황 재현
      optionNameByCode: new Map<string, string>(),
    })
    expect(lines).toHaveLength(1)
    expect(`${lines[0].name} ${lines[0].note ?? ''}`).toContain('S Boneless')
  })

  it('resolves promo optionCode and hides raw code-only parent note', () => {
    const catalog = buildGrabPosCatalog(
      [],
      [{ optionCode: 'C011-1', name: 'S Boneless' }, { optionCode: 'C011-5', name: 'Pickled Radish' }]
    )
    const orderItems: KitchenSlipRoutingItem[] = [
      {
        id: 'line-c011',
        name: 'GOLDEN FRIED CHICKEN',
        qty: 1,
        promoItems: [
          { menuId: 'chicken', menuName: 'GOLDEN FRIED CHICKEN', optionId: null, optionCode: 'C011-1', quantity: 1 },
        ],
      },
    ]
    const slipItems: KitchenSlipRoutingItem[] = [
      {
        id: 'line-c011-k1',
        name: '[GOLDEN FRIED CHICKEN] GOLDEN FRIED CHICKEN',
        qty: 1,
        note: 'optc:C011-1',
        kitchenPromoGroupId: 'line-c011',
        kitchenPromoParentName: 'GOLDEN FRIED CHICKEN',
        kitchenPromoParentQty: 1,
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      orderItems,
      optionNameByCode: catalog.optionNameByCode,
      grabInbound: false,
    })
    expect(lines[0].promoComposeLines).toEqual(['GOLDEN FRIED CHICKEN (S Boneless) x1'])
    expect(lines[0].note).toBeUndefined()
  })

  it('matches promo parent by stripped bracket tag and keeps decorated set name', () => {
    const orderItems: KitchenSlipRoutingItem[] = [
      {
        id: 'promo-order-1',
        name: '[April] Set 2',
        qty: 1,
        promoItems: [{ menuId: '8', menuName: 'SNOW ONION', optionId: null, quantity: 1 }],
      },
    ]
    const slipItems: KitchenSlipRoutingItem[] = [
      {
        id: 'promo-order-1-k1',
        name: '[Set 2] SNOW ONION (M - Joint Wing)',
        qty: 1,
        kitchenPromoGroupId: '',
        kitchenPromoParentName: 'Set 2',
        kitchenPromoParentQty: 1,
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, { orderItems })
    expect(lines[0].name).toBe('[April] Set 2')
  })

  it('maps code-like regular line names to menu names', () => {
    const slipItems: KitchenSlipRoutingItem[] = [
      { id: 'line-1', name: 'C008', qty: 1, note: 'SNOW ONION (M - Joint Wing) x1' },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      menuNameByMenuId: { '8': 'SNOW ONION' },
      menuCodeByMenuId: { '8': 'C008' },
    })
    expect(lines[0].name).toBe('SNOW ONION')
  })

  it('grab banban compose shows flavor only without repeating menu name', () => {
    const orderItems: KitchenSlipRoutingItem[] = [
      {
        id: 'grab:banban',
        name: 'Banban Chicken',
        qty: 1,
        promoItems: [
          {
            menuId: '24',
            menuName: 'Banban Chicken',
            optionId: null,
            optionName: 'SOY SAUCE CHICKEN',
            quantity: 1,
          },
          {
            menuId: '24',
            menuName: 'Banban Chicken',
            optionId: null,
            optionName: 'Kimchi',
            quantity: 1,
          },
        ],
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(orderItems, {
      orderItems,
      grabInbound: true,
    })
    expect(lines[0].promoComposeLines).toEqual(['SOY SAUCE CHICKEN x1', 'Kimchi x1'])
  })

  it('splits grab promo options onto separate compose lines', () => {
    const catalog = buildGrabPosCatalog(
      [],
      [
        { optionCode: 'C011-3', name: 'SOY SAUCE AND SPRING ONION CHICKEN' },
        { optionCode: 'C011-4', name: 'CURRYCANE' },
        { optionCode: 'C011-5', name: 'Kimchi' },
      ]
    )
    const orderItems: KitchenSlipRoutingItem[] = [
      {
        id: 'grab:line-1',
        name: 'Banban Chicken',
        qty: 1,
        note: 'optc:C011-3, C011-4, C011-5',
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(orderItems, {
      orderItems,
      optionNameByCode: catalog.optionNameByCode,
      grabInbound: true,
    })
    expect(lines[0].note).toContain('SOY SAUCE')
    expect(lines[0].note?.split('\n')).toHaveLength(3)
  })

  it('resolves long grab menu codes to menu names', () => {
    const slipItems: KitchenSlipRoutingItem[] = [
      { id: 'grab:line-2', name: '260485-S01', qty: 1, note: 'PEPSI MEGA 1 x1' },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      menuNameByMenuId: { '99': 'PEPSI MEGA 1' },
      menuCodeByMenuId: { '99': '260485-S01' },
      grabInbound: true,
    })
    expect(lines[0].name).toBe('PEPSI MEGA 1')
  })

  it('derives menu name from grab note when code mapping is missing', () => {
    const slipItems: KitchenSlipRoutingItem[] = [
      { id: 'grab:line-3', name: '260457-S01', qty: 1, note: 'PEPSI MEGA 1 x1' },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      grabInbound: true,
    })
    expect(lines[0].name).toBe('PEPSI MEGA 1')
    expect(lines[0].note).toBeUndefined()
  })

  it('treats grab promo code as menu code mapping source', () => {
    const orderItems: KitchenSlipRoutingItem[] = [
      {
        id: 'promo-1',
        name: 'PEPSI MEGA 2',
        qty: 1,
        promoCode: '260457-S02',
      },
    ]
    const slipItems: KitchenSlipRoutingItem[] = [
      { id: 'grab:line-4', name: '260457-S02', qty: 1 },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      orderItems,
      grabInbound: true,
    })
    expect(lines[0].name).toBe('PEPSI MEGA 2')
  })

  it('maps code-like grouped parent names to menu names from compose lines', () => {
    const slipItems: KitchenSlipRoutingItem[] = [
      {
        id: 'grp-1-k1',
        name: '[C008] [C008] SNOW ONION (M - Joint Wing)',
        qty: 1,
        kitchenPromoGroupId: 'grp-1',
        kitchenPromoParentName: 'C008',
        kitchenPromoParentQty: 1,
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      menuNameByMenuId: { '8': 'SNOW ONION' },
      menuCodeByMenuId: { '8': 'C008' },
    })
    expect(lines[0].name).toBe('SNOW ONION')
  })

  it('keeps name-parsed option when item has no optionCode (no inference, value already in name)', () => {
    const slipItems: KitchenSlipRoutingItem[] = [
      { id: 'cart-banban-1', name: 'Banban Chicken (CURRY SNOW ONION / CURRYCANE)', qty: 1 },
      { id: 'cart-snow-1', name: 'SNOW ONION (M - Drumette)', qty: 1 },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, { grabInbound: false })
    expect(lines[0].name).toBe('Banban Chicken')
    expect(lines[0].note).toBe('CURRY SNOW ONION / CURRYCANE')
    expect(lines[1].name).toBe('SNOW ONION')
    expect(lines[1].note).toBe('M - Drumette')
  })

  it('grab set compose infers default S when promoItems have menuId but no optionName', () => {
    const catalog = buildGrabPosCatalog(
      [{ id: 7, name: 'RED HOT CHICKEN', code: 'C007' }],
      [
        { optionCode: 'C007-1', name: 'S - Boneless' },
        { optionCode: 'C007-3', name: 'M - Boneless' },
      ]
    )
    const orderItems: KitchenSlipRoutingItem[] = [
      {
        id: 'grab:set-3',
        name: '[April] Set 3',
        qty: 1,
        promoItems: [
          { menuId: '22', menuName: 'Rice', optionId: null, quantity: 1 },
          { menuId: '7', menuName: 'RED HOT CHICKEN', optionId: null, quantity: 1 },
        ],
      },
    ]
    const slipItems: KitchenSlipRoutingItem[] = [
      {
        id: 'grab:set-3-k1',
        name: '[[April] Set 3] RED HOT CHICKEN',
        qty: 1,
        kitchenRouteMenuId: '7',
        kitchenPromoGroupId: 'grab:set-3',
        kitchenPromoParentName: '[April] Set 3',
        kitchenPromoParentQty: 1,
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      orderItems,
      grabInbound: true,
      menuNameByMenuId: { '7': 'RED HOT CHICKEN', '22': 'Rice' },
      menuCodeByMenuId: { '7': 'C007', '22': 'C022' },
      optionNameByCode: catalog.optionNameByCode,
    })
    expect(lines[0].promoComposeLines).toEqual(['RED HOT CHICKEN (S - Boneless) x1'])
  })

  it('mapKitchenSlipGroupItemsForPrint keeps Size S on standalone grab chicken (GF-897)', () => {
    const catalog = buildGrabPosCatalog(
      [{ id: 8, name: 'GUCHUJANG Bar.B.Q FRIED CHICKEN', code: 'C008' }],
      [
        { optionCode: 'C008-1', name: 'Size S' },
        { optionCode: 'C008-5', name: 'Pickled Radish' },
      ]
    )
    const rows = mapKitchenSlipGroupItemsForPrint(
      [
        {
          id: 'grab:gfc',
          name: 'GUCHUJANG Bar.B.Q FRIED CHICKEN',
          qty: 1,
          note: 'mods:Size S,Pickled Radish · optc:C008-1',
          optionCode1: 'C008-1',
        },
      ],
      {
        grabInbound: true,
        optionNameByCode: catalog.optionNameByCode,
        translateName: (n) => n,
      }
    )
    expect(rows[0].note).toContain('Size S')
    expect(rows[0].note).toContain('Pickled Radish')
    const html = formatKitchenSlipItemRowHtml(rows[0], (s) => s, (tag) => `</${tag}>`)
    expect(html).toContain('GUCHUJANG Bar.B.Q FRIED CHICKEN')
    expect(html).toContain('Size S')
    expect(html).toContain('Pickled Radish')
  })

  it('grab line resolves optionCode when note is empty', () => {
    const catalog = buildGrabPosCatalog(
      [],
      [
        { optionCode: 'C011-2', name: 'M - Drumette' },
        { optionCode: 'C011-1', name: 'S Boneless' },
      ]
    )
    const lines = buildKitchenHallStyleSlipLines(
      [{ id: 'grab:line-chicken', name: 'SPICY YANGNYEOM', qty: 1, optionCode1: 'C011-2' }],
      {
        grabInbound: true,
        optionNameByCode: catalog.optionNameByCode,
      }
    )
    expect(lines[0].name).toBe('SPICY YANGNYEOM')
    expect(lines[0].note).toContain('Drumette')
  })
})
