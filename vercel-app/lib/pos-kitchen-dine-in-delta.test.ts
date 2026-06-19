import { describe, expect, it } from 'vitest'
import {
  buildDineInAddKitchenAutoPrintDedupeKey,
  buildDineInAddKitchenPrintDedupeSuffix,
  buildKitchenCartLinesFromSnapshotDelta,
  collectDineInSnapshotIncreasedKeys,
  filterKitchenCartLinesForDineInAdd,
  kitchenSlipSourceItemsForAddOrderReceipt,
  resolveDineInKitchenLinesForAddSubmit,
  resolveDineInKitchenSnapshotItemKey,
} from '@/lib/pos-kitchen-dine-in-delta'

describe('filterKitchenCartLinesForDineInAdd', () => {
  it('returns only new item ids when existing rows have no qty info', () => {
    const cart = [
      { id: 'a', name: 'A', price: 100, quantity: 1 },
      { id: 'b', name: 'B', price: 200, quantity: 1 },
    ]
    expect(filterKitchenCartLinesForDineInAdd(cart, [{ id: 'a' }])).toEqual([
      { id: 'b', name: 'B', price: 200, quantity: 1 },
    ])
  })

  it('returns qty delta for an existing line when qty info is present', () => {
    const cart = [{ id: 'a', name: 'A', price: 100, quantity: 3, qty: 3 }]
    expect(
      filterKitchenCartLinesForDineInAdd(cart, [{ id: 'a', quantity: 1, qty: 1 }])
    ).toEqual([{ id: 'a', name: 'A', price: 100, quantity: 2, qty: 2 }])
  })

  it('includes full qty for newly added lines alongside qty deltas', () => {
    const cart = [
      { id: 'a', name: 'A', price: 100, quantity: 2 },
      { id: 'b', name: 'B', price: 200, quantity: 1 },
    ]
    expect(
      filterKitchenCartLinesForDineInAdd(cart, [
        { id: 'a', quantity: 1 },
        { id: 'c', quantity: 1 },
      ])
    ).toEqual([
      { id: 'a', name: 'A', price: 100, quantity: 1, qty: 1 },
      { id: 'b', name: 'B', price: 200, quantity: 1 },
    ])
  })

  it('returns empty when qty did not increase', () => {
    const cart = [{ id: 'a', name: 'A', price: 100, quantity: 1 }]
    expect(filterKitchenCartLinesForDineInAdd(cart, [{ id: 'a', quantity: 1 }])).toEqual([])
  })

  it('merged save snapshot excludes stale cart duplicate but keeps new lines', () => {
    const existing = [
      { id: 'db-set', name: 'SOY SAUCE BULGOGI SET', price: 250, quantity: 1, qty: 1, menuId: '44' },
    ]
    const mergedSave = [
      ...existing,
      { id: 'cart-stale-set', name: 'SOY SAUCE BULGOGI SET', price: 250, quantity: 1, menuId: '44' },
      { id: 'cart-soup', name: 'Kimchi Soup', price: 199, quantity: 2, menuId: '99' },
    ]
    expect(filterKitchenCartLinesForDineInAdd(mergedSave, existing)).toEqual([
      { id: 'cart-soup', name: 'Kimchi Soup', price: 199, quantity: 2, menuId: '99' },
    ])
  })

  it('matches existing lines by content when cart id changed (cart-* regen)', () => {
    const cart = [
      { id: 'cart-menu1-newuuid', name: 'Budae Jiggae', price: 299, quantity: 1 },
      { id: 'cart-menu2-newuuid', name: 'Banban Chicken', price: 199, quantity: 1 },
    ]
    expect(
      filterKitchenCartLinesForDineInAdd(cart, [
        { id: 'cart-menu1-olduuid', name: 'Budae Jiggae', price: 299, quantity: 1 },
      ])
    ).toEqual([{ id: 'cart-menu2-newuuid', name: 'Banban Chicken', price: 199, quantity: 1 }])
  })

  it('does not re-emit existing lines when note representation drifts (optc vs resolved)', () => {
    // 카트는 `optc:` 토큰, 기존(DB)은 해석된 "M - Boneless" — id도 cart-* 로 재생성됨.
    // formatNote 로 양쪽을 같은 형태로 맞추면 기존 치킨은 신규로 오인되지 않는다(추가분만 출력).
    const formatNote = (note: string) => (note === 'optc:SIZE_M' ? 'M - Boneless' : note.trim())
    const cart = [
      { id: 'cart-c1-new', name: 'Golden Fried Chicken', price: 219, quantity: 1, note: 'optc:SIZE_M', menuId: '26' },
      { id: 'cart-c2-new', name: 'Snow Onion', price: 249, quantity: 1, note: 'optc:SIZE_M', menuId: '27' },
      { id: 'cart-soup-new', name: 'Kimchi Soup', price: 199, quantity: 2, menuId: '99' },
    ]
    const existing = [
      { id: 'db-c1', name: 'Golden Fried Chicken', price: 219, quantity: 1, qty: 1, note: 'M - Boneless', menuId: '26' },
      { id: 'db-c2', name: 'Snow Onion', price: 249, quantity: 1, qty: 1, note: 'M - Boneless', menuId: '27' },
    ]
    const delta = filterKitchenCartLinesForDineInAdd(cart, existing, { formatNote })
    expect(delta).toEqual([
      { id: 'cart-soup-new', name: 'Kimchi Soup', price: 199, quantity: 2, menuId: '99' },
    ])
  })

  it('resolveDineInKitchenLinesForAddSubmit does not return full cart when delta is empty', () => {
    const cart = [
      { id: 'cart-existing-0-a', name: 'Rice', price: 50, quantity: 1, menuId: '1' },
      { id: 'cart-new-1', name: 'Soup', price: 99, quantity: 1, menuId: '2' },
    ]
    const existing = [
      { id: 'a', name: 'Rice', price: 50, quantity: 1, qty: 1, menuId: '1' },
      { id: 'b', name: 'Soup', price: 99, quantity: 1, qty: 1, menuId: '2' },
    ]
    expect(resolveDineInKitchenLinesForAddSubmit(cart, existing)).toEqual([])
  })

  it('without a note normalizer the drift would re-emit existing chicken (documents root cause)', () => {
    const cart = [
      { id: 'cart-c1-new', name: 'Golden Fried Chicken', price: 219, quantity: 1, note: 'optc:SIZE_M', menuId: '26' },
      { id: 'cart-soup-new', name: 'Kimchi Soup', price: 199, quantity: 2, menuId: '99' },
    ]
    const existing = [
      { id: 'db-c1', name: 'Golden Fried Chicken', price: 219, quantity: 1, qty: 1, note: 'M - Boneless', menuId: '26' },
    ]
    const delta = filterKitchenCartLinesForDineInAdd(cart, existing)
    expect(delta.some((l) => l.name === 'Golden Fried Chicken')).toBe(true)
  })
})

