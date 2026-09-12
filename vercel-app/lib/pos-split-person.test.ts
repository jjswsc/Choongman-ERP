import { describe, expect, it } from 'vitest'
import {
  collabAssignedQtyForLine,
  computeAmountSplitDueWithCollabJoin,
  padSplitPersonFlags,
  pickPrimarySplitMemberId,
} from '@/lib/pos-split-person'
import { allocateDiscountProportional } from '@/lib/pos-collab-discount'
import { collectSplitLoyaltyGroups } from '@/lib/pos-split-receipt-memo'
import { applySplitLoyaltyToReceiptBatch } from '@/lib/pos-split-payment-receipt-batch'
import {
  normalizePosSplitReceiptSnapshots,
  parsePosSplitReceiptsFromMemo,
  upsertPosSplitReceiptsInMemo,
} from '@/lib/pos-split-receipt-memo'

describe('pos-split-person', () => {
  it('pads join flags with true by default', () => {
    expect(padSplitPersonFlags([true, false], 3, true)).toEqual([true, false, true])
  })

  it('picks the first split member as primary', () => {
    expect(pickPrimarySplitMemberId(['', '12', '9'])).toBe(12)
  })

  it('menu split collab qty uses only joining assigned qty', () => {
    expect(
      collabAssignedQtyForLine({
        showSplit: true,
        splitMode: 'menu',
        lineQty: 3,
        assignedQtyByPerson: [1, 1, 1],
        joinByPerson: [true, true, false],
      })
    ).toBe(2)
  })

  it('amount split: non-joining guest does not get collab discount', () => {
    const due = computeAmountSplitDueWithCollabJoin({
      total: 900,
      collabDiscountAmt: 90,
      joinByPerson: [true, true, false],
    })
    expect(due[0] + due[1] + due[2]).toBe(900)
    expect(due[2]).toBeGreaterThan(due[0])
    expect(due[2]).toBe(330)
    expect(due[0]).toBe(285)
    expect(due[1]).toBe(285)
  })

  it('amount split all join stays equal', () => {
    expect(
      computeAmountSplitDueWithCollabJoin({
        total: 900,
        collabDiscountAmt: 90,
        joinByPerson: [true, true, true],
      })
    ).toEqual([300, 300, 300])
  })
})

describe('allocateDiscountProportional remainder', () => {
  it('does not dump leftover onto a zero-weight last line', () => {
    const alloc = allocateDiscountProportional([148, 159, 0, 0], 22.88)
    expect(alloc[2]).toBe(0)
    expect(alloc[3]).toBe(0)
    expect(alloc[0] + alloc[1]).toBeCloseTo(22.88, 2)
  })
})

describe('split receipt member memo', () => {
  it('round-trips per-guest member and collab join', () => {
    const splits = normalizePosSplitReceiptSnapshots([
      {
        key: 'menu-1',
        label: '1/2',
        items: [{ id: 'a', name: 'Pork', price: 148, quantity: 1, lineDiscountAmt: 14.9 }],
        subtotal: 148,
        discountAmt: 14.9,
        total: 133.1,
        member: { memberId: 11, memberNo: 'M017918', collabJoined: true, memberPointEarned: 2.1 },
      },
      {
        key: 'menu-2',
        label: '2/2',
        items: [{ id: 'b', name: 'Rice', price: 75, quantity: 1 }],
        subtotal: 75,
        discountAmt: 0,
        total: 75,
        member: { collabJoined: false },
      },
    ])
    const parsed = parsePosSplitReceiptsFromMemo(upsertPosSplitReceiptsInMemo('', splits))
    expect(parsed?.[0].member?.memberNo).toBe('M017918')
    expect(parsed?.[0].member?.memberPointEarned).toBe(2.1)
    expect(parsed?.[0].member?.collabJoined).toBe(true)
    expect(parsed?.[1].member?.collabJoined).toBe(false)
  })
})

describe('split loyalty grouping', () => {
  it('groups two bills of the same member into one earn total', () => {
    const groups = collectSplitLoyaltyGroups(
      [
        { key: 'menu-1', label: '1/2', items: [], subtotal: 100, discountAmt: 0, total: 100, member: { memberId: 7 } },
        { key: 'menu-2', label: '2/2', items: [], subtotal: 50, discountAmt: 0, total: 50, member: { memberId: 7 } },
      ],
      0
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].memberId).toBe(7)
    expect(groups[0].totalAmount).toBe(150)
  })
})

describe('applySplitLoyaltyToReceiptBatch', () => {
  it('writes per-split points onto dutch receipts only', () => {
    const rows = applySplitLoyaltyToReceiptBatch(
      [
        { orderNo: '077', printInstanceKey: 'full:077', memberId: 1 } as never,
        { orderNo: '077', printInstanceKey: 'dutch:077:0:menu-1' } as never,
        { orderNo: '077', printInstanceKey: 'dutch:077:1:menu-2' } as never,
      ],
      [
        { key: 'menu-1', memberId: 11, memberNo: 'M1', pointEarned: 2.2 },
        { key: 'menu-2', memberId: 12, memberNo: 'M2', pointEarned: 3.1 },
      ]
    )
    expect(rows[0].memberId).toBe(1)
    expect(rows[1].memberNo).toBe('M1')
    expect(rows[1].memberPointEarned).toBe(2.2)
    expect(rows[2].memberNo).toBe('M2')
    expect(rows[2].memberPointEarned).toBe(3.1)
  })
})
