import { describe, expect, it } from 'vitest'
import {
  computePersonSalesBonus,
  normalizeSalesBonusTiers,
  sumCumulativeTierBonus,
} from '@/lib/sales-bonus/compute-sales-bonus'
import {
  buildPosterSalesBonusTiers,
  CHOONGMAN_POSTER_SALES_BONUS_BASES,
} from '@/lib/sales-bonus/poster-tiers'
import { isSalesBonusExcusedLeaveType } from '@/lib/sales-bonus/absence-leave'
import {
  listYearMonthsInclusive,
  resolveSalesBonusCalendarPeriod,
} from '@/lib/sales-bonus/period'

const tiers = [
  { threshold: 500_000, amount: 1_000 },
  { threshold: 600_000, amount: 1_000 },
  { threshold: 700_000, amount: 1_500 },
]

describe('normalizeSalesBonusTiers', () => {
  it('sorts by threshold', () => {
    const n = normalizeSalesBonusTiers([
      { threshold: 600_000, amount: 1_000 },
      { threshold: 500_000, amount: 1_000 },
    ])
    expect(n.map((t) => t.threshold)).toEqual([500_000, 600_000])
  })
})

describe('sumCumulativeTierBonus', () => {
  it('sums all tiers when sales exceeds highest', () => {
    const { baseAmount, appliedTiers } = sumCumulativeTierBonus(750_000, tiers)
    expect(appliedTiers).toHaveLength(3)
    expect(baseAmount).toBe(3_500)
  })

  it('sums partial tiers', () => {
    expect(sumCumulativeTierBonus(550_000, tiers).baseAmount).toBe(1_000)
    expect(sumCumulativeTierBonus(650_000, tiers).baseAmount).toBe(2_000)
  })

  it('returns 0 below first threshold', () => {
    expect(sumCumulativeTierBonus(499_999, tiers).baseAmount).toBe(0)
  })
})

describe('computePersonSalesBonus', () => {
  it('gives each person full cumulative base', () => {
    const r = computePersonSalesBonus({
      enabled: true,
      salesTotal: 650_000,
      tiers,
      employeeId: 10,
      doubleBonusEmployeeId: 99,
      managerMultiplier: 2,
      staffMultiplier: 1,
      absenceDays: 0,
      absencePenaltyPctPerDay: 5,
    })
    expect(r.baseAmount).toBe(2_000)
    expect(r.multiplier).toBe(1)
    expect(r.finalAmount).toBe(2_000)
    expect(r.isDoubleBonusDesignee).toBe(false)
  })

  it('applies 2x only to designated employee, not role', () => {
    const designee = computePersonSalesBonus({
      enabled: true,
      salesTotal: 500_000,
      tiers,
      employeeId: 42,
      doubleBonusEmployeeId: 42,
      managerMultiplier: 2,
      staffMultiplier: 1,
      absenceDays: 0,
      absencePenaltyPctPerDay: 0,
    })
    expect(designee.multiplier).toBe(2)
    expect(designee.finalAmount).toBe(2_000)
    expect(designee.isDoubleBonusDesignee).toBe(true)

    const other = computePersonSalesBonus({
      enabled: true,
      salesTotal: 500_000,
      tiers,
      employeeId: 7,
      doubleBonusEmployeeId: 42,
      managerMultiplier: 2,
      staffMultiplier: 1,
      absenceDays: 0,
      absencePenaltyPctPerDay: 0,
    })
    expect(other.multiplier).toBe(1)
    expect(other.finalAmount).toBe(1_000)
  })

  it('zeroes bonus on 1 absence day at 100% penalty', () => {
    const r = computePersonSalesBonus({
      enabled: true,
      salesTotal: 500_000,
      tiers,
      employeeId: 1,
      doubleBonusEmployeeId: 1,
      managerMultiplier: 2,
      staffMultiplier: 1,
      absenceDays: 1,
      absencePenaltyPctPerDay: 100,
    })
    expect(r.penaltyPct).toBe(100)
    expect(r.finalAmount).toBe(0)
  })

  it('returns 0 when disabled', () => {
    const r = computePersonSalesBonus({
      enabled: false,
      salesTotal: 999_999,
      tiers,
      employeeId: 1,
      doubleBonusEmployeeId: 1,
      managerMultiplier: 2,
      staffMultiplier: 1,
      absenceDays: 0,
      absencePenaltyPctPerDay: 0,
    })
    expect(r.finalAmount).toBe(0)
  })
})

