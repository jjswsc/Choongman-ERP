import { beforeEach, describe, expect, it } from 'vitest'
import { inferPosOrderTypeFromRow } from '@/lib/pos-sales-order-type-filter'
import {
  isPosDineInTableMergeItemsUpdate,
  isPosDineInTableNameOnlyUpdate,
  isPosOrderItemsJsonPackagingOnlyUpdate,
  posOrderRealtimePricingFieldsChanged,
  resetMergeQtyOnlySkipAppliedKeysForTests,
  shouldAutoprintPaymentReceiptOnRealtimeUpdate,
  shouldSkipDineInAddonAutoprintForTableMerge,
} from '@/lib/pos-dine-in-realtime-update'
import { buildPosOrderMergedKeepStamp } from '@/lib/pos-order-merge'

describe('inferPosOrderTypeFromRow', () => {
  it('infers delivery from Line Man memo when DB order_type is dine_in', () => {
    expect(
      inferPosOrderTypeFromRow({
        order_type: 'dine_in',
        memo: 'lineman_order:lm-5768',
        table_name: 'Line Man #5768',
      })
    ).toBe('delivery')
  })

  it('keeps dine_in for in-store table orders', () => {
    expect(
      inferPosOrderTypeFromRow({
        order_type: 'dine_in',
        table_name: '9',
        memo: '',
      })
    ).toBe('dine_in')
  })
})

describe('isPosDineInTableNameOnlyUpdate', () => {
  const items = JSON.stringify([{ id: 'line-1', name: 'Rice', price: 99, qty: 1 }])

  it('returns true when only table_name changes', () => {
    expect(
      isPosDineInTableNameOnlyUpdate(
        { table_name: '9', items_json: items, subtotal: 99, total: 99 },
        { table_name: '18', items_json: items, subtotal: 99, total: 99 }
      )
    ).toBe(true)
  })

  it('returns false when items_json changes', () => {
    expect(
      isPosDineInTableNameOnlyUpdate(
        { table_name: '9', items_json: items, subtotal: 99, total: 99 },
        {
          table_name: '18',
          items_json: JSON.stringify([{ id: 'line-1', name: 'Rice', price: 99, qty: 2 }]),
          subtotal: 198,
          total: 198,
        }
      )
    ).toBe(false)
  })

  it('returns false when table_name is unchanged', () => {
    expect(
      isPosDineInTableNameOnlyUpdate(
        { table_name: '9', items_json: items, subtotal: 99, total: 99 },
        { table_name: '9', items_json: items, subtotal: 99, total: 99 }
      )
    ).toBe(false)
  })
})

describe('isPosOrderItemsJsonPackagingOnlyUpdate', () => {
  const baseItems = [
    { id: 'line-1', name: 'Chicken', price: 279, qty: 1 },
    { id: 'line-2', name: 'Udon', price: 209, qty: 1 },
  ]

  it('returns true when only servedAt is added (packaging check)', () => {
    const oldJson = JSON.stringify(baseItems)
    const newJson = JSON.stringify([
      { ...baseItems[0], servedAt: '2026-06-21T16:36:44+07:00' },
      baseItems[1],
    ])
    expect(
      isPosOrderItemsJsonPackagingOnlyUpdate(
        { id: 1, items_json: oldJson, discount_amt: 10, total: 1972 },
        { id: 1, items_json: newJson, discount_amt: 10, total: 1972 }
      )
    ).toBe(true)
  })

  it('returns true when Realtime OLD only has PK (replica identity default)', () => {
    const newJson = JSON.stringify(baseItems)
    expect(
      isPosOrderItemsJsonPackagingOnlyUpdate({ id: 1 }, { id: 1, items_json: newJson, discount_amt: 10, total: 1972 })
    ).toBe(true)
  })

  it('returns false when qty increases (add-on order)', () => {
    const oldJson = JSON.stringify(baseItems)
    const newJson = JSON.stringify([...baseItems, { id: 'line-3', name: 'Rice', price: 99, qty: 1 }])
    expect(
      isPosOrderItemsJsonPackagingOnlyUpdate(
        { id: 1, items_json: oldJson, total: 1972 },
        { id: 1, items_json: newJson, total: 2071 }
      )
    ).toBe(false)
  })
})

describe('posOrderRealtimePricingFieldsChanged', () => {
  it('returns false when OLD row lacks pricing fields (Supabase partial OLD)', () => {
    expect(
      posOrderRealtimePricingFieldsChanged({ id: 1 }, { id: 1, discount_amt: 10, total: 1972 })
    ).toBe(false)
  })

  it('returns true when discount_amt actually changes', () => {
    expect(
      posOrderRealtimePricingFieldsChanged(
        { id: 1, discount_amt: 0, total: 1982 },
        { id: 1, discount_amt: 10, total: 1972 }
      )
    ).toBe(true)
  })
})

