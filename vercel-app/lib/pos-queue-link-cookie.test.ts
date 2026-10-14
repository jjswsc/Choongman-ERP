import { describe, expect, it } from 'vitest'
import { buildPosQueueLinkCookie, readPosQueueLinkTokenFromCookieHeader } from './pos-queue-link-cookie'

describe('pos queue link cookie', () => {
  it('round-trips a valid token', () => {
    const cookie = buildPosQueueLinkCookie('abcDEF123_-x', true)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(readPosQueueLinkTokenFromCookieHeader('a=1; cm_queue_link=abcDEF123_-x; b=2')).toBe('abcDEF123_-x')
  })

  it('rejects path-like or short values', () => {
    expect(readPosQueueLinkTokenFromCookieHeader('cm_queue_link=..%2Fadmin')).toBe('')
    expect(readPosQueueLinkTokenFromCookieHeader('cm_queue_link=abc')).toBe('')
    expect(readPosQueueLinkTokenFromCookieHeader('')).toBe('')
  })
})
