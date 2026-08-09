import { describe, expect, it } from 'vitest'
import {
  normalizeDowsQueryString,
  parseDowsParam,
} from '@/lib/pos-sales-dow-filter'

describe('parseDowsParam', () => {
  it('returns null for empty or all seven', () => {
    expect(parseDowsParam(null)).toBeNull()
    expect(parseDowsParam('')).toBeNull()
    expect(parseDowsParam('0,1,2,3,4,5,6')).toBeNull()
  })

  it('parses unique sorted weekdays', () => {
    expect(parseDowsParam('6,5,5')).toEqual([5, 6])
    expect(parseDowsParam('1')).toEqual([1])
  })

  it('ignores invalid tokens', () => {
    expect(parseDowsParam('foo,9,5')).toEqual([5])
  })
})

describe('normalizeDowsQueryString', () => {
  it('returns empty for all/none', () => {
    expect(normalizeDowsQueryString('0,1,2,3,4,5,6')).toBe('')
    expect(normalizeDowsQueryString('')).toBe('')
  })

  it('normalizes selection', () => {
    expect(normalizeDowsQueryString('6,1')).toBe('1,6')
  })
})
