import { describe, expect, it } from 'vitest'
import {
  isKbankQrSessionExpired,
  msUntilKbankQrSessionExpiry,
} from '@/lib/payments/kbank-inquiry-session'
import { KBANK_QR_SESSION_MAX_MS, KBANK_TOKEN_EXPIRY_SKEW_MS } from '@/lib/payments/kbank-api-reference'
import { maskKbankPartnerTxnUid } from '@/lib/payments/kbank-token-metrics'

describe('kbank inquiry session expiry', () => {
  it('is not expired before max window', () => {
    const started = 1_000_000
    expect(isKbankQrSessionExpired(started, started + KBANK_QR_SESSION_MAX_MS - 1)).toBe(false)
  })

  it('expires at 10 minutes', () => {
    const started = 1_000_000
    expect(isKbankQrSessionExpired(started, started + KBANK_QR_SESSION_MAX_MS)).toBe(true)
  })

  it('computes remaining ms', () => {
    const started = 1_000_000
    expect(msUntilKbankQrSessionExpiry(started, started + 60_000)).toBe(KBANK_QR_SESSION_MAX_MS - 60_000)
  })
})

describe('kbank token metrics helpers', () => {
  it('masks partner txn uid without leaking full id', () => {
    const masked = maskKbankPartnerTxnUid('POSQR178612345678901234')
    expect(masked.includes('POSQR178')).toBe(true)
    expect(masked.includes('***')).toBe(true)
    expect(masked.length).toBeLessThan('POSQR178612345678901234'.length)
  })

  it('uses 30s token skew constant', () => {
    expect(KBANK_TOKEN_EXPIRY_SKEW_MS).toBe(30_000)
  })
})