describe('shouldAutoprintPaymentReceiptOnRealtimeUpdate', () => {
  it('skips already-paid order updates (collab backfill / non-payment fields)', () => {
    expect(
      shouldAutoprintPaymentReceiptOnRealtimeUpdate(
        {
          id: 1,
          status: 'paid',
          payment_cash: 100,
          payment_card: 0,
          payment_qr: 0,
          payment_other: 0,
        },
        {
          id: 1,
          status: 'paid',
          payment_cash: 100,
          payment_card: 0,
          payment_qr: 0,
          payment_other: 0,
          collab_discount_amt: 50,
        }
      )
    ).toBe(false)
  })

  it('skips when OLD is PK-only (cannot prove unpaid→paid)', () => {
    expect(
      shouldAutoprintPaymentReceiptOnRealtimeUpdate(
        { id: 1 },
        {
          id: 1,
          status: 'paid',
          payment_cash: 200,
          payment_card: 0,
          payment_qr: 0,
          payment_other: 0,
        }
      )
    ).toBe(false)
  })

  it('allows unpaid→paid with payment appearing', () => {
    expect(
      shouldAutoprintPaymentReceiptOnRealtimeUpdate(
        {
          id: 1,
          status: 'pending',
          payment_cash: 0,
          payment_card: 0,
          payment_qr: 0,
          payment_other: 0,
        },
        {
          id: 1,
          status: 'paid',
          payment_cash: 200,
          payment_card: 0,
          payment_qr: 0,
          payment_other: 0,
        }
      )
    ).toBe(true)
  })

  it('allows status unpaid→paid even if payment was already on OLD', () => {
    expect(
      shouldAutoprintPaymentReceiptOnRealtimeUpdate(
        {
          id: 1,
          status: 'pending',
          payment_cash: 0,
          payment_card: 150,
          payment_qr: 0,
          payment_other: 0,
        },
        {
          id: 1,
          status: 'paid',
          payment_cash: 0,
          payment_card: 150,
          payment_qr: 0,
          payment_other: 0,
        }
      )
    ).toBe(true)
  })
})

describe('table merge → skip dine-in addon autoprint', () => {
  const keepItems = JSON.stringify([{ id: 'line-1', name: 'Rice', price: 99, qty: 1 }])
  const mergedItems = JSON.stringify([
    { id: 'line-1', name: 'Rice', price: 99, qty: 1 },
    { id: 'm57-x', name: 'Tteokbokki', price: 129, qty: 1 },
  ])
  const keepStamp = buildPosOrderMergedKeepStamp({ absorbOrderId: 57 })

  beforeEach(() => {
    resetMergeQtyOnlySkipAppliedKeysForTests()
  })

  it('detects merge when m-prefixed lines are added', () => {
    expect(
      isPosDineInTableMergeItemsUpdate(
        { id: 55, items_json: keepItems, memo: '' },
        { id: 55, items_json: mergedItems, memo: keepStamp }
      )
    ).toBe(true)
  })

  it('detects merge when keep stamp newly appears (qty consolidate)', () => {
    const consolidated = JSON.stringify([{ id: 'line-1', name: 'Rice', price: 99, qty: 2 }])
    expect(
      isPosDineInTableMergeItemsUpdate(
        { id: 55, items_json: keepItems, memo: 'guest note' },
        { id: 55, items_json: consolidated, memo: `guest note\n${keepStamp}` }
      )
    ).toBe(true)
  })

  it('does not treat recent stamp alone as merge when OLD lacks memo field', () => {
    expect(
      isPosDineInTableMergeItemsUpdate(
        { id: 55 },
        { id: 55, items_json: mergedItems, memo: keepStamp }
      )
    ).toBe(false)
  })

  it('skips addon autoprint for merge-absorbed line ids', () => {
    expect(
      shouldSkipDineInAddonAutoprintForTableMerge({
        orderId: 55,
        changedKeys: ['m57-x'],
        prevQtyById: new Map([['line-1', 1]]),
        newMemo: keepStamp,
      })
    ).toBe(true)
  })

  it('does not skip m-looking menu ids without merge keep stamp', () => {
    expect(
      shouldSkipDineInAddonAutoprintForTableMerge({
        orderId: 55,
        changedKeys: ['m12-option'],
        prevQtyById: new Map([['line-1', 1]]),
        newMemo: 'no stamp',
      })
    ).toBe(false)
  })

  it('qty-only after merge skips once, then allows real same-line add', () => {
    const prev = new Map([['line-1', 1]])
    expect(
      shouldSkipDineInAddonAutoprintForTableMerge({
        orderId: 55,
        changedKeys: ['line-1'],
        prevQtyById: prev,
        newMemo: keepStamp,
      })
    ).toBe(true)
    // 합석 직후 같은 줄 추가주문(수량만 또 증가)
    expect(
      shouldSkipDineInAddonAutoprintForTableMerge({
        orderId: 55,
        changedKeys: ['line-1'],
        prevQtyById: new Map([['line-1', 2]]),
        newMemo: keepStamp,
      })
    ).toBe(false)
  })

  it('does not skip real add-order of a new non-merge line after stamp window', () => {
    const oldStamp = `[ORDER_MERGE_KEEP 2020-01-01T00:00:00.000Z absorb_id=57]`
    expect(
      shouldSkipDineInAddonAutoprintForTableMerge({
        orderId: 55,
        changedKeys: ['addon-new'],
        prevQtyById: new Map([['line-1', 1]]),
        newMemo: oldStamp,
        nowMs: Date.parse('2026-07-27T13:00:00.000Z'),
      })
    ).toBe(false)
  })
})
