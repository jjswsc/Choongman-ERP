import { describe, expect, it } from 'vitest'
import {
  normalizePosSplitReceiptSnapshots,
  parsePosSplitReceiptsFromMemo,
  upsertPosSplitReceiptsInMemo,
} from '@/lib/pos-split-receipt-memo'
import { parsePosOrderMemo, upsertPosOrderTaxInvoiceMemo } from '@/lib/pos-tax-invoice'

describe('pos split receipt memo', () => {
  const sampleSplits = normalizePosSplitReceiptSnapshots([
    {
      key: 'menu-1',
      label: '현재 인원 1/2',
      items: [{ id: 'a', name: 'Banban Chicken', price: 239, quantity: 1 }],
      subtotal: 239,
      discountAmt: 0,
      total: 239,
      payment: { paymentCash: 239, paymentCashTendered: 300 },
    },
    {
      key: 'menu-2',
      label: '현재 인원 2/2',
      items: [{ id: 'b', name: 'Set 1', price: 111, quantity: 1 }],
      subtotal: 111,
      discountAmt: 0,
      total: 111,
      payment: { paymentCash: 111, paymentCashTendered: 200 },
    },
  ])

  it('stores and parses split snapshots from memo', () => {
    expect(sampleSplits).toHaveLength(2)
    const memo = upsertPosSplitReceiptsInMemo('customer note', sampleSplits)
    const parsed = parsePosSplitReceiptsFromMemo(memo)
    expect(parsed).toHaveLength(2)
    expect(parsed?.[0].items[0].name).toBe('Banban Chicken')
    expect(parsed?.[0].payment?.paymentCashTendered).toBe(300)
    expect(parsePosOrderMemo(memo).plainMemo).toBe('customer note')
  })

  it('keeps split snapshot when tax invoice block is appended later', () => {
    const memoWithSplit = upsertPosSplitReceiptsInMemo('', sampleSplits)
    const tax = {
      memberNo: '',
      customerType: 'person' as const,
      name: 'abc',
      taxId: '1234567890000',
      branchNo: '00000',
      phone: '0812345678',
      email: 'a@b.com',
      address: 'Bangkok',
      member: false,
    }
    const memo = upsertPosOrderTaxInvoiceMemo(memoWithSplit, tax)
    expect(parsePosSplitReceiptsFromMemo(memo)).toHaveLength(2)
    expect(parsePosOrderMemo(memo).taxInvoice?.name).toBe('abc')
  })
})
