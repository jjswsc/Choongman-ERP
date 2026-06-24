import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  cronAuthErrorResponse,
  isCronAuthorized,
  isVercelCronRequest,
  readCronBearerToken,
} from './verify-cron-auth'

function req(url: string, init?: RequestInit) {
  return new NextRequest(url, init)
}

describe('verify-cron-auth', () => {
  it('detects vercel-cron user agent', () => {
    expect(
      isVercelCronRequest(
        req('https://example.com/api/cron', { headers: { 'user-agent': 'vercel-cron/1.0' } })
      )
    ).toBe(true)
    expect(isVercelCronRequest(req('https://example.com/api/cron'))).toBe(false)
  })

  it('parses Bearer token', () => {
    expect(
      readCronBearerToken(
        req('https://example.com', { headers: { authorization: 'Bearer abc123' } })
      )
    ).toBe('abc123')
  })

  it('authorizes matching CRON_SECRET', () => {
    vi.stubEnv('CRON_SECRET', 'test-secret-16chars')
    expect(
      isCronAuthorized(
        req('https://example.com', { headers: { authorization: 'Bearer test-secret-16chars' } })
      )
    ).toBe(true)
    vi.unstubAllEnvs()
  })

  it('returns 503 when vercel-cron runs without CRON_SECRET', () => {
    vi.stubEnv('CRON_SECRET', '')
    const res = cronAuthErrorResponse(
      req('https://example.com', { headers: { 'user-agent': 'vercel-cron/1.0' } })
    )
    expect(res?.status).toBe(503)
    vi.unstubAllEnvs()
  })
})
