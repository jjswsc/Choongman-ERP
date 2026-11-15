import { describe, expect, it } from 'vitest'
import {
  computePersonSalesBonus,
  normalizeSalesBonusTiers,
  sumCumulativeTierBonus,
} from '@/lib/sales-bonus/compute-sales-bonus'

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
      role: 'Staff',
      managerMultiplier: 2,
      staffMultiplier: 1,
      absenceDays: 0,
      absencePenaltyPctPerDay: 5,
    })
    expect(r.baseAmount).toBe(2_000)
    expect(r.multiplier).toBe(1)
    expect(r.finalAmount).toBe(2_000)
  })

  it('applies manager 2x', () => {
    const r = computePersonSalesBonus({
      enabled: true,
      salesTotal: 650_000,
      tiers,
      role: 'Manager',
      managerMultiplier: 2,
      staffMultiplier: 1,
      absenceDays: 0,
      absencePenaltyPctPerDay: 5,
    })
    expect(r.roleAmount).toBe(4_000)
    expect(r.finalAmount).toBe(4_000)
  })

  it('subtracts penalty pct per absence day', () => {
    const r = computePersonSalesBonus({
      enabled: true,
      salesTotal: 650_000,
      tiers,
      role: 'Staff',
      managerMultiplier: 2,
      staffMultiplier: 1,
      absenceDays: 2,
      absencePenaltyPctPerDay: 5,
    })
    // 2000 * 10% = 200 → 1800
    expect(r.penaltyPct).toBe(10)
    expect(r.penaltyAmount).toBe(200)
    expect(r.finalAmount).toBe(1_800)
  })

  it('floors at 0 when penalty exceeds 100%', () => {
    const r = computePersonSalesBonus({
      enabled: true,
      salesTotal: 650_000,
      tiers,
      role: 'Staff',
      managerMultiplier: 2,
      staffMultiplier: 1,
      absenceDays: 25,
      absencePenaltyPctPerDay: 5,
    })
    expect(r.penaltyPct).toBe(100)
    expect(r.finalAmount).toBe(0)
  })

  it('returns 0 when disabled', () => {
    const r = computePersonSalesBonus({
      enabled: false,
      salesTotal: 999_999,
      tiers,
      role: 'Manager',
      managerMultiplier: 2,
      staffMultiplier: 1,
      absenceDays: 0,
      absencePenaltyPctPerDay: 0,
    })
    expect(r.finalAmount).toBe(0)
  })

  it('matches 점장 as manager', () => {
    const r = computePersonSalesBonus({
      enabled: true,
      salesTotal: 500_000,
      tiers,
      role: '점장',
      managerMultiplier: 2,
      staffMultiplier: 1,
      absenceDays: 0,
      absencePenaltyPctPerDay: 0,
    })
    expect(r.multiplier).toBe(2)
    expect(r.finalAmount).toBe(2_000)
  })
})
