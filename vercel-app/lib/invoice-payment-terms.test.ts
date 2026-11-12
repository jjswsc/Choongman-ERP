import { describe, expect, it } from 'vitest'
import {
  creditDaysForPaymentTerms,
  dueDateFromPaymentTerms,
  normalizeInvoicePaymentTerms,
} from './invoice-payment-terms'

describe('normalizeInvoicePaymentTerms', () => {
  it('maps cash and credit options', () => {
    expect(normalizeInvoicePaymentTerms('Cash')).toBe('Cash')
    expect(normalizeInvoicePaymentTerms('credit 7 days')).toBe('Credit 7 Days')
    expect(normalizeInvoicePaymentTerms('Net 30 Days')).toBe('Credit 30 Days')
    expect(normalizeInvoicePaymentTerms('Net 14')).toBe('Credit 14 Days')
    expect(normalizeInvoicePaymentTerms('')).toBe('')
    expect(normalizeInvoicePaymentTerms('COD')).toBe('')
  })
})

describe('dueDateFromPaymentTerms', () => {
  it('sets due from issue + credit days', () => {
    expect(dueDateFromPaymentTerms('2026-10-14', 'Cash')).toBe('2026-10-14')
    expect(dueDateFromPaymentTerms('2026-10-14', 'Credit 7 Days')).toBe('2026-10-21')
    expect(dueDateFromPaymentTerms('2026-10-14', 'Credit 14 Days')).toBe('2026-10-28')
    expect(dueDateFromPaymentTerms('2026-10-14', 'Credit 30 Days')).toBe('2026-11-13')
    expect(dueDateFromPaymentTerms('2026-10-14', 'Net 30 Days')).toBe('2026-11-13')
  })

  it('returns empty when issue date invalid', () => {
    expect(dueDateFromPaymentTerms('', 'Cash')).toBe('')
    expect(dueDateFromPaymentTerms('bad', 'Cash')).toBe('')
  })
})

describe('creditDaysForPaymentTerms', () => {
  it('returns days or null', () => {
    expect(creditDaysForPaymentTerms('Cash')).toBe(0)
    expect(creditDaysForPaymentTerms('Credit 7 Days')).toBe(7)
    expect(creditDaysForPaymentTerms('unknown')).toBe(null)
  })
})
