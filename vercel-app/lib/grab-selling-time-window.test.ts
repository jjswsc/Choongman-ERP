import { describe, expect, it } from 'vitest'
import { grabSellingTimeWindowForSlot } from '@/lib/grab-selling-time-window'

describe('grabSellingTimeWindowForSlot', () => {
  it('slot 0 uses doc-style start (not 2020-01-01) to avoid Grab onboarding duplicate', () => {
    const w = grabSellingTimeWindowForSlot(0)
    expect(w.startTime).toBe('2020-01-09 00:00:00')
    expect(w.endTime).toBe('2039-12-31 23:59:59')
  })

  it('different slots have distinct startTime+endTime pairs', () => {
    const pairs = new Set<string>()
    for (let i = 0; i < 5; i++) {
      const w = grabSellingTimeWindowForSlot(i)
      pairs.add(`${w.startTime}|${w.endTime}`)
    }
    expect(pairs.size).toBe(5)
  })
})
