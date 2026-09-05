import { describe, expect, it } from 'vitest'
import {
  buildPosPaymentAttemptRowFromLinkpos,
  resolvePosPaymentAttemptLocalTxId,
} from './pos-payment-attempt-local-tx'

describe('resolvePosPaymentAttemptLocalTxId', () => {
  it('uses trimmed reference1 when present', () => {
    expect(resolvePosPaymentAttemptLocalTxId({ reference1: '  POS1234567890  ', orderId: 9 })).toBe(
      'POS1234567890'
    )
  })

  it('does not use empty string as local_tx_id', () => {
    const id = resolvePosPaymentAttemptLocalTxId({
      reference1: '',
      orderId: 102198,
      nowMs: 1_725_000_000_000,
      nonce: 'abc',
    })
    expect(id).toBe('GEN102198-abc')
    expect(id).not.toBe('')
  })

  it('generates distinct ids when reference1 is missing', () => {
    const a = resolvePosPaymentAttemptLocalTxId({ orderId: 1, nonce: 'aaa111' })
    const b = resolvePosPaymentAttemptLocalTxId({ orderId: 1, nonce: 'bbb222' })
    expect(a).not.toBe(b)
    expect(a.startsWith('GEN1-')).toBe(true)
    expect(b.startsWith('GEN1-')).toBe(true)
  })
})

describe('buildPosPaymentAttemptRowFromLinkpos', () => {
  it('fills a unique local_tx_id when hybrid payment omits reference1', () => {
    const row = buildPosPaymentAttemptRowFromLinkpos({
      orderId: 55,
      nowIso: '2026-09-05T13:34:14.000Z',
      linkposPayment: {
        responseCode: '00',
        approvalCode: '123456',
        requestedAmount: 199,
        approvedAmount: 199,
      },
    })
    expect(String(row.local_tx_id)).toMatch(/^GEN55-/)
    expect(row.status).toBe('approved')
    expect(row.order_id).toBe(55)
  })
})