describe('poster sales bonus tiers', () => {
  it('uses MBK 1.6M (not poster 1.5M)', () => {
    const mbk = CHOONGMAN_POSTER_SALES_BONUS_BASES.find((x) => x.storeCode === 'CM MBK')
    expect(mbk?.baseTarget).toBe(1_600_000)
  })

  it('base 1.6M → 1000, +100k → 1500, designee 2x', () => {
    const t = buildPosterSalesBonusTiers(1_600_000)
    expect(sumCumulativeTierBonus(1_599_999, t).baseAmount).toBe(0)
    expect(sumCumulativeTierBonus(1_600_000, t).baseAmount).toBe(1_000)
    expect(sumCumulativeTierBonus(1_700_000, t).baseAmount).toBe(1_500)
    expect(sumCumulativeTierBonus(1_800_000, t).baseAmount).toBe(2_000)
    const mgr = computePersonSalesBonus({
      enabled: true,
      salesTotal: 1_700_000,
      tiers: t,
      employeeId: 9,
      doubleBonusEmployeeId: 9,
      managerMultiplier: 2,
      staffMultiplier: 1,
      absenceDays: 0,
      absencePenaltyPctPerDay: 100,
    })
    expect(mgr.finalAmount).toBe(3_000)
  })
})

describe('resolveSalesBonusCalendarPeriod', () => {
  it('uses full calendar month and next-month payout day', () => {
    const p = resolveSalesBonusCalendarPeriod('2026-11', 5)
    expect(p.start).toBe('2026-11-01')
    expect(p.end).toBe('2026-11-30')
    expect(p.payYmd).toBe('2026-12-05')
  })

  it('supports payout day 1', () => {
    expect(resolveSalesBonusCalendarPeriod('2026-11', 1).payYmd).toBe('2026-12-01')
  })

  it('follows payroll payday when payoutDay is 0 (default cycle → next month day 5)', () => {
    const p = resolveSalesBonusCalendarPeriod('2026-11', 0)
    expect(p.payoutDay).toBe(0)
    expect(p.start).toBe('2026-11-01')
    expect(p.end).toBe('2026-11-30')
    expect(p.payYmd).toBe('2026-12-05')
  })

  it('follows 26–25 cycle payday when configured', () => {
    const cycle = {
      versions: [
        {
          effectiveMonth: '2026-01',
          periodEndDay: 25,
          payDay: 0,
          payMonthOffset: 0,
        },
      ],
    }
    const p = resolveSalesBonusCalendarPeriod('2026-11', 0, cycle)
    expect(p.payYmd).toBe('2026-11-30')
  })
})

describe('isSalesBonusExcusedLeaveType', () => {
  it('excuses sick, annual, lakij; not unpaid or empty', () => {
    expect(isSalesBonusExcusedLeaveType('병가')).toBe(true)
    expect(isSalesBonusExcusedLeaveType('연차')).toBe(true)
    expect(isSalesBonusExcusedLeaveType('ลากิจ')).toBe(true)
    expect(isSalesBonusExcusedLeaveType('휴가')).toBe(true)
    expect(isSalesBonusExcusedLeaveType('무급휴가')).toBe(false)
    expect(isSalesBonusExcusedLeaveType('Unpaid')).toBe(false)
    expect(isSalesBonusExcusedLeaveType('')).toBe(false)
  })
})

describe('listYearMonthsInclusive', () => {
  it('lists inclusive months', () => {
    expect(listYearMonthsInclusive('2026-10', '2026-12')).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
    ])
  })

  it('rejects inverted or oversized ranges', () => {
    expect(listYearMonthsInclusive('2026-12', '2026-10')).toEqual([])
    expect(listYearMonthsInclusive('2024-01', '2026-12', 12)).toEqual([])
  })
})
