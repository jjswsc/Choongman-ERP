import { describe, expect, it } from 'vitest'
import {
  enrichBanbanKitchenLineForPrint,
  expandBanbanComposeLineForPrint,
  extractGrabBanbanFlavorSlotsFromModifiers,
  filterReceiptOptionLinesForBanban,
  getBanbanFlavorMenuList,
  isBanbanMenu,
  isBanbanFlavorWhitelistMissing,
  parseBanbanFlavorsFromDisplayName,
  parseBanbanFlavorsFromName,
  resolveBanbanFlavorPairForKitchenPrint,
  splitBanbanSlashOptionParts,
} from './pos-banban-utils'

describe('parseBanbanFlavorsFromName', () => {
  it('기본 패턴 "Base (A / B)" 두 가지 맛을 분리한다', () => {
    expect(parseBanbanFlavorsFromName('Banban Chicken (S Boneless / M Boneless)')).toEqual({
      baseName: 'Banban Chicken',
      flavor1: 'S Boneless',
      flavor2: 'M Boneless',
    })
  })

  it('한국어 메뉴명도 처리한다', () => {
    expect(parseBanbanFlavorsFromName('반반 (양념 / 후라이드)')).toEqual({
      baseName: '반반',
      flavor1: '양념',
      flavor2: '후라이드',
    })
  })

  it('단일 옵션(슬래시 없음)은 반반이 아니다', () => {
    expect(parseBanbanFlavorsFromName('Chicken (M)')).toBeNull()
  })

  it('맛이 3개 이상이면 반반이 아니다', () => {
    expect(parseBanbanFlavorsFromName('Combo (A / B / C)')).toBeNull()
  })

  it('빈/괄호 없는 이름은 반반이 아니다', () => {
    expect(parseBanbanFlavorsFromName('Banban Chicken')).toBeNull()
    expect(parseBanbanFlavorsFromName('')).toBeNull()
    expect(parseBanbanFlavorsFromName(null)).toBeNull()
    expect(parseBanbanFlavorsFromName(undefined)).toBeNull()
  })

  it('기본명이 비어 있으면 null', () => {
    expect(parseBanbanFlavorsFromName('(A / B)')).toBeNull()
  })
})

describe('splitBanbanSlashOptionParts', () => {
  it('슬래시 2맛을 분리한다', () => {
    expect(splitBanbanSlashOptionParts('CHEESE TORNADO / GARLIC Bar.B.Q FRIED CHICKEN')).toEqual([
      'CHEESE TORNADO',
      'GARLIC Bar.B.Q FRIED CHICKEN',
    ])
  })

  it('3맛 이상이면 null', () => {
    expect(splitBanbanSlashOptionParts('A / B / C')).toBeNull()
  })
})

describe('expandBanbanComposeLineForPrint', () => {
  it('compose 줄을 맛별 줄로 펼친다', () => {
    expect(
      expandBanbanComposeLineForPrint(
        'Banban Chicken (CHEESE TORNADO / GARLIC Bar.B.Q FRIED CHICKEN) x1'
      )
    ).toEqual(['CHEESE TORNADO x1', 'GARLIC Bar.B.Q FRIED CHICKEN x1'])
  })

  it('반반 패턴이 아니면 null', () => {
    expect(expandBanbanComposeLineForPrint('Rice x1')).toBeNull()
  })
})

describe('isBanbanMenu', () => {
  it('Bar.B.Q류 코드(bb-q-…)는 반반으로 보지 않는다', () => {
    expect(
      isBanbanMenu({
        isBanban: false,
        code: 'BB-Q-001',
        name: 'GUCHUJANG Bar.B.Q',
      })
    ).toBe(false)
  })

  it('이름·코드에 banban이 있으면 반반으로 본다', () => {
    expect(
      isBanbanMenu({
        isBanban: false,
        code: 'bb-banban-x',
        name: 'x',
      })
    ).toBe(true)
  })
})

describe('getBanbanFlavorMenuList', () => {
  const banbanMenu = {
    id: '100',
    code: 'C024',
    name: 'Banban Chicken',
    category: 'Banban',
    categoryMain: 'Chicken',
    price: 259,
    imageUrl: '',
    vatIncluded: true,
    isActive: true,
    sortOrder: 0,
    isBanban: true,
  }

  const soyMenu = {
    id: '1',
    code: 'C001',
    name: 'Soy Sauce Chicken',
    category: 'Original',
    categoryMain: 'Chicken',
    price: 229,
    imageUrl: '',
    vatIncluded: true,
    isActive: true,
    sortOrder: 1,
  }

  const supremeMenu = {
    id: '2',
    code: 'C099',
    name: 'Supreme Chicken',
    category: 'SPECIALTIES',
    categoryMain: 'Chicken',
    price: 259,
    imageUrl: '',
    vatIncluded: true,
    isActive: true,
    sortOrder: 2,
  }

  it('whitelist가 있으면 연결된 맛만 반환한다', () => {
    const list = getBanbanFlavorMenuList(
      [
        { ...banbanMenu, banbanFlavorMenuIds: ['2'] },
        soyMenu,
        supremeMenu,
      ],
      { ...banbanMenu, banbanFlavorMenuIds: ['2'] },
      '2026-05-26'
    )
    expect(list.map((menu) => menu.id)).toEqual(['2'])
  })

  it('whitelist가 비어 있으면 설정 필요 상태로 판단할 수 있다', () => {
    expect(isBanbanFlavorWhitelistMissing({ banbanFlavorMenuIds: [] })).toBe(true)
    expect(
      getBanbanFlavorMenuList(
        [
          { ...banbanMenu, banbanFlavorMenuIds: [] },
          soyMenu,
          supremeMenu,
        ],
        { ...banbanMenu, banbanFlavorMenuIds: [] },
        '2026-05-26'
      )
    ).toEqual([])
  })

  it('whitelist가 없으면 기존 자동 후보 로직으로 폴백한다', () => {
    const list = getBanbanFlavorMenuList(
      [
        banbanMenu,
        soyMenu,
        supremeMenu,
      ],
      banbanMenu,
      '2026-05-26'
    )
    expect(list.map((menu) => menu.id)).toEqual(['1', '2'])
  })
})

