import { describe, expect, it } from 'vitest'
import {
  applySettlementBreakdownDelta,
  buildSettlementCashReconcile,
  computePayCorrectSettlementDeltas,
  formatPayCorrectSettlementSyncMemo,
  formatSettlementCashReconcileMemo,
} from '@/lib/pos-settlement-sync-after-pay-correct'

describe('formatPayCorrectSettlementSyncMemo', () => {
  it('uses Thai plain language and Bangkok wall time', () => {
    const memo = formatPayCorrectSettlementSyncMemo({
      who: 'Onpimon Inthongchuay MB013',
      reason: 'รับเงินผิดประเภท',
      cashBefore: 0,
      cashAfter: 298,
      at: new Date('2026-09-25T07:48:44.924Z'),
    })
    expect(memo).toBe(
      'แก้ช่องทางชำระ — อัปเดตยอดปิดร้าน · 2026-09-25 14:48:44 · Onpimon Inthongchuay MB013 · เงินสด 0→298 · เหตุผล: รับเงินผิดประเภท'
    )
    expect(memo).not.toMatch(/PAY_CORRECT_SETTLEMENT_SYNC/)
  })
})

describe('formatSettlementCashReconcileMemo', () => {
  it('uses Thai plain language', () => {
    const memo = formatSettlementCashReconcileMemo({
      who: 'system',
      cashBefore: 100,
      cashAfter: 150,
      at: new Date('2026-09-27T12:05:05.998Z'),
    })
    expect(memo).toBe(
      'จัดยอดเงินสดให้ตรงออเดอร์ · 2026-09-27 19:05:05 · system · เงินสด 100→150'
    )
    expect(memo).not.toMatch(/SETTLEMENT_CASH_RECONCILE/)
  })
})

describe('computePayCorrectSettlementDeltas', () => {
  it('card → cash moves amounts correctly', () => {
    const d = computePayCorrectSettlementDeltas(
      {
        paymentCash: 0,
        paymentCard: 458,
        paymentQr: 0,
        paymentOther: 0,
        paymentDeliveryApp: 0,
      },
      {
        paymentCash: 458,
        paymentCard: 0,
        paymentQr: 0,
        paymentOther: 0,
        paymentDeliveryApp: 0,
      }
    )
    expect(d.cashAmt).toBe(458)
    expect(d.cardAmt).toBe(-458)
  })

  it('dine_in delivery stays in dine-in bucket', () => {
    const d = computePayCorrectSettlementDeltas(
      {
        paymentCash: 0,
        paymentCard: 0,
        paymentQr: 0,
        paymentOther: 0,
        paymentDeliveryApp: 100,
        deliveryPaymentChannel: 'grab',
        orderType: 'delivery',
      },
      {
        paymentCash: 0,
        paymentCard: 0,
        paymentQr: 0,
        paymentOther: 0,
        paymentDeliveryApp: 100,
        deliveryPaymentChannel: 'dine_in',
        orderType: 'dine_in',
      }
    )
    expect(d.deliveryAppAmt).toBe(-100)
    expect(d.dineInDeliveryAmt).toBe(100)
  })
})

describe('applySettlementBreakdownDelta', () => {
  it('adds to fallback key', () => {
    expect(applySettlementBreakdownDelta({ Visa: 100 }, 50, 'Other')).toEqual({
      Visa: 100,
      Other: 50,
    })
  })

  it('reduces existing keys when negative', () => {
    expect(applySettlementBreakdownDelta({ Visa: 100, Master: 50 }, -120, 'Other')).toEqual({
      Master: 30,
    })
  })
})

describe('buildSettlementCashReconcile', () => {
  it('flags mismatch above 0.02', () => {
    const r = buildSettlementCashReconcile({ liveCash: 11425, savedCash: 11883, closed: true })
    expect(r.mismatch).toBe(true)
    expect(r.diff).toBe(458)
  })

  it('matches when equal', () => {
    const r = buildSettlementCashReconcile({ liveCash: 11883, savedCash: 11883 })
    expect(r.mismatch).toBe(false)
  })

  it('treats legacy cash_amt that mixed in deposit cash as matched', () => {
    const r = buildSettlementCashReconcile({
      liveCash: 1234,
      savedCash: 6244,
      depositCashDelta: 5010,
      closed: true,
    })
    expect(r.mismatch).toBe(false)
    expect(r.diff).toBe(5010)
  })
})
