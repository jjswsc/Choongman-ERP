import { describe, expect, it } from 'vitest'
import {
  WHT_MANUAL_AMOUNTS_TAG,
  hasManualWhtAmountsTag,
  preserveAutoWhtMemoTags,
  shouldSkipWhtAutoOverwrite,
  withManualWhtAmountsTag,
} from '@/lib/withholding-tax-ledger-core'

describe('manual WHT amount lock', () => {
  it('stamps the tag once and keeps AUTO memo', () => {
    const memo = withManualWhtAmountsTag('[AUTO:EXPENSE_ACCRUAL_WHT:12] 지출 원천세 자동')
    expect(memo).toContain('[AUTO:EXPENSE_ACCRUAL_WHT:12]')
    expect(memo).toContain(WHT_MANUAL_AMOUNTS_TAG)
    expect(withManualWhtAmountsTag(memo)).toBe(memo)
  })

  it('skips auto overwrite for submitted and tagged draft rows', () => {
    expect(shouldSkipWhtAutoOverwrite(undefined)).toBe(false)
    expect(
      shouldSkipWhtAutoOverwrite({ id: 1, filingStatus: 'draft', memo: '[AUTO:PO:9]' })
    ).toBe(false)
    expect(
      shouldSkipWhtAutoOverwrite({ id: 2, filingStatus: 'submitted', memo: '[AUTO:PO:9]' })
    ).toBe(true)
    expect(
      shouldSkipWhtAutoOverwrite({
        id: 3,
        filingStatus: 'draft',
        memo: `[AUTO:PO:9] ${WHT_MANUAL_AMOUNTS_TAG}`,
      })
    ).toBe(true)
    expect(hasManualWhtAmountsTag('plain')).toBe(false)
  })

  it('keeps AUTO tags when the incoming memo omitted them', () => {
    const next = preserveAutoWhtMemoTags(
      '[AUTO:EXPENSE_ACCRUAL_WHT:12] 지출 원천세 자동',
      WHT_MANUAL_AMOUNTS_TAG
    )
    expect(next).toContain('[AUTO:EXPENSE_ACCRUAL_WHT:12]')
    expect(next).toContain(WHT_MANUAL_AMOUNTS_TAG)
  })
})
