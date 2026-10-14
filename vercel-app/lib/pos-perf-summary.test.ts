import { describe, expect, it } from 'vitest'
import { normalizePosPerfEntries, summarizePosPerfEntries } from '@/lib/pos-perf-summary'

describe('pos-perf-summary', () => {
  it('이상값·잘못된 동작 이름은 버린다', () => {
    expect(
      normalizePosPerfEntries([
        { a: 'order_submit', ms: 1200.4, t: 1 },
        { a: 'Bad Name', ms: 10, t: 1 },
        { a: 'payment', ms: -5, t: 1 },
        { a: 'payment', ms: 'x', t: 1 },
        null,
      ])
    ).toEqual([{ a: 'order_submit', ms: 1200, t: 1 }])
    expect(normalizePosPerfEntries({ a: 'x' })).toEqual([])
  })

  it('동작별 p50·p95·최대·3초 이상 횟수', () => {
    const entries = [100, 200, 300, 400, 3500].map((ms, i) => ({ a: 'dinein_payment', ms, t: i }))
    entries.push({ a: 'checker_toggle', ms: 80, t: 9 })
    expect(summarizePosPerfEntries(entries)).toEqual([
      { action: 'checker_toggle', count: 1, p50: 80, p95: 80, max: 80, slow: 0 },
      { action: 'dinein_payment', count: 5, p50: 300, p95: 3500, max: 3500, slow: 1 },
    ])
  })
})
