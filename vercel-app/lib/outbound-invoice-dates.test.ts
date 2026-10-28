import { describe, expect, it } from 'vitest'
import {
  pickOutboundDeliveryDueDate,
  resolveOutboundInvoiceDates,
  ymdFromMaybeDateTime,
} from './outbound-invoice-dates'

describe('ymdFromMaybeDateTime', () => {
  it('takes YYYY-MM-DD prefix', () => {
    expect(ymdFromMaybeDateTime('2026-11-05')).toBe('2026-11-05')
    expect(ymdFromMaybeDateTime('2026-11-05 14:30')).toBe('2026-11-05')
    expect(ymdFromMaybeDateTime('')).toBe('')
    expect(ymdFromMaybeDateTime('배송중')).toBe('')
  })
})

describe('pickOutboundDeliveryDueDate', () => {
  it('uses latest delivery date among lines', () => {
    expect(pickOutboundDeliveryDueDate(['2026-11-05', '2026-11-03'])).toBe('2026-11-05')
    expect(pickOutboundDeliveryDueDate([undefined, ''])).toBe('')
  })
})

describe('resolveOutboundInvoiceDates', () => {
  it('maps outbound date → issue, delivery date → due', () => {
    expect(
      resolveOutboundInvoiceDates({
        issueDateCandidates: ['2026-10-28', 'IVF20261028-1'],
        deliveryDates: ['2026-11-05'],
      })
    ).toEqual({ issueDate: '2026-10-28', dueDate: '2026-11-05' })
  })

  it('falls back due to issue when delivery missing', () => {
    expect(
      resolveOutboundInvoiceDates({
        issueDateCandidates: ['2026-10-28'],
        deliveryDates: [],
      })
    ).toEqual({ issueDate: '2026-10-28', dueDate: '2026-10-28' })
  })
})
