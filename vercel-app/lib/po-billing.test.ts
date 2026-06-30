import { describe, expect, it } from 'vitest'
import { POS_BUSINESS_DAY_DEFAULT_HOURS } from '@/lib/pos-business-day'
import type { PosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'
import { filterRowsByPosSalesBusinessDateRange } from '@/lib/pos-sales-business-day-range'
import { aggregatePoBillingSales, buildPoBillingDraftLines } from '@/lib/po-billing'

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
