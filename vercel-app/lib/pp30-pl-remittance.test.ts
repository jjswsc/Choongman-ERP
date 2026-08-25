import { describe, expect, it } from 'vitest'
import {
  isPp30PlRemittanceRow,
  parsePp30TaxMonthFromText,
  pp30PlAmountForVatMode,
  pp30PlPaymentWindowEnd,
  resolvePp30TaxMonthForPlRow,
  sumPp30RemittanceForTaxPeriod,
} from '@/lib/pp30-pl-remittance'

describe('parsePp30TaxMonthFromText', () => {
  it('parses CE month/year', () => {
    expect(parsePp30TaxMonthFromText('PP.30 02/2026')).toBe('2026-02')
    expect(parsePp30TaxMonthFromText('PP.30 02/26')).toBe('2026-02')
  })

  it('parses Buddhist 2-digit year (07.69 → 2026-07)', () => {
    expect(parsePp30TaxMonthFromText('PP.30 07.69')).toBe('2026-07')
    expect(parsePp30TaxMonthFromText('ภ.พ.30 07.69')).toBe('2026-07')
  })

  it('ignores PND memos', () => {
    expect(parsePp30TaxMonthFromText('PND.53 02/2026')).toBeNull()
    expect(isPp30PlRemittanceRow({ memo: 'PND.53 02/2026', category: 'expense' })).toBe(false)
  })
})

describe('resolvePp30TaxMonthForPlRow', () => {
  it('prefers memo period over payment date', () => {
    expect(
      resolvePp30TaxMonthForPlRow({
        memo: 'PP.30 02/2026',
        trans_date: '2026-03-23',
      })
    ).toBe('2026-02')
  })

  it('falls back to previous month of payment for tax_vat', () => {
    expect(
      resolvePp30TaxMonthForPlRow({
        note: 'withdrawal_category:tax_vat',
        trans_date: '2026-03-16',
      })
    ).toBe('2026-02')
  })
})

describe('sumPp30RemittanceForTaxPeriod', () => {
  it('attributes March payment to February P&L range', () => {
    const total = sumPp30RemittanceForTaxPeriod(
      [
        { id: 1, amount: 12706, memo: 'PP.30 02/2026', trans_date: '2026-03-23', store: 'A' },
        { id: 2, amount: 3317.59, memo: 'PND.3 02/2026', trans_date: '2026-03-16', store: 'A' },
      ],
      '2026-02-01',
      '2026-02-28'
    )
    expect(total).toBe(12706)
  })

  it('does not put February PP.30 on March P&L', () => {
    const total = sumPp30RemittanceForTaxPeriod(
      [{ id: 1, amount: 12706, memo: 'PP.30 02/2026', trans_date: '2026-03-23', store: 'A' }],
      '2026-03-01',
      '2026-03-31'
    )
    expect(total).toBe(0)
  })

  it('dedupes expense_internal shadow with the real bank row', () => {
    const total = sumPp30RemittanceForTaxPeriod(
      [
        {
          id: 1,
          amount: 12706,
          memo: 'PP.30 02/2026',
          note: 'PP.30 02/2026 | withdrawal_category:tax_vat;source:expense_internal',
          trans_date: '2026-03-23',
          store: 'A',
        },
        {
          id: 2,
          amount: 12706,
          memo: 'PP.30 02/2026',
          note: 'withdrawal_category:tax_vat',
          trans_date: '2026-03-23',
          store: 'A',
        },
      ],
      '2026-02-01',
      '2026-02-28'
    )
    expect(total).toBe(12706)
  })
})

describe('pp30 display toggle', () => {
  it('adds remittance only in included mode', () => {
    expect(pp30PlAmountForVatMode(12706, 'included')).toBe(12706)
    expect(pp30PlAmountForVatMode(12706, 'excluded')).toBe(0)
  })

  it('extends payment window three months past period end', () => {
    expect(pp30PlPaymentWindowEnd('2026-02-28')).toBe('2026-05-31')
  })
})
