import { describe, expect, it } from 'vitest'
import {
  buildDiscountUnitKey,
  collectSelectedDiscountTargetKeys,
  computeManualLineDiscountAllocations,
  discountUnitCount,
  expandLinesToDiscountUnits,
  isActiveDiscountSelectionKey,
  lineDiscountAmtFromPct,
  nextDiscountModesForTargetChange,
  nextLineDiscountPctsAfterPercentTap,
  selectedDiscountQuantityForLine,
  summarizeLineDiscountPcts,
} from '@/lib/pos-manual-line-discount'

describe('nextLineDiscountPctsAfterPercentTap', () => {
  it('아직 %가 없는 선택 메뉴에는 같은 %를 한꺼번에 넣는다', () => {
    const next = nextLineDiscountPctsAfterPercentTap({
      selectedIds: ['a', 'b'],
      currentPcts: {},
      lastFocusedId: 'b',
      pct: 20,
    })
    expect(next).toEqual({ a: 20, b: 20 })
  })

  it('이미 %가 있으면 방금 고른 메뉴만 새 %로 바꾼다', () => {
    const next = nextLineDiscountPctsAfterPercentTap({
      selectedIds: ['a', 'b'],
      currentPcts: { a: 20, b: 20 },
      lastFocusedId: 'b',
      pct: 50,
    })
    expect(next).toEqual({ a: 20, b: 50 })
  })

  it('줄 전체 %가 있으면 같은 메뉴 한 접시만 다른 %로 바꾼다', () => {
    const u0 = buildDiscountUnitKey('katsu', 0)
    const u1 = buildDiscountUnitKey('katsu', 1)
    const next = nextLineDiscountPctsAfterPercentTap({
      selectedIds: [u0, u1],
      currentPcts: { katsu: 10 },
      lastFocusedId: u1,
      pct: 20,
    })
    expect(next).toEqual({ katsu: 10, [u1]: 20 })
  })
})

describe('computeManualLineDiscountAllocations', () => {
  it('메뉴마다 다른 %를 줄 금액으로 계산한다', () => {
    const res = computeManualLineDiscountAllocations({
      lines: [
        { id: 'a', price: 249, quantity: 1 },
        { id: 'b', price: 199, quantity: 1 },
        { id: 'c', price: 20, quantity: 1 },
      ],
      lineDiscountModeByItemId: { a: 'discount', b: 'discount', c: 'none' },
      lineDiscountPctByItemId: { a: 20, b: 50 },
    })
    expect(res.lineAlloc[0]).toBe(lineDiscountAmtFromPct(249, 20))
    expect(res.lineAlloc[1]).toBe(lineDiscountAmtFromPct(199, 50))
    expect(res.lineAlloc[2]).toBe(0)
    expect(res.total).toBe(res.lineAlloc[0] + res.lineAlloc[1])
  })

  it('같은 메뉴 2개는 접시마다 다른 %를 적용한다', () => {
    const u0 = buildDiscountUnitKey('katsu', 0)
    const u1 = buildDiscountUnitKey('katsu', 1)
    const res = computeManualLineDiscountAllocations({
      lines: [{ id: 'katsu', price: 199, quantity: 2 }],
      lineDiscountModeByItemId: { [u0]: 'discount', [u1]: 'discount' },
      lineDiscountPctByItemId: { [u0]: 10, [u1]: 20 },
    })
    expect(res.lineAlloc[0]).toBe(lineDiscountAmtFromPct(199, 10) + lineDiscountAmtFromPct(199, 20))
    expect(res.total).toBe(res.lineAlloc[0])
  })

  it('같은 메뉴 2개 중 한 접시만 할인한다', () => {
    const u0 = buildDiscountUnitKey('katsu', 0)
    const res = computeManualLineDiscountAllocations({
      lines: [{ id: 'katsu', price: 199, quantity: 2 }],
      lineDiscountModeByItemId: { [u0]: 'discount' },
      lineDiscountPctByItemId: { [u0]: 10 },
    })
    expect(res.lineAlloc[0]).toBe(lineDiscountAmtFromPct(199, 10))
  })
})

