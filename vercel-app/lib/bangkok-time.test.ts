import { describe, expect, it } from 'vitest'
import { getBangkokHmString, parseBangkokWallClockToMs } from '@/lib/bangkok-time'

describe('getBangkokHmString', () => {
  it('formats Asia/Bangkok HH:mm', () => {
    expect(getBangkokHmString(new Date('2026-10-30T05:00:00.000Z'))).toBe('12:00')
    expect(getBangkokHmString(new Date('2026-10-30T02:15:00.000Z'))).toBe('09:15')
  })
})

describe('parseBangkokWallClockToMs', () => {
  it('reads naive Bangkok wall clock', () => {
    expect(parseBangkokWallClockToMs('2026-08-18 09:31:04')).toBe(
      Date.parse('2026-08-18T09:31:04+07:00')
    )
  })

  it('treats PostgREST Z / +00:00 as the same Bangkok digits', () => {
    const expected = Date.parse('2026-08-18T09:31:04+07:00')
    expect(parseBangkokWallClockToMs('2026-08-18T09:31:04.000Z')).toBe(expected)
    expect(parseBangkokWallClockToMs('2026-08-18T09:31:04+00:00')).toBe(expected)
  })

  it('keeps a real +07:00 offset', () => {
    expect(parseBangkokWallClockToMs('2026-08-18T09:31:04+07:00')).toBe(
      Date.parse('2026-08-18T09:31:04+07:00')
    )
  })

  it('returns null for empty input', () => {
    expect(parseBangkokWallClockToMs('')).toBeNull()
    expect(parseBangkokWallClockToMs(null)).toBeNull()
  })
})
