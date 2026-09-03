import { describe, expect, it } from 'vitest'
import {
  computeManualLineDiscountAllocations,
  lineDiscountAmtFromPct,
  nextLineDiscountPctsAfterPercentTap,
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
})
