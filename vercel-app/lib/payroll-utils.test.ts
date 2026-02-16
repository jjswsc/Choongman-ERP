import { describe, it, expect } from 'vitest'
import { getSSOLimitsByYear, calcSSO } from './payroll-utils'

describe('payroll-utils', () => {
  describe('getSSOLimitsByYear', () => {
    it('2025 이하: ceiling 15000, maxDed 750', () => {
      expect(getSSOLimitsByYear(2024)).toEqual({ ceiling: 15000, maxDed: 750 })
      expect(getSSOLimitsByYear(2025)).toEqual({ ceiling: 15000, maxDed: 750 })
    })

    it('2026~2028: ceiling 17500, maxDed 875', () => {
      expect(getSSOLimitsByYear(2026)).toEqual({ ceiling: 17500, maxDed: 875 })
      expect(getSSOLimitsByYear(2028)).toEqual({ ceiling: 17500, maxDed: 875 })
    })

    it('2029~2031: ceiling 20000, maxDed 1000', () => {
      expect(getSSOLimitsByYear(2029)).toEqual({ ceiling: 20000, maxDed: 1000 })
      expect(getSSOLimitsByYear(2031)).toEqual({ ceiling: 20000, maxDed: 1000 })
    })

    it('2032 이상: ceiling 23000, maxDed 1150', () => {
      expect(getSSOLimitsByYear(2032)).toEqual({ ceiling: 23000, maxDed: 1150 })
      expect(getSSOLimitsByYear(2040)).toEqual({ ceiling: 23000, maxDed: 1150 })
    })
  })

  describe('calcSSO', () => {
    it('급여 10000 → contributable 10000, 5% = 500', () => {
      expect(calcSSO(10000, 2025)).toBe(500)
    })

    it('급여가 ceiling 초과 시 contributable=ceiling, maxDed 적용', () => {
      // 20000 > 15000 → contributable=15000, floor(15000*0.05)=750, min(750,750)=750
      expect(calcSSO(20000, 2025)).toBe(750)
    })

    it('급여가 ceiling 이하면 5% 그대로', () => {
      expect(calcSSO(10000, 2025)).toBe(500)
    })
  })
})
