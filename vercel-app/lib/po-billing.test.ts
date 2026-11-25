import { describe, expect, it } from 'vitest'
import { POS_BUSINESS_DAY_DEFAULT_HOURS } from '@/lib/pos-business-day'
import type { PosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'
import { filterRowsByPosSalesBusinessDateRange } from '@/lib/pos-sales-business-day-range'
import {
  aggregatePoBillingSales,
  buildPoBillingDraftLines,
  buildPoBillingDraftLinesFromSegments,
  buildPoBillingRateSegments,
} from '@/lib/po-billing'
import type { PoBillingRateVersionRow } from '@/lib/po-billing-rate-versions'

const BIZ_CTX: PosBusinessDaySettingsContext = {
  globalDefault: POS_BUSINESS_DAY_DEFAULT_HOURS,
  byNormKey: new Map(),
}

describe('aggregatePoBillingSales (영업일 = 매출 관리)', () => {
  it('6월 조회: 7/1 08:00 전 Grab은 포함, 6/1 08:00 전 Grab은 제외 (08:00 롤링)', () => {
    const rows = [
      {
        created_at: '2026-06-30T17:30:00.000Z', // 2026-07-01 00:30 BKK → 영업일 6/30
        status: 'completed',
        order_type: 'delivery',
        total: 4_712,
        delivery_app_code: 'grab',
        store_code: 'CM True Digital',
      },
      {
        created_at: '2026-05-31T17:30:00.000Z', // 2026-06-01 00:30 BKK → 영업일 5/31
        status: 'completed',
        order_type: 'delivery',
        total: 999,
        delivery_app_code: 'grab',
        store_code: 'CM True Digital',
      },
      {
        created_at: '2026-06-15T12:00:00.000Z',
        status: 'completed',
        order_type: 'dine_in',
        total: 50_000,
        store_code: 'CM True Digital',
      },
    ]
    const filtered = filterRowsByPosSalesBusinessDateRange(rows, BIZ_CTX, '2026-06-01', '2026-06-30')
    const snap = aggregatePoBillingSales(filtered)
    expect(snap.grabSales).toBe(4_712)
    expect(snap.totalSales).toBe(54_712)
  })

  it('Grab GP 3% — 영업일 Grab 매출 기준', () => {
    const snap = { totalSales: 0, deliverySales: 0, grabSales: 203_042 }
    const lines = buildPoBillingDraftLines(
      {
        store_name: 'CM True Digital',
        royalty_pct: 0,
        delivery_gp_pct: 0,
        grab_gp_pct: 3,
      },
      snap,
      '2026-06-01 ~ 2026-06-30',
      { royalty: 'Royalty', deliveryGp: 'Delivery GP', grabGp: 'Grab GP' },
      'grab_gp'
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]?.price).toBe(6_091.26)
  })
})

describe('buildPoBillingRateSegments (일별 비율)', () => {
  const versions: PoBillingRateVersionRow[] = [
    {
      store_name: 'CM Asoke',
      effective_from: '2000-01-01',
      royalty_pct: 1,
      delivery_gp_pct: 0,
      grab_gp_pct: 0,
    },
    {
      store_name: 'CM Asoke',
      effective_from: '2026-11-16',
      royalty_pct: 2,
      delivery_gp_pct: 0,
      grab_gp_pct: 0,
    },
  ]

  it('비율 변경일 전후 구간 분리', () => {
    const rows = [
      {
        created_at: '2026-11-10T05:00:00.000Z', // BKK 12:00 → 영업일 11/10
        status: 'completed',
        order_type: 'dine_in',
        total: 100_000,
        store_code: 'CM Asoke',
      },
      {
        created_at: '2026-11-20T05:00:00.000Z',
        status: 'completed',
        order_type: 'dine_in',
        total: 50_000,
        store_code: 'CM Asoke',
      },
    ]
    const segs = buildPoBillingRateSegments(rows, versions, BIZ_CTX, 'CM Asoke', null)
    expect(segs).toHaveLength(2)
    expect(segs[0]?.settings.royalty_pct).toBe(1)
    expect(segs[0]?.snap.totalSales).toBe(100_000)
    expect(segs[1]?.settings.royalty_pct).toBe(2)
    expect(segs[1]?.snap.totalSales).toBe(50_000)

    const lines = buildPoBillingDraftLinesFromSegments(
      segs,
      { royalty: 'Royalty', deliveryGp: 'Delivery GP', grabGp: 'Grab GP' },
      'royalty'
    )
    expect(lines).toHaveLength(2)
    expect(lines[0]?.price).toBe(1_000)
    expect(lines[1]?.price).toBe(1_000)
    expect(lines[0]?.name).toContain('2026-11-10')
    expect(lines[1]?.name).toContain('2026-11-20')
  })

  it('동일 비율이면 한 구간', () => {
    const oneVersion: PoBillingRateVersionRow[] = [
      {
        store_name: 'CM Asoke',
        effective_from: '2000-01-01',
        royalty_pct: 1,
        delivery_gp_pct: 0,
        grab_gp_pct: 0,
      },
    ]
    const rows = [
      {
        created_at: '2026-11-10T05:00:00.000Z',
        status: 'completed',
        order_type: 'dine_in',
        total: 10_000,
        store_code: 'CM Asoke',
      },
      {
        created_at: '2026-11-20T05:00:00.000Z',
        status: 'completed',
        order_type: 'dine_in',
        total: 20_000,
        store_code: 'CM Asoke',
      },
    ]
    const segs = buildPoBillingRateSegments(rows, oneVersion, BIZ_CTX, 'CM Asoke', null)
    expect(segs).toHaveLength(1)
    expect(segs[0]?.snap.totalSales).toBe(30_000)
    expect(segs[0]?.startYmd).toBe('2026-11-10')
    expect(segs[0]?.endYmd).toBe('2026-11-20')
  })

  it('버전 없으면 fallback settings', () => {
    const rows = [
      {
        created_at: '2026-11-10T05:00:00.000Z',
        status: 'completed',
        order_type: 'dine_in',
        total: 10_000,
        store_code: 'CM Asoke',
      },
    ]
    const segs = buildPoBillingRateSegments(rows, [], BIZ_CTX, 'CM Asoke', {
      store_name: 'CM Asoke',
      royalty_pct: 5,
      delivery_gp_pct: 0,
      grab_gp_pct: 0,
    })
    expect(segs).toHaveLength(1)
    expect(segs[0]?.settings.royalty_pct).toBe(5)
  })

  it('버전·fallback 없으면 0%', () => {
    const rows = [
      {
        created_at: '2026-11-10T05:00:00.000Z',
        status: 'completed',
        order_type: 'dine_in',
        total: 10_000,
        store_code: 'CM Asoke',
      },
    ]
    const segs = buildPoBillingRateSegments(rows, [], BIZ_CTX, 'CM Asoke', null)
    expect(segs[0]?.settings.royalty_pct).toBe(0)
  })
})
