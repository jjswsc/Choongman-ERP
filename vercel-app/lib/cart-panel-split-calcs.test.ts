import { describe, expect, it } from 'vitest'
import type { OrderItem } from '@/lib/pos-types'
import type { CartPanelPaymentPayload } from '@/components/pos/cart-panel-types'
import { buildCartPanelOrderItemPayload } from '@/lib/cart-panel-payment-snapshot'
import {
  buildCartPanelSplitReceiptPayloads,
  computeCartPanelAmountSplitPersonStatuses,
  computeCartPanelDisplayedSplitTargetRemaining,
  computeCartPanelMenuSplitBaseByPerson,
  computeCartPanelMenuSplitDiscountByPerson,
  computeCartPanelMenuSplitDueByPerson,
  computeCartPanelMenuSplitItemStatuses,
  computeCartPanelMenuSplitPendingAmount,
  computeCartPanelMenuSplitUnassignedQty,
  computeCartPanelSplitCurrentPersonPaymentReady,
  computeCartPanelSplitOpenRemainders,
  computeCartPanelSplitReadyForComplete,
  computeCartPanelSplitSettledPersonCount,
} from '@/lib/cart-panel-split-calcs'

const round2 = (n: number) => Math.round(n * 100) / 100
const item = (id: string, price: number, quantity: number): OrderItem => ({ id, name: id, price, quantity })

/** A 100฿×2 (손님1·2 각 1개), B 50฿×1 (손님2) */
const cartItems = [item('A', 100, 2), item('B', 50, 1)]
const assigned = { A: [1, 1], B: [0, 1] }
const EPS = 0.02

describe('cart-panel-split-calcs — 메뉴별 더치페이', () => {
  it('인원별 메뉴 원가 합계', () => {
    expect(
      computeCartPanelMenuSplitBaseByPerson({ splitCount: 2, cartItems, menuSplitAssigned: assigned, round2 })
    ).toEqual([100, 150])
  })

  it('미배정 수량', () => {
    expect(computeCartPanelMenuSplitUnassignedQty({ cartItems, menuSplitAssigned: assigned, round2 })).toBe(0)
    expect(
      computeCartPanelMenuSplitUnassignedQty({ cartItems, menuSplitAssigned: { A: [1, 0] }, round2 })
    ).toBe(2)
  })

  it('줄 할인을 배정 수량대로 인원에게 나눈다', () => {
    expect(
      computeCartPanelMenuSplitDiscountByPerson({
        splitCount: 2,
        splitCollabJoinByPerson: [],
        cartItems,
        menuSplitAssigned: assigned,
        otherLineDiscountSnapshot: [20, 0],
        lineDiscountSnapshot: [20, 0],
        round2,
      })
    ).toEqual([10, 10])
  })

  it('협업 할인은 참여 인원에게만 나눈다', () => {
    expect(
      computeCartPanelMenuSplitDiscountByPerson({
        splitCount: 2,
        splitCollabJoinByPerson: [true, false],
        cartItems,
        menuSplitAssigned: assigned,
        otherLineDiscountSnapshot: [20, 0],
        lineDiscountSnapshot: [30, 0],
        round2,
      })
    ).toEqual([20, 10])
  })

  it('인원별 결제 금액 — 할인 차감 후 합계와 일치', () => {
    const dues = computeCartPanelMenuSplitDueByPerson({
      menuSplitBaseByPerson: [100, 150],
      menuSplitDiscountByPerson: [10, 10],
      subtotal: 250,
      discount: 20,
      total: 230,
      pricingAdjustments: { paymentTotalRoundingMode: 'none' },
      menuSplitUnassignedQty: 0,
      round2,
    })
    expect(dues).toEqual([90, 140])
  })

  it('인원별 결제 금액 — VAT 포함 합계를 비율대로 배분', () => {
    const dues = computeCartPanelMenuSplitDueByPerson({
      menuSplitBaseByPerson: [100, 150],
      menuSplitDiscountByPerson: [10, 10],
      subtotal: 250,
      discount: 20,
      total: 246.1,
      pricingAdjustments: { paymentTotalRoundingMode: 'none' },
      menuSplitUnassignedQty: 0,
      round2,
    })
    expect(dues).toEqual([96.3, 149.8])
    expect(round2(dues[0] + dues[1])).toBe(246.1)
  })

  it('선택 중(pending) 메뉴 금액 — 줄 할인 비례 차감', () => {
    expect(
      computeCartPanelMenuSplitPendingAmount({
        cartItems,
        menuSplitPendingQty: { A: 1 },
        lineDiscountSnapshot: [20, 0],
        subtotal: 250,
        discount: 20,
        total: 230,
        round2,
      })
    ).toBe(90)
  })

  it('메뉴 줄 상태 — 결제 대기 / 완료 / 선택 중', () => {
    const waiting = computeCartPanelMenuSplitItemStatuses({
      cartItems,
      menuSplitAssigned: assigned,
      menuSplitPendingQty: {},
      menuSplitDueByPerson: [90, 140],
      menuSplitRemainingByPerson: [0, 140],
    })
    expect(waiting.map((s) => [s.settled, s.awaitingPay])).toEqual([
      [false, true],
      [false, true],
    ])

    const done = computeCartPanelMenuSplitItemStatuses({
      cartItems,
      menuSplitAssigned: assigned,
      menuSplitPendingQty: {},
      menuSplitDueByPerson: [90, 140],
      menuSplitRemainingByPerson: [0, 0],
    })
    expect(done.every((s) => s.settled)).toBe(true)

    const selecting = computeCartPanelMenuSplitItemStatuses({
      cartItems,
      menuSplitAssigned: { A: [1, 0] },
      menuSplitPendingQty: { A: 1 },
      menuSplitDueByPerson: [90, 0],
      menuSplitRemainingByPerson: [90, 0],
    })
    expect(selecting[0]).toMatchObject({ selecting: true, unassigned: 0, settled: false, awaitingPay: false })
    expect(selecting[1]).toMatchObject({ unassigned: 1, selecting: false })
  })
})

