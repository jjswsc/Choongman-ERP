import { describe, it, expect } from 'vitest'
import { getSSOLimitsByYear, calcSSO, grossWageBeforeSSO, otMinutesForPayroll } from './payroll-utils'

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

  describe('otMinutesForPayroll', () => {
    it('30분 미만 → 0', () => {
      expect(otMinutesForPayroll(0)).toBe(0)
      expect(otMinutesForPayroll(29)).toBe(0)
    })

    it('30분 이상 → 내림한 정수 분', () => {
      expect(otMinutesForPayroll(30)).toBe(30)
      expect(otMinutesForPayroll(45)).toBe(45)
      expect(otMinutesForPayroll(30.9)).toBe(30)
    })
  })

  describe('grossWageBeforeSSO', () => {
    it('기본급+수당+OT − 지각·조퇴 − 무급결석', () => {
      expect(
        grossWageBeforeSSO({
          salary: 20000,
          posAllow: 2000,
          hazAllow: 500,
          birthBonus: 0,
          holidayPay: 1000,
          otAmt: 3000,
          lateDed: 500,
          earlyDed: 200,
          unpaidAbsenceDed: 800,
        })
      ).toBe(25000)
    })

    it('공제가 크면 0으로 바닥', () => {
      expect(
        grossWageBeforeSSO({
          salary: 10000,
          posAllow: 0,
          hazAllow: 0,
          birthBonus: 0,
          holidayPay: 0,
          otAmt: 0,
          lateDed: 50000,
          earlyDed: 0,
        })
      ).toBe(0)
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