describe('parseBanbanFlavorsFromDisplayName', () => {
  it('Grab 콤마 3항목(맛2+Kimchi)에서 맛 2개만 추출한다', () => {
    expect(
      parseBanbanFlavorsFromDisplayName(
        'Banban Chicken (CHEESE TORNADO, GARLIC Bar.B.Q FRIED CHICKEN, Kimchi)'
      )
    ).toEqual({
      baseName: 'Banban Chicken',
      flavor1: 'CHEESE TORNADO',
      flavor2: 'GARLIC Bar.B.Q FRIED CHICKEN',
    })
  })
})

describe('extractGrabBanbanFlavorSlotsFromModifiers', () => {
  it('modifier id 만 있을 때 menuNameById 로 맛 이름을 복원한다', () => {
    const menuNameById = new Map<number, string>([
      [6, 'CHEESE TORNADO'],
      [73, 'GARLIC Bar.B.Q FRIED CHICKEN'],
    ])
    expect(
      extractGrabBanbanFlavorSlotsFromModifiers(
        [
          { id: 'mod-c024-1-item-75-c024-1' },
          { id: 'item-75-c024-banban-1-f-6' },
          { id: 'item-75-c024-banban-2-f-73' },
        ],
        menuNameById
      )
    ).toEqual({
      flavors: ['CHEESE TORNADO', 'GARLIC Bar.B.Q FRIED CHICKEN'],
      flavorMenuIds: ['6', '73'],
    })
  })
})

describe('resolveBanbanFlavorPairForKitchenPrint grab comma legacy', () => {
  it('mods note 3항목(맛2+Kimchi)에서 맛 2개를 복원한다', () => {
    expect(
      resolveBanbanFlavorPairForKitchenPrint({
        id: 'grab:item-75-c024',
        name: 'Banban Chicken (CHEESE TORNADO, GARLIC Bar.B.Q FRIED CHICKEN, Kimchi)',
        note: 'mods:CHEESE TORNADO,GARLIC Bar.B.Q FRIED CHICKEN,Kimchi · optc:C024-1',
        menuId1: '75',
      })
    ).toEqual({
      flavor1: 'CHEESE TORNADO',
      flavor2: 'GARLIC Bar.B.Q FRIED CHICKEN',
    })
  })
})

describe('filterReceiptOptionLinesForBanban', () => {
  it('removes slash-combined and per-flavor duplicates', () => {
    const banban = { flavor1: 'SNOW ONION', flavor2: 'CHEESE TORNADO' }
    expect(
      filterReceiptOptionLinesForBanban(
        ['SNOW ONION / CHEESE TORNADO', 'Pickled Radish', 'SNOW ONION', 'CHEESE TORNADO'],
        banban
      )
    ).toEqual(['Pickled Radish'])
  })
})

describe('resolveBanbanFlavorPairForKitchenPrint', () => {
  const menus = [
    { id: '11', name: 'GOLDEN FRIED CHICKEN', code: 'C011' },
    { id: '12', name: 'SOY SAUCE CHICKEN', code: 'C001' },
    { id: '24', name: 'Banban Chicken', code: 'C024', isBanban: true },
  ]

  it('menuId1·menuId2 로 재인쇄 맛을 복원한다', () => {
    expect(
      resolveBanbanFlavorPairForKitchenPrint(
        {
          id: 'banban-11-12',
          name: 'Banban Chicken',
          menuId1: '11',
          menuId2: '12',
        },
        menus
      )
    ).toEqual({
      flavor1: 'GOLDEN FRIED CHICKEN',
      flavor2: 'SOY SAUCE CHICKEN',
    })
  })

  it('banbanFlavors note 토큰으로 재인쇄 맛을 복원한다', () => {
    expect(
      resolveBanbanFlavorPairForKitchenPrint({
        id: 'grab:gf-010',
        name: 'Banban Chicken',
        note: 'mods:Pickled Radish · banbanFlavors:SWEET YANGNYEOM,SOY SAUCE CHICKEN',
      })
    ).toEqual({
      flavor1: 'SWEET YANGNYEOM',
      flavor2: 'SOY SAUCE CHICKEN',
    })
  })

  it('Grab mods note 로 맛을 복원한다', () => {
    expect(
      resolveBanbanFlavorPairForKitchenPrint(
        {
          id: 'grab:item-24-banban',
          name: 'Banban Chicken',
          note: 'mods:CURRY SNOW ONION,CURRYCANE',
        },
        menus
      )
    ).toEqual({
      flavor1: 'CURRY SNOW ONION',
      flavor2: 'CURRYCANE',
    })
  })

  it('enrichBanbanKitchenLineForPrint 는 이름에 슬래시 맛을 붙인다', () => {
    expect(
      enrichBanbanKitchenLineForPrint(
        {
          id: 'banban-11-12',
          name: 'Banban Chicken',
          menuId1: '11',
          menuId2: '12',
        },
        menus
      ).name
    ).toBe('Banban Chicken (GOLDEN FRIED CHICKEN / SOY SAUCE CHICKEN)')
  })
})