describe('cart-panel-split-calcs — 진행 상태', () => {
  it('금액 더치 인원 상태', () => {
    expect(
      computeCartPanelAmountSplitPersonStatuses({
        splitCount: 2,
        amountSplitDueByPerson: [100, 100],
        amountSplitRemainingByPerson: [0, 100],
        amountSplitPaidByPerson: [100, 0],
        amountSplitTargetPersonIndex: 1,
      })
    ).toEqual([
      { idx: 0, due: 100, remaining: 0, paid: 100, isPaid: true, isPayTarget: false },
      { idx: 1, due: 100, remaining: 100, paid: 0, isPaid: false, isPayTarget: true },
    ])
  })

  it('결제 확정 인원 수', () => {
    const base = {
      splitCount: 2,
      menuSplitDueByPerson: [90, 140],
      menuSplitRemainingByPerson: [0, 140],
      amountSplitPaidPersonCount: 2,
    }
    expect(computeCartPanelSplitSettledPersonCount({ ...base, showSplit: false, splitMode: 'menu' })).toBe(0)
    expect(computeCartPanelSplitSettledPersonCount({ ...base, showSplit: true, splitMode: 'menu' })).toBe(1)
    expect(computeCartPanelSplitSettledPersonCount({ ...base, showSplit: true, splitMode: 'amount' })).toBe(2)
  })

  it('상단 잔액 표시', () => {
    const base = {
      round2,
      total: 230,
      paymentSum: 100.5,
      menuSplitPendingQtyTotal: 0,
      menuSplitPendingAmount: 45,
      menuSplitTargetPersonIndex: 1,
      amountSplitTargetPersonIndex: 0,
      menuSplitRemainingByPerson: [0, 140],
      amountSplitRemainingByPerson: [115, 115],
    }
    expect(computeCartPanelDisplayedSplitTargetRemaining({ ...base, showSplit: false, splitMode: 'menu' })).toBe(
      129.5
    )
    expect(computeCartPanelDisplayedSplitTargetRemaining({ ...base, showSplit: true, splitMode: 'menu' })).toBe(140)
    expect(
      computeCartPanelDisplayedSplitTargetRemaining({
        ...base,
        showSplit: true,
        splitMode: 'menu',
        menuSplitPendingQtyTotal: 1,
      })
    ).toBe(45)
    expect(computeCartPanelDisplayedSplitTargetRemaining({ ...base, showSplit: true, splitMode: 'amount' })).toBe(115)
  })

  it('현재 인원 결제 입력 완료 여부 (오차 0.02฿ 허용)', () => {
    const base = {
      showSplit: true,
      total: 230,
      splitMode: 'menu' as const,
      menuSplitPendingQtyTotal: 0,
      menuSplitTargetPersonIndex: 1,
      amountSplitTargetPersonIndex: 0,
      menuSplitDueByPerson: [90, 140],
      amountSplitDueByPerson: [],
      menuSplitRemainingByPerson: [0, 140],
      amountSplitRemainingByPerson: [],
      SPLIT_AMOUNT_EPS: EPS,
    }
    expect(computeCartPanelSplitCurrentPersonPaymentReady({ ...base, paymentSum: 140 })).toBe(true)
    expect(computeCartPanelSplitCurrentPersonPaymentReady({ ...base, paymentSum: 139.99 })).toBe(true)
    expect(computeCartPanelSplitCurrentPersonPaymentReady({ ...base, paymentSum: 139.9 })).toBe(false)
    expect(
      computeCartPanelSplitCurrentPersonPaymentReady({ ...base, paymentSum: 140, menuSplitPendingQtyTotal: 1 })
    ).toBe(false)
    expect(
      computeCartPanelSplitCurrentPersonPaymentReady({ ...base, paymentSum: 140, menuSplitTargetPersonIndex: 0 })
    ).toBe(false)
  })

  it('미결제 잔액 목록은 오차보다 큰 금액만', () => {
    expect(
      computeCartPanelSplitOpenRemainders({
        showSplit: true,
        splitCount: 3,
        splitMode: 'amount',
        menuSplitRemainingByPerson: [],
        amountSplitRemainingByPerson: [0, 140, 0.01],
        SPLIT_AMOUNT_EPS: EPS,
      })
    ).toEqual([140])
  })

  it('결제 완료 가능 여부', () => {
    const base = {
      showSplit: true,
      paymentSumMatch: true,
      cryptoPaymentConfirmed: true,
      splitMode: 'menu' as const,
      menuSplitUnassignedQty: 0,
      splitAllGuestsSettled: false,
      paymentTotalsReconcile: () => false,
      splitCapturedPaymentSum: 0,
      collectableDue: 230,
      splitOpenRemainders: [] as number[],
      paymentSum: 0,
      SPLIT_AMOUNT_EPS: EPS,
    }
    expect(computeCartPanelSplitReadyForComplete({ ...base, showSplit: false })).toBe(true)
    expect(
      computeCartPanelSplitReadyForComplete({ ...base, showSplit: false, cryptoPaymentConfirmed: false })
    ).toBe(false)
    expect(computeCartPanelSplitReadyForComplete(base)).toBe(true)
    expect(computeCartPanelSplitReadyForComplete({ ...base, menuSplitUnassignedQty: 1 })).toBe(false)
    expect(
      computeCartPanelSplitReadyForComplete({ ...base, splitOpenRemainders: [140], paymentSum: 140 })
    ).toBe(true)
    expect(
      computeCartPanelSplitReadyForComplete({ ...base, splitOpenRemainders: [50, 60], paymentSum: 110 })
    ).toBe(false)
    expect(
      computeCartPanelSplitReadyForComplete({
        ...base,
        paymentSumMatch: false,
        splitAllGuestsSettled: true,
        paymentTotalsReconcile: () => true,
      })
    ).toBe(true)
    expect(computeCartPanelSplitReadyForComplete({ ...base, paymentSumMatch: false })).toBe(false)
  })
})

