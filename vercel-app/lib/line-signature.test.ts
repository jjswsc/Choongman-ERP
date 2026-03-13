import { createLineSignature, verifyLineSignature } from '@/lib/line-signature'

describe('line-signature', () => {
  it('creates deterministic HMAC signature', () => {
    const body = '{"events":[{"type":"follow"}]}'
    const secret = 'test-secret'
    const sig1 = createLineSignature(body, secret)
    const sig2 = createLineSignature(body, secret)
    expect(sig1).toBe(sig2)
    expect(sig1.length).toBeGreaterThan(10)
  })

  it('verifies valid signature and rejects invalid one', () => {
    const body = '{"destination":"U123","events":[]}'
    const secret = 'another-secret'
    const valid = createLineSignature(body, secret)

    expect(verifyLineSignature(body, valid, secret)).toBe(true)
    expect(verifyLineSignature(body, 'invalid-signature', secret)).toBe(false)
    expect(verifyLineSignature(body, null, secret)).toBe(false)
  })
})
