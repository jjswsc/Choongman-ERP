import { describe, expect, it } from 'vitest'
import {
  isPosOrderCollectableSettled,
  isUnfulfilledAdvanceOrder,
  posDepositBalanceFromLedger,
  posOrderCollectableDue,
  parsePosAdvanceDepositFromBody,
  parsePosDepositReceiveFromBody,
  resolveDefaultDepositDisposition,
  shouldEnqueueKitchenPrintForAdvance,
  shouldExcludeAdvanceFromLiveFloor,
  shouldExcludeAdvanceFromSalesAggregate,
  posDepositCashDrawerDelta,
  posOrderDepositAppliedForReceipt,
} from '@/lib/pos-deposit-domain'

describe('pos-deposit-domain', () => {
  it('computes remaining due as total minus deposit', () => {
    expect(posOrderCollectableDue(1000, 300)).toBe(700)
    expect(posOrderCollectableDue(1000, 1000)).toBe(0)
    expect(posOrderCollectableDue(1000, 1200)).toBe(0)
  })

  it('treats zero remaining due as settled even with no tender', () => {
    expect(isPosOrderCollectableSettled(0, 0)).toBe(true)
    expect(isPosOrderCollectableSettled(700, 700)).toBe(true)
    expect(isPosOrderCollectableSettled(700, 699.99)).toBe(true)
    expect(isPosOrderCollectableSettled(700, 500)).toBe(false)
  })

  it('sums ledger kinds into held deposit', () => {
    expect(
      posDepositBalanceFromLedger([
        { kind: 'receive', amount: 500 },
        { kind: 'apply', amount: 400 },
        { kind: 'refund', amount: 50 },
      ])
    ).toBe(50)
  })

  it('defaults cancel disposition from policy and cutoff hours', () => {
    const scheduled = '2026-09-03 18:00:00'
    const sixHoursBefore = Date.parse('2026-09-03T11:00:00+07:00')
    const oneHourBefore = Date.parse('2026-09-03T17:00:00+07:00')
    expect(
      resolveDefaultDepositDisposition({
        policy: 'staff_choice',
        scheduledAt: scheduled,
        cancelHours: 3,
        nowMs: sixHoursBefore,
      })
    ).toBe('refund')
    expect(
      resolveDefaultDepositDisposition({
        policy: 'staff_choice',
        scheduledAt: scheduled,
        cancelHours: 3,
        nowMs: oneHourBefore,
      })
    ).toBe('forfeit')
    expect(resolveDefaultDepositDisposition({ policy: 'non_refundable' })).toBe('forfeit')
    expect(resolveDefaultDepositDisposition({ policy: 'refundable' })).toBe('refund')
  })

  it('excludes unfulfilled advance orders from floor and kitchen', () => {
    const reserved = { isAdvance: true, status: 'pending', scheduledAt: '2026-09-04T11:00:00+07:00' }
    expect(isUnfulfilledAdvanceOrder(reserved)).toBe(true)
    expect(shouldExcludeAdvanceFromLiveFloor(reserved)).toBe(true)
    expect(shouldEnqueueKitchenPrintForAdvance({ isAdvance: true, advanceCheckedInAt: null })).toBe(false)
    expect(
      shouldEnqueueKitchenPrintForAdvance({
        isAdvance: true,
        advanceCheckedInAt: '2026-09-04T10:00:00+07:00',
      })
    ).toBe(true)
    expect(
      shouldExcludeAdvanceFromLiveFloor({
        ...reserved,
        advanceCheckedInAt: '2026-09-04T10:00:00+07:00',
      })
    ).toBe(false)
  })

  it('validates wallet receive without a menu order', () => {
    const memberOk = parsePosDepositReceiveFromBody({
      depositAmt: 300,
      memberId: 12,
      depositTender: 'cash',
    })
    expect(memberOk.ok).toBe(true)
    const guestOk = parsePosDepositReceiveFromBody({
      amount: 200,
      guestPhone: '0812345678',
      guestName: 'Somchai',
      tender: 'qr',
    })
    expect(guestOk.ok).toBe(true)
    const noName = parsePosDepositReceiveFromBody({
      depositAmt: 200,
      guestPhone: '0812345678',
    })
    expect(noName.ok).toBe(false)
  })

  it('validates advance deposit body', () => {
    const ok = parsePosAdvanceDepositFromBody(
      {
        isAdvance: true,
        depositAmt: 200,
        scheduledAt: '2026-09-04 18:00:00',
        guestPhone: '0812345678',
        guestName: 'Somchai',
        depositTender: 'cash',
      },
      800
    )
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.value.depositAmt).toBe(200)
      expect(ok.value.guestPhone).toBe('0812345678')
    }
    const tooMuch = parsePosAdvanceDepositFromBody(
      { isAdvance: true, depositAmt: 900, scheduledAt: '2026-09-04 18:00:00', guestPhone: '0812345678' },
      800
    )
    expect(tooMuch.ok).toBe(false)
  })

  it('keeps unfulfilled advance out of sales until paid/completed', () => {
    expect(
      shouldExcludeAdvanceFromSalesAggregate({ isAdvance: true, status: 'pending' })
    ).toBe(true)
    expect(
      shouldExcludeAdvanceFromSalesAggregate({ isAdvance: true, status: 'ready' })
    ).toBe(true)
    expect(
      shouldExcludeAdvanceFromSalesAggregate({ isAdvance: true, status: 'completed' })
    ).toBe(false)
    expect(shouldExcludeAdvanceFromSalesAggregate({ status: 'ready' })).toBe(false)
  })

  it('counts cash receive minus cash refund for the drawer', () => {
    expect(
      posDepositCashDrawerDelta([
        { kind: 'receive', amount: 300, tender: 'cash' },
        { kind: 'receive', amount: 100, tender: 'qr' },
        { kind: 'refund', amount: 50, tender: 'cash' },
        { kind: 'apply', amount: 200, tender: 'cash' },
      ])
    ).toBe(250)
  })

  it('infers receipt deposit from remaining payment after apply', () => {
    expect(
      posOrderDepositAppliedForReceipt({
        isAdvance: true,
        depositAmt: 0,
        total: 500,
        paymentCash: 300,
      })
    ).toBe(200)
    expect(
      posOrderDepositAppliedForReceipt({
        isAdvance: true,
        depositAmt: 200,
        total: 500,
        paymentCash: 0,
      })
    ).toBe(200)
  })
})