describe('summarizeLineDiscountPcts', () => {
  it('적용된 %별 건수를 묶는다', () => {
    expect(
      summarizeLineDiscountPcts(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        { a: 'discount', b: 'discount', c: 'discount' },
        { a: 20, b: 20, c: 50 }
      )
    ).toEqual([
      { pct: 20, count: 2 },
      { pct: 50, count: 1 },
    ])
  })

  it('같은 메뉴 접시별 %를 따로 센다', () => {
    const u0 = buildDiscountUnitKey('katsu', 0)
    const u1 = buildDiscountUnitKey('katsu', 1)
    expect(
      summarizeLineDiscountPcts(
        [{ id: 'katsu', quantity: 2 }],
        { [u0]: 'discount', [u1]: 'discount' },
        { [u0]: 10, [u1]: 20 }
      )
    ).toEqual([
      { pct: 10, count: 1 },
      { pct: 20, count: 1 },
    ])
  })
})

describe('expandLinesToDiscountUnits', () => {
  it('qty 2 줄을 접시 두 줄로 나눈다', () => {
    const units = expandLinesToDiscountUnits([{ id: 'katsu', name: 'Chicken Katsu', price: 199, quantity: 2 }])
    expect(units).toHaveLength(2)
    expect(units[0]?.key).toBe(buildDiscountUnitKey('katsu', 0))
    expect(units[1]?.key).toBe(buildDiscountUnitKey('katsu', 1))
    expect(units.every((u) => u.quantity === 1 && u.unitCount === 2)).toBe(true)
  })

  it('qty 1 은 기존 줄 id를 유지한다', () => {
    const units = expandLinesToDiscountUnits([{ id: 'a', name: 'Ice', price: 5, quantity: 1 }])
    expect(units).toEqual([
      { key: 'a', itemId: 'a', unitIndex: 0, unitCount: 1, name: 'Ice', price: 5, quantity: 1 },
    ])
  })
})

describe('nextDiscountModesForTargetChange', () => {
  it('줄 전체 할인에서 한 접시만 해제하면 나머지 접시는 남긴다', () => {
    const u0 = buildDiscountUnitKey('katsu', 0)
    const u1 = buildDiscountUnitKey('katsu', 1)
    const next = nextDiscountModesForTargetChange({
      prev: { katsu: 'discount' },
      targetKey: u0,
      nextMode: 'none',
      itemId: 'katsu',
      unitCount: 2,
    })
    expect(next.katsu).toBeUndefined()
    expect(next[u0]).toBeUndefined()
    expect(next[u1]).toBe('discount')
  })

  it('접시 하나만 고르면 그 접시만 할인한다', () => {
    const u1 = buildDiscountUnitKey('katsu', 1)
    const next = nextDiscountModesForTargetChange({
      prev: {},
      targetKey: u1,
      nextMode: 'discount',
      itemId: 'katsu',
      unitCount: 2,
    })
    expect(next).toEqual({ [u1]: 'discount' })
  })
})

describe('selectedDiscountQuantityForLine', () => {
  it('줄 전체 할인이면 수량 전부를 센다', () => {
    expect(selectedDiscountQuantityForLine({ id: 'katsu', quantity: 2 }, { katsu: 'discount' })).toBe(2)
  })

  it('접시 하나만 고르면 1이다', () => {
    const u0 = buildDiscountUnitKey('katsu', 0)
    expect(selectedDiscountQuantityForLine({ id: 'katsu', quantity: 2 }, { [u0]: 'discount' })).toBe(1)
  })
})

describe('collectSelectedDiscountTargetKeys / isActiveDiscountSelectionKey', () => {
  it('qty 2 줄의 접시 키를 모은다', () => {
    const u0 = buildDiscountUnitKey('katsu', 0)
    const u1 = buildDiscountUnitKey('katsu', 1)
    expect(collectSelectedDiscountTargetKeys([{ id: 'katsu', quantity: 2 }], { katsu: 'discount' })).toEqual([u0, u1])
  })

  it('수량 밖 접시 키는 만료로 본다', () => {
    const stale = buildDiscountUnitKey('katsu', 2)
    expect(isActiveDiscountSelectionKey(stale, [{ id: 'katsu', quantity: 2 }])).toBe(false)
    expect(isActiveDiscountSelectionKey(buildDiscountUnitKey('katsu', 1), [{ id: 'katsu', quantity: 2 }])).toBe(true)
  })
})

describe('discountUnitCount', () => {
  it('정수 수량만 접시 수로 쓴다', () => {
    expect(discountUnitCount(2)).toBe(2)
    expect(discountUnitCount(2.0)).toBe(2)
    expect(discountUnitCount(1.5)).toBe(1)
    expect(discountUnitCount(0)).toBe(0)
  })
})
