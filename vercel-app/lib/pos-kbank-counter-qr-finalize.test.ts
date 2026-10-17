import { describe, expect, it } from 'vitest'
import {
  isPosOrderFullyPaidButOpen,
  resolveCounterKbankQrCloseStatus,
  resolveCounterKbankQrFinalizePatch,
} from '@/lib/pos-kbank-counter-qr-finalize-shared'

describe('resolveCounterKbankQrCloseStatus', () => {
  it('uses completed for dine_in and empty type', () => {
    expect(resolveCounterKbankQrCloseStatus('dine_in')).toBe('completed')
    expect(resolveCounterKbankQrCloseStatus('')).toBe('completed')
    expect(resolveCounterKbankQrCloseStatus(null)).toBe('completed')
  })

  it('uses paid for takeout/delivery', () => {
    expect(resolveCounterKbankQrCloseStatus('takeout')).toBe('paid')
    expect(resolveCounterKbankQrCloseStatus('delivery')).toBe('paid')
  })
})

describe('isPosOrderFullyPaidButOpen', () => {
  it('detects ready + full payment_qr (The Street case)', () => {
    expect(
      isPosOrderFullyPaidButOpen({
        status: 'ready',
        total: 713,
        paymentQr: 713,
      })
    ).toBe(true)
  })

  it('returns false when already completed/paid', () => {
    expect(
      isPosOrderFullyPaidButOpen({
        status: 'completed',
        total: 713,
        paymentQr: 713,
      })
    ).toBe(false)
    expect(
      isPosOrderFullyPaidButOpen({
        status: 'paid',
        total: 100,
        paymentCash: 100,
      })
    ).toBe(false)
  })

  it('returns false when underpaid', () => {
    expect(
      isPosOrderFullyPaidButOpen({
        status: 'ready',
        total: 713,
        paymentQr: 400,
      })
    ).toBe(false)
  })
})

describe('resolveCounterKbankQrFinalizePatch', () => {
  it('closes pre-saved full QR without double-adding bank amount', () => {
    const r = resolveCounterKbankQrFinalizePatch({
      status: 'ready',
      orderType: 'dine_in',
      total: 713,
      paymentQr: 713,
      paidAt: '2026-10-16T16:27:37.946Z',
      bankAmount: 713,
    })
    expect(r.alreadyPaid).toBe(false)
    if (r.alreadyPaid) return
    expect(r.closeStatus).toBe('completed')
    expect(r.nextPaymentQr).toBe(713)
    expect(r.patch.status).toBe('completed')
    expect(r.patch.payment_qr).toBeUndefined()
    expect(r.patch.paid_at).toBeUndefined()
  })

  it('adds bank amount when payment_qr was not pre-saved', () => {
    const r = resolveCounterKbankQrFinalizePatch({
      status: 'ready',
      orderType: 'dine_in',
      total: 713,
      paymentQr: 0,
      bankAmount: 713,
    })
    expect(r.alreadyPaid).toBe(false)
    if (r.alreadyPaid) return
    expect(r.nextPaymentQr).toBe(713)
    expect(r.patch.payment_qr).toBe(713)
    expect(r.patch.status).toBe('completed')
    expect(typeof r.patch.paid_at).toBe('string')
  })

  it('fills only the remaining gap (partial prior QR)', () => {
    const r = resolveCounterKbankQrFinalizePatch({
      status: 'preparing',
      orderType: 'dine_in',
      total: 713,
      paymentQr: 300,
      bankAmount: 500,
    })
    expect(r.alreadyPaid).toBe(false)
    if (r.alreadyPaid) return
    expect(r.nextPaymentQr).toBe(713)
    expect(r.patch.payment_qr).toBe(713)
  })

  it('noops when already completed', () => {
    const r = resolveCounterKbankQrFinalizePatch({
      status: 'completed',
      orderType: 'dine_in',
      total: 713,
      paymentQr: 713,
      bankAmount: 713,
    })
    expect(r.alreadyPaid).toBe(true)
    expect(r.patch).toBeNull()
  })

  it('uses paid for takeout', () => {
    const r = resolveCounterKbankQrFinalizePatch({
      status: 'pending',
      orderType: 'takeout',
      total: 100,
      paymentQr: 100,
      bankAmount: 100,
    })
    expect(r.alreadyPaid).toBe(false)
    if (r.alreadyPaid) return
    expect(r.closeStatus).toBe('paid')
    expect(r.patch.status).toBe('paid')
  })
})
