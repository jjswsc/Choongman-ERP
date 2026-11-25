import { describe, expect, it } from 'vitest'
import {
  billingPctsEqual,
  predecessorPoBillingRate,
  resolvePoBillingRateForDate,
  type PoBillingRateVersionRow,
} from '@/lib/po-billing-rate-versions'

const VERSIONS: PoBillingRateVersionRow[] = [
  {
    store_name: 'CM Asoke',
    effective_from: '2000-01-01',
    royalty_pct: 1,
    delivery_gp_pct: 0,
    grab_gp_pct: 3,
  },
  {
    store_name: 'CM Asoke',
    effective_from: '2026-11-16',
    royalty_pct: 2,
    delivery_gp_pct: 1,
    grab_gp_pct: 3,
  },
]

describe('resolvePoBillingRateForDate', () => {
  it('적용일 이전은 구버전', () => {
    const r = resolvePoBillingRateForDate(VERSIONS, '2026-11-15', 'CM Asoke')
    expect(r?.royalty_pct).toBe(1)
    expect(r?.delivery_gp_pct).toBe(0)
  })

  it('적용일 당일부터 신버전', () => {
    const r = resolvePoBillingRateForDate(VERSIONS, '2026-11-16', 'CM Asoke')
    expect(r?.royalty_pct).toBe(2)
    expect(r?.delivery_gp_pct).toBe(1)
  })

  it('버전 없으면 null', () => {
    expect(resolvePoBillingRateForDate([], '2026-11-01', 'CM Asoke')).toBeNull()
  })
})

describe('predecessorPoBillingRate / billingPctsEqual', () => {
  it('신규 적용일 직전 비율', () => {
    const pred = predecessorPoBillingRate(VERSIONS, '2026-12-01', 'CM Asoke')
    expect(pred?.royalty_pct).toBe(2)
  })

  it('동일 %면 equal', () => {
    expect(
      billingPctsEqual(
        { royalty_pct: 1, delivery_gp_pct: 0, grab_gp_pct: 3 },
        { royalty_pct: 1, delivery_gp_pct: 0, grab_gp_pct: 3 }
      )
    ).toBe(true)
    expect(
      billingPctsEqual(
        { royalty_pct: 1, delivery_gp_pct: 0, grab_gp_pct: 3 },
        { royalty_pct: 2, delivery_gp_pct: 0, grab_gp_pct: 3 }
      )
    ).toBe(false)
  })
})
