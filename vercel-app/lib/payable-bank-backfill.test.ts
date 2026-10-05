import { describe, expect, it } from 'vitest'
import {
  buildMissingPurchasePaymentInserts,
  buildMissingPurchaseWithholdingInserts,
} from './payable-bank-backfill'

describe('buildMissingPurchasePaymentInserts', () => {
  it('inserts only purchase payments that have no payable row yet', () => {
    const rows = buildMissingPurchasePaymentInserts({
      banks: [
        { id: 1, vendor_code: '1008', amount: -1500.5, trans_date: '2026-06-01', memo: 'S&J' },
        { id: 2, vendor_code: '1002', amount: -800, trans_date: '2026-06-02', memo: '' },
        { id: 3, vendor_code: '', amount: -100, trans_date: '2026-06-03', memo: 'no vendor' },
      ],
      existingPaymentBankIds: new Set([2]),
    })
    expect(rows).toEqual([
      {
        vendor_code: '1008',
        amount: -1500.5,
        ref_type: 'Payment',
        ref_id: null,
        trans_date: '2026-06-01',
        memo: '통장 지급: S&J',
        bank_transaction_id: 1,
      },
    ])
  })
})

describe('buildMissingPurchaseWithholdingInserts', () => {
  it('inserts withholding only when the bank row has a WHT amount and no withholding row', () => {
    const rows = buildMissingPurchaseWithholdingInserts({
      banks: [
        { id: 1, vendor_code: '1008', trans_date: '2026-06-01', withholding_tax_amount: 45.5 },
        { id: 2, vendor_code: '1002', trans_date: '2026-06-02', withholding_tax_amount: 10 },
        { id: 3, vendor_code: '1008', trans_date: '2026-06-03', withholding_tax_amount: 0 },
      ],
      existingWithholdingBankIds: new Set([2]),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      vendor_code: '1008',
      amount: -45.5,
      ref_type: 'Withholding',
      bank_transaction_id: 1,
    })
  })
})
