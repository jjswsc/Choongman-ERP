import { describe, expect, it } from 'vitest'
import { aggregateNoticeReadStats, type EmpRow, type NoticeForAggregation } from './notice-read-aggregation'

const notice = (id: number, overrides?: Partial<NoticeForAggregation>): NoticeForAggregation => ({
  id,
  title: `n${id}`,
  content: 'x',
  sender: 'HQ',
  created_at: '2026-08-01T03:00:00+07:00',
  target_store: '전체',
  target_role: '전체',
  ...overrides,
})

describe('aggregateNoticeReadStats resign filter', () => {
  it('keeps employees with future resign date in roster', () => {
    const employees: EmpRow[] = [
      { store: 'S1', name: 'Future', job: 'Staff', role: 'Staff', resignDate: '2026-12-31' },
      { store: 'S1', name: 'Past', job: 'Staff', role: 'Staff', resignDate: '2026-07-01' },
      { store: 'S1', name: 'Active', job: 'Staff', role: 'Staff', resignDate: '' },
    ]
    const map = aggregateNoticeReadStats([notice(1)], employees, [], {
      searchType: 'all',
      asOfYmd: '2026-08-10',
    })
    expect(map.has('S1|Future')).toBe(true)
    expect(map.has('S1|Active')).toBe(true)
    expect(map.has('S1|Past')).toBe(false)
  })
})
