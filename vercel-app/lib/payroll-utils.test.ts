import { describe, it, expect } from 'vitest'
import {
  getSSOLimitsByYear,
  calcSSO,
  grossWageBeforeSSO,
  otMinutesForPayroll,
  roundSsoContributionBaht,
  ssoContributableWageBaht,
  ssoContributionBaseWage,
  resolveSsoFilingWageBaht,
} from './payroll-utils'

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
          diligenceAllow: 0,
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

  describe('ssoContributionBaseWage', () => {
    it('월급제 → sal_amt', () => {
      expect(ssoContributionBaseWage(false, 18000, 9000)).toBe(18000)
    })
    it('시급제 → 해당 월 기본급', () => {
      expect(ssoContributionBaseWage(true, 70, 15000)).toBe(15000)
    })
  })

  describe('ssoContributableWageBaht', () => {
    it('applies 1650 floor when wage below minimum', () => {
      expect(ssoContributableWageBaht(1000, 2026)).toBe(1650)
    })

    it('keeps zero wage as zero', () => {
      expect(ssoContributableWageBaht(0, 2026)).toBe(0)
    })

    it('caps at year ceiling', () => {
      expect(ssoContributableWageBaht(20000, 2026)).toBe(17500)
    })
  })

  describe('roundSsoContributionBaht', () => {
    it('rounds up from 50 satang', () => {
      expect(roundSsoContributionBaht(82.5)).toBe(83)
    })

    it('truncates below 50 satang', () => {
      expect(roundSsoContributionBaht(82.49)).toBe(82)
    })
  })

  describe('calcSSO', () => {
    it('급여 10000 → contributable 10000, 5% = 500', () => {
      expect(calcSSO(10000, 2025)).toBe(500)
    })

    it('급여가 ceiling 초과 시 contributable=ceiling, maxDed 적용', () => {
      expect(calcSSO(20000, 2025)).toBe(750)
    })

    it('2026: 17000 → 850', () => {
      expect(calcSSO(17000, 2026)).toBe(850)
    })

    it('2026: below 1650 uses floor then 5%', () => {
      expect(calcSSO(1200, 2026)).toBe(83)
    })

    it('2026: above ceiling 17500 → maxDed 875', () => {
      expect(calcSSO(30000, 2026)).toBe(875)
    })
  })

  describe('resolveSsoFilingWageBaht', () => {
    const row = {
      ssoBase: 15000,
      ssoGrossWage: 18000,
      ssoContributableWage: 17500,
    }

    it('picks field by mode', () => {
      expect(resolveSsoFilingWageBaht(row, 'basic')).toBe(15000)
      expect(resolveSsoFilingWageBaht(row, 'gross')).toBe(18000)
      expect(resolveSsoFilingWageBaht(row, 'contributable')).toBe(17500)
    })
  })
})
