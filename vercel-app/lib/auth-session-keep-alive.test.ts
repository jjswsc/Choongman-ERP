import { describe, expect, it, vi, afterEach } from 'vitest'
import { AUTH_TOKEN_REFRESH_WITHIN_SEC, AUTH_TOKEN_TTL_SEC } from '@/lib/auth-token-ttl'
import { shouldRefreshAuthToken } from '@/lib/auth-session-keep-alive'
import { readJwtRemainingSec } from '@/lib/jwt-payload-client'

function tokenWithExp(expSec: number): string {
  const payload = Buffer.from(JSON.stringify({ store: 'S', name: 'N', role: 'director', exp: expSec }), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`
}

describe('auth session keep-alive', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('TTL은 Chrome 쿠키 상한(400일)보다 짧고 7일보다 길다', () => {
    expect(AUTH_TOKEN_TTL_SEC).toBe(365 * 24 * 60 * 60)
    expect(AUTH_TOKEN_TTL_SEC).toBeLessThan(400 * 24 * 60 * 60)
    expect(AUTH_TOKEN_REFRESH_WITHIN_SEC).toBe(30 * 24 * 60 * 60)
  })

  it('남은 수명이 30일 미만이면 재발급', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T12:00:00+07:00'))
    const now = Math.floor(Date.now() / 1000)
    expect(shouldRefreshAuthToken(tokenWithExp(now + 7 * 24 * 60 * 60))).toBe(true)
    expect(shouldRefreshAuthToken(tokenWithExp(now + 40 * 24 * 60 * 60))).toBe(false)
    expect(shouldRefreshAuthToken(tokenWithExp(now - 60))).toBe(false)
    expect(readJwtRemainingSec(tokenWithExp(now + 120))).toBeCloseTo(120, 0)
  })
})
