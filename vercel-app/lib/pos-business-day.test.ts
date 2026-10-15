import { describe, expect, it } from 'vitest'
import {
  addDaysYmd,
  getBangkokDateStr,
  getPosBusinessDateStrFromConfig,
  POS_TIMEZONE,
} from '@/lib/pos-business-day'

function intlYmd(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: POS_TIMEZONE })
}

describe('getBangkokDateStr', () => {
  it('Intl(Asia/Bangkok) 결과와 같다 — 자정 경계 포함', () => {
    const samples: number[] = []
    for (let day = 0; day < 400; day += 1) {
      const midnightBkk = Date.UTC(2025, 0, 1 + day) - 7 * 3600_000
      samples.push(midnightBkk - 1, midnightBkk, midnightBkk + 1, midnightBkk + 13 * 3600_000)
    }
    let seed = 12345
    for (let i = 0; i < 2000; i += 1) {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      samples.push(Date.UTC(1990, 0, 1) + (seed / 2 ** 31) * (Date.UTC(2060, 0, 1) - Date.UTC(1990, 0, 1)))
    }
    for (const ms of samples) {
      expect(getBangkokDateStr(new Date(ms))).toBe(intlYmd(ms))
    }
  })

  it('Invalid Date 는 기존과 동일', () => {
    const bad = new Date('nope')
    expect(getBangkokDateStr(bad)).toBe(bad.toLocaleDateString('en-CA', { timeZone: POS_TIMEZONE }))
  })
})

describe('addDaysYmd', () => {
  it('월·연·윤년 경계', () => {
    expect(addDaysYmd('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysYmd('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysYmd('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysYmd('2026-10-15', 0)).toBe('2026-10-15')
  })
})

describe('getPosBusinessDateStrFromConfig', () => {
  const hours = { start: { hour: 8, minute: 0 }, end: { hour: 8, minute: 0 } }
  it('영업 시작 전 새벽은 전날 영업일', () => {
    expect(getPosBusinessDateStrFromConfig(new Date('2026-10-15T07:59:00+07:00'), hours)).toBe('2026-10-14')
    expect(getPosBusinessDateStrFromConfig(new Date('2026-10-15T08:00:00+07:00'), hours)).toBe('2026-10-15')
  })
})
