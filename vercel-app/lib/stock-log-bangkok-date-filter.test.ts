import { describe, expect, it } from 'vitest'
import { stockLogBangkokDateRangeFilter } from '@/lib/bangkok-date'

describe('stockLogBangkokDateRangeFilter', () => {
  it('정렬이 뒤바뀐 start/end도 lo·hi로 정규화', () => {
    const { lo, hi } = stockLogBangkokDateRangeFilter('2026-06-14', '2026-06-01')
    expect(lo).toBe('2026-06-01')
    expect(hi).toBe('2026-06-14')
  })

  it('방콕 6/1 00:30은 6/1~6/14 구간 gte·lt에 포함', () => {
    const { gtePart, ltPart } = stockLogBangkokDateRangeFilter('2026-06-01', '2026-06-14')
    const gte = decodeURIComponent(gtePart.replace('log_date=gte.', ''))
    const lt = decodeURIComponent(ltPart.replace('log_date=lt.', ''))
    const sample = '2026-05-31T17:30:00.000Z' // Bangkok 2026-06-01 00:30
    expect(sample >= gte).toBe(true)
    expect(sample < lt).toBe(true)
  })

  it('방콕 6/15 00:30은 6/1~6/14 구간 밖', () => {
    const { gtePart, ltPart } = stockLogBangkokDateRangeFilter('2026-06-01', '2026-06-14')
    const gte = decodeURIComponent(gtePart.replace('log_date=gte.', ''))
    const lt = decodeURIComponent(ltPart.replace('log_date=lt.', ''))
    const sample = '2026-06-14T17:30:00.000Z' // Bangkok 2026-06-15 00:30
    expect(sample >= gte && sample < lt).toBe(false)
  })
})
