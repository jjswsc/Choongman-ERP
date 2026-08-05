import { describe, expect, it } from 'vitest'
import {
  STORE_OPS_BADGE_LOOKBACK_DAYS,
  STORE_OPS_REPAIR_STALE_DAYS,
  appendStoreOpsScopeFilter,
  storeOpsOpenComplaintBadgePostgrestFilter,
  storeOpsStaleRepairBadgePostgrestFilter,
} from '@/lib/store-ops-alert-utils'

describe('storeOpsStaleRepairBadgePostgrestFilter', () => {
  it('접수만·lookback 하한·stale 상한을 포함한다', () => {
    const q = storeOpsStaleRepairBadgePostgrestFilter({ todayYmd: '2026-08-04' })
    expect(STORE_OPS_BADGE_LOOKBACK_DAYS).toBe(30)
    expect(STORE_OPS_REPAIR_STALE_DAYS).toBe(3)
    expect(q).toContain('status=eq.' + encodeURIComponent('접수'))
    expect(q).toContain('reported_at=gte.')
    expect(q).toContain('reported_at=lt.')
    expect(q).not.toContain('진행중')
  })
})

describe('storeOpsOpenComplaintBadgePostgrestFilter', () => {
  it('접수만·최근 lookback log_date (조사중 제외)', () => {
    const q = storeOpsOpenComplaintBadgePostgrestFilter({ todayYmd: '2026-08-04' })
    expect(q).toContain('status=eq.' + encodeURIComponent('접수'))
    expect(q).toContain('log_date=gte.')
    expect(q).not.toContain('조사중')
    expect(q).toContain('2026-07-06') // 30일 lookback 시작(오늘 포함)
  })
})

describe('appendStoreOpsScopeFilter', () => {
  it('scope가 있으면 &로 붙인다', () => {
    expect(appendStoreOpsScopeFilter('a=1', 'b=2')).toBe('a=1&b=2')
    expect(appendStoreOpsScopeFilter('a=1', '')).toBe('a=1')
  })
})
