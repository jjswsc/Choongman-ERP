import { describe, expect, it } from 'vitest'
import {
  getCompanyHybridDocExpiryStatus,
  matchesCompanyHybridDocExpiryFilter,
} from '@/lib/company-hybrid-documents-expiry'

describe('company-hybrid-documents-expiry', () => {
  const today = '2026-06-13'

  it('classifies expired valid_to', () => {
    expect(getCompanyHybridDocExpiryStatus('2026-06-01', today)).toBe('expired')
  })

  it('classifies expiring soon within 30 days', () => {
    expect(getCompanyHybridDocExpiryStatus('2026-07-01', today)).toBe('expiring_soon')
  })

  it('classifies valid beyond 30 days', () => {
    expect(getCompanyHybridDocExpiryStatus('2026-12-31', today)).toBe('valid')
  })

  it('filter matches no_expiry', () => {
    expect(matchesCompanyHybridDocExpiryFilter(null, 'no_expiry', today)).toBe(true)
    expect(matchesCompanyHybridDocExpiryFilter('2026-12-31', 'no_expiry', today)).toBe(false)
  })
})
