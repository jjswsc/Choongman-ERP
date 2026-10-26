import { describe, expect, it } from 'vitest'
import { POS_BUSINESS_DAY_DEFAULT_HOURS } from '@/lib/pos-business-day'
import type { PosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'
import {
  patchPosPaymentSummaryCash,
  sumPosSalesPaymentCash,
  filterPosSalesRowsToPaidBusinessDay,
} from '@/lib/pos-sales-payment-paid-basis'

const BIZ_CTX: PosBusinessDaySettingsContext = {
  globalDefault: POS_BUSINESS_DAY_DEFAULT_HOURS,
  byNormKey: new Map(),
}

describe('filterPosSalesRowsToPaidBusinessDay', () => {
  it('puts overnight cash on open day not pay day', () => {
    const rows = [
      {
        order_no: '114',
        store_code: 'CM Silom',
        created_at: '2026-10-22T15:20:53.000Z',
        paid_at: '2026-10-23T06:41:06.000Z',
        payment_cash: 199,
      },
      {
        order_no: '185',
        store_code: 'CM Silom',
        created_at: '2026-10-22T16:00:00.000Z',
        paid_at: '2026-10-22T19:16:32.000Z',
        payment_cash: 249,
      },
    ]
    const on22 = filterPosSalesRowsToPaidBusinessDay(rows, BIZ_CTX, '2026-10-22', '2026-10-22')
    expect(on22.map((r) => r.order_no).sort()).toEqual(['114', '185'])
    expect(sumPosSalesPaymentCash(on22)).toBe(448)

    const on23 = filterPosSalesRowsToPaidBusinessDay(rows, BIZ_CTX, '2026-10-23', '2026-10-23')
    expect(on23.map((r) => r.order_no)).toEqual([])
    expect(sumPosSalesPaymentCash(on23)).toBe(0)
  })
})

describe('patchPosPaymentSummaryCash', () => {
  it('replaces cash row and drops zero cash', () => {
    const patched = patchPosPaymentSummaryCash(
      [
        { paymentKey: 'cash', sales: 4252 },
        { paymentKey: 'card', sales: 100 },
      ],
      4451
    )
    expect(patched.find((r) => r.paymentKey === 'cash')?.sales).toBe(4451)
    expect(patched.find((r) => r.paymentKey === 'card')?.sales).toBe(100)
  })
})
