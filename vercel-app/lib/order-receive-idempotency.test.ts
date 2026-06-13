import { describe, expect, it } from 'vitest'
import {
  buildOrderReceiveCanonicalKey,
  resolveOrderReceiveIdempotencyKey,
} from '@/lib/order-receive-idempotency'

describe('order-receive-idempotency', () => {
  it('same receive payload yields same canonical key', () => {
    const input = {
      orderId: 1433,
      isPartialReceive: true,
      inspectedIndices: [2, 0, 1],
      receivedQtys: { 1: 2, 0: 1 },
      receiveYmd: '2026-05-12',
    }
    expect(buildOrderReceiveCanonicalKey(input)).toBe(buildOrderReceiveCanonicalKey(input))
  })

  it('different indices yield different keys', () => {
    const base = {
      orderId: 1433,
      isPartialReceive: false,
      inspectedIndices: [] as number[],
      receivedQtys: null,
      receiveYmd: '2026-05-12',
    }
    const a = buildOrderReceiveCanonicalKey(base)
    const b = buildOrderReceiveCanonicalKey({ ...base, inspectedIndices: [0] })
    expect(a).not.toBe(b)
  })

  it('prefers client idempotency key when provided', () => {
    expect(
      resolveOrderReceiveIdempotencyKey({
        orderId: 1,
        clientKey: 'client-uuid-abc',
        isPartialReceive: false,
        inspectedIndices: [],
        receivedQtys: null,
        receiveYmd: '2026-05-12',
      })
    ).toBe('client-uuid-abc')
  })
})
