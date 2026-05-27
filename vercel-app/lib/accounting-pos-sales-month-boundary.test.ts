import { describe, expect, it } from 'vitest'
import { normalizeHours } from '@/lib/pos-business-day'
import { isPosSalesBusinessYmdInInclusiveRange } from '@/lib/pos-sales-business-day-range'
import {
  aggregatePosSalesByPeriod,
  filterCompletedPosSalesRows,
} from '@/lib/pos-sales-period-aggregate'

/** 야간 영업(11:00~익일 02:00) — 4월 1일 새벽 건은 영업일 라벨이 3월 31일 */
const OVERNIGHT_HOURS = normalizeHours({
  start: { hour: 11, minute: 0 },
  end: { hour: 2, minute: 0 },
})

describe('sumCompletedPosSalesTotal month boundary (영업일)', () => {
  it('4월 조회 시 3월 영업일 라벨 금액은 합계에서 제외', () => {
    const rows = filterCompletedPosSalesRows(
      [
        {
          created_at: '2026-03-31T18:00:00.000Z',
          status: 'completed',
          total: 50_000,
          store_code: 'CM True Digital',
        },
        {
          created_at: '2026-04-01T15:00:00.000Z',
          status: 'completed',
          total: 80_000,
          store_code: 'CM True Digital',
        },
      ],
      null
    )
    const byDay = aggregatePosSalesByPeriod(rows, 'day', null, OVERNIGHT_HOURS, () => OVERNIGHT_HOURS)
    const aprilLines = byDay.filter((d) =>
      isPosSalesBusinessYmdInInclusiveRange(d.key, '2026-04-01', '2026-04-30')
    )
    expect(byDay.some((d) => d.key === '2026-03-31')).toBe(true)
    expect(aprilLines.some((d) => d.key === '2026-03-31')).toBe(false)
    expect(aprilLines.reduce((s, d) => s + d.total, 0)).toBe(80_000)
  })
})
