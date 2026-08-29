import { describe, expect, it } from 'vitest'
import { isPollTargetVisible, resolveVisiblePollDelayMs } from '@/lib/use-visible-polling'

describe('resolveVisiblePollDelayMs', () => {
  it('accepts a fixed interval', () => {
    expect(resolveVisiblePollDelayMs(30_000)).toBe(30_000)
  })

  it('accepts a resolver so callers can back off per tick', () => {
    expect(resolveVisiblePollDelayMs(() => 45_000)).toBe(45_000)
  })

  it('treats non-positive delays as disabled', () => {
    expect(resolveVisiblePollDelayMs(0)).toBe(0)
    expect(resolveVisiblePollDelayMs(-1)).toBe(0)
    expect(resolveVisiblePollDelayMs(() => Number.NaN)).toBe(0)
  })
})

describe('isPollTargetVisible', () => {
  it('skips API calls only while the tab is hidden', () => {
    expect(isPollTargetVisible('hidden')).toBe(false)
    expect(isPollTargetVisible('visible')).toBe(true)
  })

  it('polls on the server/unknown state instead of stalling', () => {
    expect(isPollTargetVisible(undefined)).toBe(true)
  })
})
