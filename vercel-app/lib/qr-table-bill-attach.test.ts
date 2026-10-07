import { describe, expect, it } from 'vitest'
import {
  memoAlreadyAbsorbedOrder,
  qrTableNamesMatch,
  remapAbsorbedPosOrderLine,
  resolveQrBillAttach,
  type QrBillAttachCandidate,
} from '@/lib/qr-table-bill-attach'

function order(partial: Partial<QrBillAttachCandidate> & Pick<QrBillAttachCandidate, 'id'>): QrBillAttachCandidate {
  return {
    tableName: '7',
    orderType: 'dine_in',
    status: 'pending',
    createdAt: '2026-10-07T05:47:41.000Z',
    paymentSum: 0,
    ...partial,
  }
}

describe('resolveQrBillAttach', () => {
  it('matches table 7 and 7번', () => {
    expect(qrTableNamesMatch('7', '7번')).toBe(true)
    expect(qrTableNamesMatch('Table 7', '7')).toBe(true)
    expect(qrTableNamesMatch('8', '7')).toBe(false)
  })

  it('keeps the earlier food bill and absorbs a later drink bill', () => {
    const result = resolveQrBillAttach({
      sessionOrderId: 24,
      tableName: '7번',
      openOrders: [
        order({ id: 20, createdAt: '2026-10-07T05:47:41.000Z', tableName: '7' }),
        order({ id: 24, createdAt: '2026-10-07T05:54:51.000Z', tableName: '7번' }),
      ],
    })
    expect(result).toEqual({ targetOrderId: 20, absorbOrderIds: [24] })
  })

  it('does not absorb when the table has a single open bill', () => {
    const result = resolveQrBillAttach({
      sessionOrderId: 20,
      tableName: '7',
      openOrders: [order({ id: 20 })],
    })
    expect(result).toEqual({ targetOrderId: 20, absorbOrderIds: [] })
  })

  it('keeps the only paid bill and absorbs the unpaid drink bill', () => {
    const result = resolveQrBillAttach({
      sessionOrderId: 24,
      tableName: '7',
      openOrders: [
        order({ id: 20, paymentSum: 577, createdAt: '2026-10-07T05:47:41.000Z' }),
        order({ id: 24, paymentSum: 0, createdAt: '2026-10-07T05:54:51.000Z' }),
      ],
    })
    expect(result).toEqual({ targetOrderId: 20, absorbOrderIds: [24] })
  })

  it('does not auto-merge two paid bills', () => {
    const result = resolveQrBillAttach({
      sessionOrderId: 24,
      tableName: '7',
      openOrders: [
        order({ id: 20, paymentSum: 100, createdAt: '2026-10-07T05:47:41.000Z' }),
        order({ id: 24, paymentSum: 20, createdAt: '2026-10-07T05:54:51.000Z' }),
      ],
    })
    expect(result.absorbOrderIds).toEqual([])
    expect(result.targetOrderId).toBe(24)
  })

  it('ignores takeout and closed orders', () => {
    const result = resolveQrBillAttach({
      sessionOrderId: 0,
      tableName: '7',
      openOrders: [
        order({ id: 20 }),
        order({ id: 30, orderType: 'takeout' }),
        order({ id: 31, status: 'paid' }),
      ],
    })
    expect(result).toEqual({ targetOrderId: 20, absorbOrderIds: [] })
  })

  it('remaps absorbed line ids once', () => {
    expect(remapAbsorbedPosOrderLine({ id: 'qr-drink', name: 'Aquafina' }, 24, 0).id).toBe('m24-qr-drink')
    expect(remapAbsorbedPosOrderLine({ id: 'm24-qr-drink', name: 'Aquafina' }, 24, 0).id).toBe('m24-qr-drink')
    expect(memoAlreadyAbsorbedOrder('[ORDER_MERGE_KEEP 2026-10-07T00:00:00.000Z absorb_id=24]', 24)).toBe(
      true
    )
    expect(memoAlreadyAbsorbedOrder('table memo', 24)).toBe(false)
  })
})
