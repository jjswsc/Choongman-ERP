import { describe, expect, it } from 'vitest'
import {
  groupPayableLedgerRowsWithLinks,
  payableLinkTotalsMatch,
  validatePayableSettlementLinkRequest,
} from '@/lib/payable-settlement-link'

describe('payable-settlement-link', () => {
  it('validates N:1 link when totals match', () => {
    const result = validatePayableSettlementLinkRequest({
      vendorCode: '1011',
      accrualRows: [
        { id: 1, vendor_code: '1011', ref_type: 'Inbound', amount: 17360 },
        { id: 2, vendor_code: '1011', ref_type: 'Inbound', amount: 248000 },
      ],
      paymentRows: [{ id: 6, vendor_code: '1011', ref_type: 'Payment', amount: -265360 }],
      existingLinks: [],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.links).toHaveLength(2)
      expect(result.links.every((l) => l.paymentId === 6)).toBe(true)
    }
  })

  it('rejects when totals mismatch', () => {
    const result = validatePayableSettlementLinkRequest({
      vendorCode: '1011',
      accrualRows: [{ id: 1, vendor_code: '1011', ref_type: 'Inbound', amount: 10000 }],
      paymentRows: [{ id: 6, vendor_code: '1011', ref_type: 'Payment', amount: -20000 }],
      existingLinks: [],
    })
    expect(result.ok).toBe(false)
  })

  it('groups manual N:1 as settled', () => {
    const groups = groupPayableLedgerRowsWithLinks(
      [
        { id: 1, ref_type: 'Inbound', amount: 17360, trans_date: '2026-03-20' },
        { id: 2, ref_type: 'Inbound', amount: 248000, trans_date: '2026-03-20' },
        { id: 6, ref_type: 'Payment', amount: -265360, trans_date: '2026-05-21' },
      ],
      [
        { payment_id: 6, accrual_id: 1 },
        { payment_id: 6, accrual_id: 2 },
      ]
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]?.status).toBe('settled')
    expect(groups[0]?.accruals).toHaveLength(2)
    expect(groups[0]?.settlements[0]?.id).toBe(6)
  })

  it('matches totals within one satang', () => {
    expect(payableLinkTotalsMatch(265360, 265360.004)).toBe(true)
  })
})
