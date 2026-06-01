import { describe, expect, it } from 'vitest'
import { resolvePosOrderPaidAt } from '@/lib/pos-order-paid-at'
import type { PosOrder } from '@/lib/api-client'

const base: PosOrder = {
  id: 1,
  orderNo: 'T-001',
  storeCode: 'ST01',
  orderType: 'dine_in',
  tableName: '14',
  memo: '',
  items: [],
  subtotal: 238,
  vat: 0,
  total: 238,
  status: 'completed',
  createdAt: '2026-06-01T05:03:02.000Z',
  updatedAt: '2026-06-01T05:38:00.000Z',
  paymentQr: 238,
}

describe('resolvePosOrderPaidAt', () => {
  it('uses updated_at for paid dine-in when later than created_at', () => {
    expect(resolvePosOrderPaidAt(base)).toBe('2026-06-01T05:38:00.000Z')
  })

  it('prefers linkpos_responded_at for card payments', () => {
    expect(
      resolvePosOrderPaidAt({
        ...base,
        paymentQr: 0,
        paymentCard: 238,
        linkposRespondedAt: '2026-06-01T05:39:10.000Z',
      })
    ).toBe('2026-06-01T05:39:10.000Z')
  })

  it('falls back to created_at for unpaid pending orders', () => {
    expect(
      resolvePosOrderPaidAt({
        ...base,
        status: 'pending',
        paymentQr: 0,
        updatedAt: '2026-06-01T05:20:00.000Z',
      })
    ).toBe('2026-06-01T05:03:02.000Z')
  })

  it('uses updated_at when status is ready but payment exists', () => {
    expect(
      resolvePosOrderPaidAt({
        ...base,
        status: 'ready',
        paymentQr: 238,
        updatedAt: '2026-06-01T05:38:00.000Z',
      })
    ).toBe('2026-06-01T05:38:00.000Z')
  })
})
