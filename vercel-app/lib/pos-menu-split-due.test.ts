import { describe, expect, it } from 'vitest'
import { computeMenuSplitDueByPerson, computeMenuSplitDueFromBaseSum } from './pos-menu-split-due'

describe('computeMenuSplitDueByPerson', () => {
  it('한 명에게 메뉴 1개만 배정 시 해당 메뉴 분만 due (전체 합계 아님)', () => {
    const due = computeMenuSplitDueByPerson({
      total: 438,
      subtotal: 438,
      baseByPerson: [219, 0],
    })
    expect(due[0]).toBe(219)
    expect(due[1]).toBe(0)
  })

  it('전 메뉴 배정 시 합계가 total과 일치', () => {
    const due = computeMenuSplitDueByPerson({
      total: 400,
      subtotal: 438,
      baseByPerson: [219, 219],
    })
    expect(due[0] + due[1]).toBe(400)
  })
})

describe('computeMenuSplitDueFromBaseSum', () => {
  it('주문 할인 비율을 메뉴 정가 합에 적용', () => {
    expect(
      computeMenuSplitDueFromBaseSum({
        total: 400,
        subtotal: 800,
        baseSum: 49,
      })
    ).toBe(24.5)
  })
})
