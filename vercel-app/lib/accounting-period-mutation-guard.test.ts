import { describe, expect, it } from 'vitest'
import {
  accountingPeriodClosedMessage,
  inboundHeaderPatchAffectsClosedPeriod,
  isAccountingPeriodClosedError,
  uniqueAccountingPeriodChecks,
} from './accounting-period-mutation-guard'

describe('uniqueAccountingPeriodChecks', () => {
  it('skips invalid dates and dedupes date+store', () => {
    expect(
      uniqueAccountingPeriodChecks([
        { accounting_date: '2026-07-15', store_name: 'CM01' },
        { accounting_date: '2026-07-15T10:00:00Z', store_name: 'CM01' },
        { accounting_date: '2026-07-20', store_name: 'CM01' },
        { accounting_date: '2026-07-15', store_name: 'CM02' },
        { accounting_date: 'bad', store_name: 'CM01' },
        { accounting_date: null, store_name: 'CM01' },
      ])
    ).toEqual([
      { dateYmd: '2026-07-15', storeName: 'CM01' },
      { dateYmd: '2026-07-20', storeName: 'CM01' },
      { dateYmd: '2026-07-15', storeName: 'CM02' },
    ])
  })

  it('treats blank store as null (전사 마감만 해당)', () => {
    expect(uniqueAccountingPeriodChecks([{ accounting_date: '2026-08-01', store_name: '  ' }])).toEqual([
      { dateYmd: '2026-08-01', storeName: null },
    ])
  })
})

describe('inboundHeaderPatchAffectsClosedPeriod', () => {
  it('allows invoice evidence-only header patches', () => {
    expect(
      inboundHeaderPatchAffectsClosedPeriod(['invoice_received', 'invoice_no', 'invoice_photo_url', 'po_no'])
    ).toBe(false)
  })

  it('blocks vendor/location/amount-related header patches', () => {
    expect(inboundHeaderPatchAffectsClosedPeriod(['vendor_code'])).toBe(true)
    expect(inboundHeaderPatchAffectsClosedPeriod(['location', 'invoice_received'])).toBe(true)
  })
})

describe('isAccountingPeriodClosedError', () => {
  it('matches the shared error code', () => {
    expect(isAccountingPeriodClosedError(new Error('ACCOUNTING_PERIOD_CLOSED'))).toBe(true)
    expect(isAccountingPeriodClosedError(new Error('other'))).toBe(false)
    expect(isAccountingPeriodClosedError('ACCOUNTING_PERIOD_CLOSED')).toBe(false)
  })
})

describe('accountingPeriodClosedMessage', () => {
  it('uses delete vs edit wording', () => {
    expect(accountingPeriodClosedMessage('delete')).toContain('삭제')
    expect(accountingPeriodClosedMessage('edit')).toContain('수정')
  })
})
