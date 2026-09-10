import { describe, expect, it } from 'vitest'
import {
  applyOrderLineDiscountsToSplitSnapshots,
  buildSplitPaymentReceiptBatch,
  composeCheckoutPaymentReceiptPrintBatch,
} from '@/lib/pos-split-payment-receipt-batch'
import type { PosSplitReceiptSnapshot } from '@/lib/pos-split-receipt-memo'
import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'

function sampleSplits(overrides?: Partial<PosSplitReceiptSnapshot>[]): PosSplitReceiptSnapshot[] {
  const a: PosSplitReceiptSnapshot = {
    key: 'menu-1',
    label: '1/2',
    items: [
      { id: 'banban', name: 'Banban Chicken', price: 259, quantity: 1 },
      { id: 'tteok', name: 'Tteokbokki', price: 159, quantity: 1, lineDiscountAmt: 7 },
    ],
    subtotal: 418,
    discountAmt: 7,
    total: 411,
    ...overrides?.[0],
  }
  const b: PosSplitReceiptSnapshot = {
    key: 'menu-2',
    label: '2/2',
    items: [
      { id: 'pork', name: 'Soy Sauce Pork', price: 149, quantity: 1, lineDiscountAmt: 7 },
      { id: 'water', name: 'Aquafina', price: 20, quantity: 1 },
    ],
    subtotal: 169,
    discountAmt: 7,
    total: 162,
    ...overrides?.[1],
  }
  return [a, b]
}

describe('composeCheckoutPaymentReceiptPrintBatch', () => {
  it('prepends the combined receipt before split copies', () => {
    const full = { orderNo: '068', storeCode: 'x', orderType: 'dine_in' } as ReceiptModalData
    const splits = [
      { orderNo: '068', printInstanceKey: 'dutch:1' },
      { orderNo: '068', printInstanceKey: 'dutch:2' },
    ] as ReceiptModalData[]
    const batch = composeCheckoutPaymentReceiptPrintBatch(full, splits)
    expect(batch).toHaveLength(3)
    expect(batch[0]).toBe(full)
    expect(batch[1]?.printInstanceKey).toBe('dutch:1')
  })
})

describe('buildSplitPaymentReceiptBatch', () => {
  it('keeps line discounts only on selected menus', () => {
    const rows = buildSplitPaymentReceiptBatch(
      {
        orderNo: '068',
        storeCode: 'CM The Street',
        orderType: 'dine_in',
        discountReason: 'ส่วนลดความร่วมมือ: Lucky Day',
      },
      sampleSplits()
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].items.find((it) => it.id === 'banban')?.lineDiscountAmt).toBeUndefined()
    expect(rows[0].items.find((it) => it.id === 'tteok')?.lineDiscountAmt).toBe(7)
    expect(rows[1].items.find((it) => it.id === 'water')?.lineDiscountAmt).toBeUndefined()
    expect(rows[1].items.find((it) => it.id === 'pork')?.lineDiscountAmt).toBe(7)
  })
})

describe('applyOrderLineDiscountsToSplitSnapshots', () => {
  it('fills missing split line discounts from the order items', () => {
    const splits: PosSplitReceiptSnapshot[] = [
      {
        key: 'menu-1',
        label: '1/2',
        items: [
          { id: 'tteok', name: 'Tteokbokki', price: 159, quantity: 1 },
          { id: 'water', name: 'Aquafina', price: 20, quantity: 1 },
        ],
        subtotal: 179,
        discountAmt: 4.22,
        total: 174.78,
      },
      {
        key: 'menu-2',
        label: '2/2',
        items: [{ id: 'pork', name: 'Soy Sauce Pork', price: 149, quantity: 1 }],
        subtotal: 149,
        discountAmt: 7,
        total: 142,
      },
    ]
    const filled = applyOrderLineDiscountsToSplitSnapshots(splits, [
      { id: 'tteok', name: 'Tteokbokki', qty: 1, lineDiscountAmt: 7 },
      { id: 'pork', name: 'Soy Sauce Pork', qty: 1, lineDiscountAmt: 7 },
      { id: 'water', name: 'Aquafina', qty: 1, lineDiscountAmt: 0 },
    ])
    expect(filled[0].items[0].lineDiscountAmt).toBe(7)
    expect(filled[0].items[1].lineDiscountAmt).toBeUndefined()
    expect(filled[1].items[0].lineDiscountAmt).toBe(7)
  })
})
