import { describe, expect, it } from 'vitest'
import {
  buildMyNoticesDbFilter,
  resolveMyNoticesCreatedAtBounds,
  MY_NOTICES_DEFAULT_LOOKBACK_DAYS,
  MY_NOTICES_UNREAD_EXTRA_LOOKBACK_DAYS,
} from './my-notices-query'
import { addBangkokCalendarDays } from './bangkok-time'
import { bangkokInclusivePeriod, bangkokYmdRangeToIsoBounds } from './bangkok-date'

describe('resolveMyNoticesCreatedAtBounds', () => {
  it('uses the selected dateFrom/dateTo window (mobile All + lookback)', () => {
    expect(
      resolveMyNoticesCreatedAtBounds({
        listMode: 'default',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-17',
        todayYmd: '2026-09-17',
      })
    ).toEqual({ startYmd: '2026-09-01', endYmd: '2026-09-17' })
  })

  it('falls back to 90 Bangkok days when no dates (unread badge)', () => {
    const today = '2026-09-17'
    const period = bangkokInclusivePeriod(today, MY_NOTICES_DEFAULT_LOOKBACK_DAYS)
    expect(
      resolveMyNoticesCreatedAtBounds({
        listMode: 'default',
        todayYmd: today,
      })
    ).toEqual(period)
  })

  it('looks back extra days for ERP unread_or_in_range so old unread still load', () => {
    const today = '2026-09-17'
    expect(
      resolveMyNoticesCreatedAtBounds({
        listMode: 'unread_or_in_range',
        rangeStart: today,
        rangeEnd: today,
        todayYmd: today,
      })
    ).toEqual({
      startYmd: addBangkokCalendarDays(today, -MY_NOTICES_UNREAD_EXTRA_LOOKBACK_DAYS),
      endYmd: today,
    })
  })
})

describe('buildMyNoticesDbFilter', () => {
  it('applies Bangkok created_at bounds before limit so past HQ notices are not dropped', () => {
    const { gteIso, lteIso } = bangkokYmdRangeToIsoBounds('2026-09-01', '2026-09-17')
    const filter = buildMyNoticesDbFilter({
      listMode: 'default',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-17',
      todayYmd: '2026-09-17',
    })
    expect(filter).toContain('created_at=gte.' + gteIso)
    expect(filter).toContain('created_at=lte.' + lteIso)
    expect(filter.startsWith('id=gte.0')).toBe(true)
  })
})
