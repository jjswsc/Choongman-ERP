import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './map-with-concurrency'

describe('mapWithConcurrency', () => {
  it('keeps input order and never exceeds the limit', async () => {
    let active = 0
    let peak = 0
    const out = await mapWithConcurrency([30, 10, 20, 5, 15], 2, async (ms, i) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, ms))
      active--
      return `${i}:${ms}`
    })
    expect(out).toEqual(['0:30', '1:10', '2:20', '3:5', '4:15'])
    expect(peak).toBe(2)
  })

  it('returns empty array for empty input', async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([])
  })
})