describe('resolveDineInKitchenSnapshotItemKey', () => {
  it('uses content signature for ephemeral cart-* ids', () => {
    const a = resolveDineInKitchenSnapshotItemKey({
      id: 'cart-menu1-aaa',
      name: 'Budae Jiggae',
      price: 299,
      menuId: 'm1',
    })
    const b = resolveDineInKitchenSnapshotItemKey({
      id: 'cart-menu1-bbb',
      name: 'Budae Jiggae',
      price: 299,
      menuId: 'm1',
    })
    expect(a).toBe(b)
    expect(a.startsWith('sig:')).toBe(true)
  })

  it('keeps stable non-cart ids', () => {
    expect(
      resolveDineInKitchenSnapshotItemKey({ id: 'line-persist-1', name: 'Rice', price: 30 })
    ).toBe('line-persist-1')
  })
})

describe('buildKitchenCartLinesFromSnapshotDelta', () => {
  it('returns only increased keys with delta qty', () => {
    const cart = [
      { id: 'x1', name: 'Budae Jiggae', price: 299, quantity: 1, menuId: 'b' },
      { id: 'x2', name: 'Pepsi', price: 35, quantity: 1, menuId: 'p' },
      { id: 'x3', name: 'Banban Chicken', price: 199, quantity: 1, menuId: 'c' },
    ]
    const resolveKey = (line: (typeof cart)[number]) =>
      resolveDineInKitchenSnapshotItemKey({
        id: line.id,
        name: line.name,
        price: line.price,
        menuId: line.menuId,
      })
    const prev = new Map([
      [resolveKey(cart[0]), 1],
      [resolveKey(cart[1]), 1],
    ])
    const next = new Map([
      [resolveKey(cart[0]), 1],
      [resolveKey(cart[1]), 1],
      [resolveKey(cart[2]), 1],
    ])
    expect(buildKitchenCartLinesFromSnapshotDelta(cart, prev, next, resolveKey)).toEqual([
      { id: 'x3', name: 'Banban Chicken', price: 199, quantity: 1, menuId: 'c' },
    ])
  })
})

describe('collectDineInSnapshotIncreasedKeys', () => {
  it('lists keys whose qty increased', () => {
    const prev = new Map([['a', 1]])
    const next = new Map([['a', 1], ['b', 1]])
    expect(collectDineInSnapshotIncreasedKeys(prev, next)).toEqual(new Set(['b']))
  })
})

describe('buildDineInAddKitchenPrintDedupeSuffix', () => {
  it('differs for different menu ids even when line count is 1', () => {
    const a = buildDineInAddKitchenPrintDedupeSuffix([
      { menuId: '15', name: 'Cejun Fries', price: 99, quantity: 1 },
    ])
    const b = buildDineInAddKitchenPrintDedupeSuffix([
      { menuId: '44', name: 'SOY SAUCE BULGOGI SET', price: 250, quantity: 1 },
    ])
    expect(a).not.toBe(b)
    expect(a).toContain('m:15@1')
    expect(b).toContain('m:44@1')
  })

  it('buildDineInAddKitchenAutoPrintDedupeKey is stable across paths', () => {
    const lines = [{ menuId: '44', name: 'SET', price: 250, quantity: 1 }]
    expect(buildDineInAddKitchenAutoPrintDedupeKey(58, lines)).toBe(
      'order:58:kitchen:add:m:44@1:'
    )
  })
})

describe('kitchenSlipSourceItemsForAddOrderReceipt', () => {
  it('returns all items for order context', () => {
    const items = [
      { id: '1', name: 'A', isAddon: false },
      { id: '2', name: 'B', isAddon: true },
    ]
    expect(kitchenSlipSourceItemsForAddOrderReceipt(items, 'order')).toEqual(items)
  })

  it('returns only isAddon lines for add_order context', () => {
    const items = [
      { id: '1', name: 'A', isAddon: false },
      { id: '2', name: 'B', isAddon: true },
    ]
    expect(kitchenSlipSourceItemsForAddOrderReceipt(items, 'add_order')).toEqual([
      { id: '2', name: 'B', isAddon: true },
    ])
  })

  it('returns empty for add_order when no isAddon flags', () => {
    const items = [{ id: '1', name: 'A' }]
    expect(kitchenSlipSourceItemsForAddOrderReceipt(items, 'add_order')).toEqual([])
  })
})
