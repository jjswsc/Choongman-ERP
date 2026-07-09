import { afterEach, describe, expect, it } from 'vitest'
import { createLineOAuthState, verifyLineOAuthState } from '@/lib/member-line-login'

describe('member-line-login signed state', () => {
  afterEach(() => {
    delete process.env.LINE_LOGIN_CHANNEL_SECRET
    delete process.env.LINE_CHANNEL_SECRET
    delete process.env.JWT_SECRET
  })

  it('creates and verifies state without cookie', () => {
    process.env.LINE_LOGIN_CHANNEL_SECRET = 'test-line-login-secret-32'
    const state = createLineOAuthState()
    const result = verifyLineOAuthState(state)
    expect(result.ok).toBe(true)
    expect(result.joinStoreCode).toBeUndefined()
  })

  it('embeds join store in signed state', () => {
    process.env.LINE_LOGIN_CHANNEL_SECRET = 'test-line-login-secret-32'
    const state = createLineOAuthState('STORE01')
    const result = verifyLineOAuthState(state)
    expect(result.ok).toBe(true)
    expect(result.joinStoreCode).toBe('STORE01')
  })

  it('rejects tampered state', () => {
    process.env.LINE_LOGIN_CHANNEL_SECRET = 'test-line-login-secret-32'
    const state = createLineOAuthState()
    const result = verifyLineOAuthState(`${state}x`)
    expect(result.ok).toBe(false)
  })

  it('rejects expired state', () => {
    process.env.LINE_LOGIN_CHANNEL_SECRET = 'test-line-login-secret-32'
    const state = createLineOAuthState()
    const parts = state.split('.')
    const expiredAt = String(Date.now() - 11 * 60 * 1000)
    const tampered = `${parts[0]}.${expiredAt}.${parts[2]}.${parts[3]}`
    const result = verifyLineOAuthState(tampered)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('expired')
  })
})
