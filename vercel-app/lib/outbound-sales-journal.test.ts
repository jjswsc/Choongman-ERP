import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({}))
vi.mock('@/lib/accounting-posting', () => ({}))
vi.mock('@/lib/paid-bank-credit-server', () => ({}))

import { outboundBillKey, outboundCollectionEntryNo } from './outbound-sales-journal'

describe('outbound sales journal entry numbers', () => {
  it('keeps the bill on the IV number and splits each collection by accrual', () => {
    expect(outboundBillKey('IV20261006-2807')?.sourceType).toBe('outbound_bill')
    expect(outboundCollectionEntryNo('IV20261006-2807', 512)).toBe('IV20261006-2807#RV512')
    expect(outboundCollectionEntryNo('IV20261006-2807', 513)).not.toBe(
      outboundCollectionEntryNo('IV20261006-2807', 512)
    )
    expect(outboundCollectionEntryNo('', 512)).toBeNull()
    expect(outboundCollectionEntryNo('IV20261006-2807', 0)).toBeNull()
  })
})
