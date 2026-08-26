import { describe, it, expect } from 'vitest'
import {
  PAYROLL_CYCLE_PRESET_26_25,
  PAYROLL_CYCLE_PRESET_CALENDAR,
  confirmedMonthPeriodWouldChange,
  defaultPayrollMonthForCycle,
  findConfirmedMonthBlockedByCycleChange,
  findOverlappingNeighborPeriod,
  lastDayOfMonthYmd,
  parsePayrollCycleSettings,
  payrollDateRangesOverlap,
  payrollPayYmdForCycle,
  resolvePayrollPeriod,
  upsertPayrollCycleVersion,
  ymdForDayOfMonth,
  type PayrollCycleSettings,
} from './payroll-cycle'

const CUTOFF_26_25: PayrollCycleSettings = {
  versions: [{ effectiveMonth: '2026-08', ...PAYROLL_CYCLE_PRESET_26_25 }],
}

describe('payroll-cycle', () => {
  describe('legacy calendar', () => {
    it('maps 2026-07 to 7/01~7/31 pay 8/05', () => {
      const p = resolvePayrollPeriod('2026-07')
      expect(p.start).toBe('2026-07-01')
      expect(p.end).toBe('2026-07-31')
      expect(p.payYmd).toBe('2026-08-05')
      expect(p.isLegacy).toBe(true)
      expect(p.isTransitionShort).toBe(false)
    })

    it('keeps months before effectiveMonth on calendar + next-month 5th', () => {
      const p = resolvePayrollPeriod('2026-07', CUTOFF_26_25)
      expect(p.start).toBe('2026-07-01')
      expect(p.end).toBe('2026-07-31')
      expect(p.payYmd).toBe('2026-08-05')
      expect(p.isLegacy).toBe(true)
    })
  })

  describe('26–25 cutoff from Aug 2026', () => {
    it('uses a short first month: 8/01~8/25 pay 8/31, full salary window not prorated here', () => {
      const p = resolvePayrollPeriod('2026-08', CUTOFF_26_25)
      expect(p.start).toBe('2026-08-01')
      expect(p.end).toBe('2026-08-25')
      expect(p.payYmd).toBe('2026-08-31')
      expect(p.isTransitionShort).toBe(true)
      expect(p.isLegacy).toBe(false)
    })

    it('maps 2026-09 to 8/26~9/25 pay 9/30', () => {
      const p = resolvePayrollPeriod('2026-09', CUTOFF_26_25)
      expect(p.start).toBe('2026-08-26')
      expect(p.end).toBe('2026-09-25')
      expect(p.payYmd).toBe('2026-09-30')
      expect(p.isTransitionShort).toBe(false)
    })

    it('does not overlap short August with September', () => {
      const aug = resolvePayrollPeriod('2026-08', CUTOFF_26_25)
      const sep = resolvePayrollPeriod('2026-09', CUTOFF_26_25)
      expect(payrollDateRangesOverlap(aug.start, aug.end, sep.start, sep.end)).toBe(false)
    })

    it('wraps Dec 26–Jan 25 across years', () => {
      const p = resolvePayrollPeriod('2027-01', CUTOFF_26_25)
      expect(p.start).toBe('2026-12-26')
      expect(p.end).toBe('2027-01-25')
      expect(p.payYmd).toBe('2027-01-31')
    })
  })

  describe('month-end and February', () => {
    it('uses calendar last day for day 0', () => {
      expect(lastDayOfMonthYmd('2026-02')).toBe('2026-02-28')
      expect(lastDayOfMonthYmd('2028-02')).toBe('2028-02-29')
      expect(lastDayOfMonthYmd('2026-08')).toBe('2026-08-31')
      expect(ymdForDayOfMonth('2026-02', 0)).toBe('2026-02-28')
      expect(ymdForDayOfMonth('2026-02', 31)).toBe('2026-02-28')
      expect(ymdForDayOfMonth('2026-02', 25)).toBe('2026-02-25')
    })

    it('starts March cycle on Feb 26 after a 25th cutoff', () => {
      const p = resolvePayrollPeriod('2026-03', {
        versions: [{ effectiveMonth: '2026-01', ...PAYROLL_CYCLE_PRESET_26_25 }],
      })
      expect(p.start).toBe('2026-02-26')
      expect(p.end).toBe('2026-03-25')
    })
  })

  describe('calendar preset after custom', () => {
    it('returns to 1st–last + next-month 5th', () => {
      const settings: PayrollCycleSettings = {
        versions: [
          { effectiveMonth: '2026-08', ...PAYROLL_CYCLE_PRESET_26_25 },
          { effectiveMonth: '2026-11', ...PAYROLL_CYCLE_PRESET_CALENDAR },
        ],
      }
      const p = resolvePayrollPeriod('2026-11', settings)
      expect(p.start).toBe('2026-11-01')
      expect(p.end).toBe('2026-11-30')
      expect(p.payYmd).toBe('2026-12-05')
      expect(p.isTransitionShort).toBe(false)
    })
  })

  describe('guards', () => {
    it('detects overlapping date ranges', () => {
      expect(payrollDateRangesOverlap('2026-08-01', '2026-08-25', '2026-08-26', '2026-09-25')).toBe(false)
      expect(payrollDateRangesOverlap('2026-08-01', '2026-08-31', '2026-08-26', '2026-09-25')).toBe(true)
    })

    it('blocks changing a confirmed month period', () => {
      expect(confirmedMonthPeriodWouldChange('2026-07', { versions: [] }, CUTOFF_26_25)).toBe(false)
      expect(confirmedMonthPeriodWouldChange('2026-08', { versions: [] }, CUTOFF_26_25)).toBe(true)
      expect(findConfirmedMonthBlockedByCycleChange(['2026-07', '2026-08'], { versions: [] }, CUTOFF_26_25)).toBe(
        '2026-08'
      )
    })

    it('flags neighbor overlap for the same employee', () => {
      const hit = findOverlappingNeighborPeriod({
        start: '2026-08-26',
        end: '2026-09-25',
        employees: [{ store: 'Silom', name: 'A', employeeId: 12 }],
        neighbors: [
          {
            store: 'Silom',
            name: 'A',
            employeeId: 12,
            month: '2026-08',
            periodStart: '2026-08-01',
            periodEnd: '2026-08-31',
          },
        ],
      })
      expect(hit).toEqual({ month: '2026-08', name: 'A' })
    })
  })

  describe('default month (Bangkok today)', () => {
    it('picks August on 2026-08-26 after a 25th cutoff', () => {
      expect(defaultPayrollMonthForCycle(CUTOFF_26_25, new Date('2026-08-26T12:00:00+07:00'))).toBe('2026-08')
    })

    it('stays on July on 2026-08-20 before the 25th cutoff', () => {
      expect(defaultPayrollMonthForCycle(CUTOFF_26_25, new Date('2026-08-20T12:00:00+07:00'))).toBe('2026-07')
    })

    it('uses previous calendar month on the 20th in legacy mode', () => {
      expect(defaultPayrollMonthForCycle({ versions: [] }, new Date('2026-08-20T12:00:00+07:00'))).toBe('2026-07')
    })
  })

  describe('parse / upsert', () => {
    it('parses snake_case and keeps one version per month', () => {
      const parsed = parsePayrollCycleSettings({
        versions: [
          { effective_month: '2026-08', period_end_day: 25, pay_day: 0, pay_month_offset: 0 },
          { effectiveMonth: '2026-08', periodEndDay: 25, payDay: 0, payMonthOffset: 0 },
        ],
      })
      expect(parsed.versions).toHaveLength(1)
      const next = upsertPayrollCycleVersion(parsed, {
        effectiveMonth: '2026-10',
        periodEndDay: 0,
        payDay: 5,
        payMonthOffset: 1,
      })
      expect(next.versions.map((v) => v.effectiveMonth)).toEqual(['2026-08', '2026-10'])
    })

    it('payrollPayYmdForCycle matches resolved pay day', () => {
      expect(payrollPayYmdForCycle('2026-08', CUTOFF_26_25)).toBe('2026-08-31')
      expect(payrollPayYmdForCycle('2026-07', CUTOFF_26_25)).toBe('2026-08-05')
    })
  })
})
