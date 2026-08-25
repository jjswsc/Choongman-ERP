import { describe, expect, it } from 'vitest'
import {
  composeMergedTaxBankFields,
  extractTaxRemittanceFingerprints,
  findTaxStatementMergeIndex,
  isTaxSettlementBankRow,
  taxRemittanceFingerprintsOverlap,
} from '@/lib/bank-statement-tax-match'
import { looksLikeTaxAuthorityRemittanceMemo } from '@/lib/bank-transaction-note-meta'

describe('extractTaxRemittanceFingerprints', () => {
  it('normalizes PP.30 07.69 and Thai ภ.พ.30', () => {
    expect(extractTaxRemittanceFingerprints('PP.30 07.69')).toEqual(
      expect.arrayContaining(['pp30-07-69', 'pp30'])
    )
    expect(extractTaxRemittanceFingerprints('ภ.พ.30 07.69')).toEqual(
      expect.arrayContaining(['pp30-07-69', 'pp30'])
    )
  })

  it('overlaps English PP.30 with Thai ภ.พ.30 same period', () => {
    expect(
      taxRemittanceFingerprintsOverlap('PP.30 07.69', 'การชำระเงิน | ภ.พ.30 07.69')
    ).toBe(true)
  })

  it('does not overlap different PP.30 periods', () => {
    expect(taxRemittanceFingerprintsOverlap('PP.30 07.69', 'PP.30 06.69')).toBe(false)
  })
})

describe('looksLikeTaxAuthorityRemittanceMemo PP.30', () => {
  it('treats English PP.30 as tax remittance', () => {
    expect(looksLikeTaxAuthorityRemittanceMemo('PP.30 07.69')).toBe(true)
    expect(looksLikeTaxAuthorityRemittanceMemo('PP30 07/69')).toBe(true)
  })
})

describe('findTaxStatementMergeIndex', () => {
  const taxRow = {
    id: 11,
    memo: '',
    note: 'PP.30 07.69 | withdrawal_category:tax_vat;source:expense_internal',
    category: 'tax',
  }

  it('merges statement line with pre-registered tax row on PP.30', () => {
    const idx = findTaxStatementMergeIndex(
      [taxRow],
      'การชำระเงิน | จ่ายให้แพลตฟอร์ม',
      'PP.30 07.69'
    )
    expect(idx).toBe(0)
  })

  it('does not merge a non-tax same-amount row', () => {
    const idx = findTaxStatementMergeIndex(
      [{ id: 2, memo: 'rent', note: '', category: 'expense' }],
      'การชำระเงิน',
      'PP.30 07.69'
    )
    expect(idx).toBe(-1)
  })

  it('does not merge two tax rows of different PP.30 periods without a match', () => {
    const pool = [
      { id: 1, memo: '', note: 'PP.30 06.69 | withdrawal_category:tax_vat', category: 'tax' },
      { id: 2, memo: '', note: 'PP.30 07.69 | withdrawal_category:tax_vat', category: 'tax' },
    ]
    expect(findTaxStatementMergeIndex(pool, 'การชำระเงิน', 'PP.30 07.69')).toBe(1)
    expect(findTaxStatementMergeIndex(pool, 'การชำระเงิน', 'office')).toBe(-1)
  })

  it('unique tax row + revenue department memo still merges', () => {
    const idx = findTaxStatementMergeIndex(
      [{ id: 9, memo: '', note: 'withdrawal_category:tax_withholding;source:expense_internal', category: 'tax' }],
      'Payment | Paid for Ref X8126 REVENUE DEPARTMENT',
      ''
    )
    expect(idx).toBe(0)
  })
})

describe('composeMergedTaxBankFields', () => {
  it('fills bank memo, keeps tax category, drops internal marker', () => {
    const merged = composeMergedTaxBankFields(
      {
        memo: '',
        note: 'PP.30 07.69 | withdrawal_category:tax_vat;source:expense_internal',
        category: 'tax',
      },
      { memo: 'การชำระเงิน | จ่ายให้แพ', note: 'PP.30 07.69' }
    )
    expect(merged.category).toBe('tax')
    expect(merged.memo).toBe('การชำระเงิน | จ่ายให้แพ')
    expect(merged.note).toContain('PP.30 07.69')
    expect(merged.note).toContain('withdrawal_category:tax_vat')
    expect(merged.note).not.toMatch(/source:expense_internal/i)
  })
})

describe('isTaxSettlementBankRow', () => {
  it('detects category tax and tax_vat note', () => {
    expect(isTaxSettlementBankRow({ category: 'tax', note: '', memo: '' })).toBe(true)
    expect(
      isTaxSettlementBankRow({
        category: 'unclassified',
        note: 'withdrawal_category:tax_vat',
        memo: '',
      })
    ).toBe(true)
  })
})