describe('cart-panel-split-calcs — 인원별 영수증', () => {
  const lineDiscountSnapshot = [20, 0]
  const mapCartItemToOrderPayload = (
    i: OrderItem,
    quantityOverride?: number,
    lineIdx?: number,
    lineDiscountAmtOverride?: number
  ) =>
    buildCartPanelOrderItemPayload({
      i,
      quantityOverride,
      lineIdx,
      lineDiscountAmtOverride,
      orderType: 'dine-in',
      lineDiscountSnapshot,
      deliveryAppProp: undefined,
    })
  const pay0: CartPanelPaymentPayload = { paymentCash: 90, paymentCard: 0, paymentQr: 0, paymentOther: 0 }
  const base = {
    showSplit: true,
    splitCount: 2,
    splitCollabJoinByPerson: [],
    splitMemberIdByPerson: ['12', ''],
    memberMap: {
      '12': { id: 12, memberNo: 'M12', name: 'Somchai', phone: '0811111111', email: '', tierCode: 'GOLD' },
    },
    appliedCollab: null,
    cartItems,
    menuSplitAssigned: assigned,
    otherLineDiscountSnapshot: [20, 0],
    lineDiscountSnapshot,
    mapCartItemToOrderPayload,
    menuSplitDueByPerson: [90, 140],
    menuSplitDiscountByPerson: [10, 10],
    tr: (_key: string, fallback: string) => fallback,
    splitPaymentsByPersonRef: { current: [pay0, undefined] },
    amountSplitDueByPerson: [115, 115],
  }

  it('분할이 아니거나 1명이면 없음', () => {
    expect(buildCartPanelSplitReceiptPayloads({ ...base, splitMode: 'menu', showSplit: false })).toBeUndefined()
    expect(buildCartPanelSplitReceiptPayloads({ ...base, splitMode: 'menu', splitCount: 1 })).toBeUndefined()
  })

  it('메뉴별 — 인원별 메뉴·할인·금액·회원', () => {
    const out = buildCartPanelSplitReceiptPayloads({ ...base, splitMode: 'menu' })!
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      key: 'menu-1',
      label: '현재 인원 1/2',
      subtotal: 100,
      discountAmt: 10,
      total: 90,
      payment: pay0,
      member: { memberId: 12, memberNo: 'M12', memberPhone: '0811111111', memberTierCode: 'GOLD', collabJoined: false },
    })
    expect(out[0].items).toEqual([
      { id: 'A', name: 'A', price: 100, quantity: 1, orderType: 'dine_in', lineDiscountAmt: 10 },
    ])
    expect(out[1]).toMatchObject({ key: 'menu-2', subtotal: 150, discountAmt: 10, total: 140 })
    expect(out[1].member).toBeUndefined()
    expect(out[1].items.map((l) => [l.id, l.quantity])).toEqual([
      ['A', 1],
      ['B', 1],
    ])
  })

  it('금액 균등 — 전체 메뉴 + 더치 줄', () => {
    const out = buildCartPanelSplitReceiptPayloads({ ...base, splitMode: 'amount' })!
    expect(out).toHaveLength(2)
    expect(out[1]).toMatchObject({ key: 'amount-2', label: '현재 인원 2/2', subtotal: 115, discountAmt: 0, total: 115 })
    expect(out[1].items).toHaveLength(3)
    expect(out[1].items[2]).toEqual({ id: 'dutch-amount-2', name: '더치페이 2/2', price: 115, quantity: 1 })
    expect(out[0].items[0]).toMatchObject({ id: 'A', quantity: 2 })
    expect(out[0].items[0]).not.toHaveProperty('lineDiscountAmt')
  })

  it('금액 0인 인원은 영수증에서 뺀다', () => {
    const out = buildCartPanelSplitReceiptPayloads({ ...base, splitMode: 'amount', amountSplitDueByPerson: [230, 0] })!
    expect(out.map((e) => e.key)).toEqual(['amount-1'])
  })
})
