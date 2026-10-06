import { describe, expect, it } from 'vitest'
import { mergePosCostViewSession, parsePosCostViewSession } from '@/lib/pos-cost-view-session'

describe('pos-cost-view-session', () => {
  it('keeps a store-normal query and drops a broken section', () => {
    const parsed = parsePosCostViewSession({
      activeTab: 'storeNormal',
      storeNormal: {
        startStr: '2026-09-01',
        endStr: '2026-09-30',
        storeFilter: 'All',
        result: { startStr: '2026-09-01', endStr: '2026-09-30', rows: [{ storeCode: 'CM The street' }] },
      },
      actual: { startStr: 'nope' },
      list: { saleFilter: 'active', issueFilter: 'all', searchTerm: 'ice', categoryFilter: 'all', mainCategoryFilter: 'all' },
    })
    expect(parsed.activeTab).toBe('storeNormal')
    expect(parsed.storeNormal?.result?.rows).toHaveLength(1)
    expect(parsed.actual).toBeUndefined()
    expect(parsed.list?.searchTerm).toBe('ice')
  })

  it('patches one tab without clearing the other', () => {
    const next = mergePosCostViewSession(
      {
        activeTab: 'storeNormal',
        storeNormal: { startStr: '2026-09-01', endStr: '2026-09-30', storeFilter: 'All', result: null },
      },
      { activeTab: 'actual' }
    )
    expect(next.activeTab).toBe('actual')
    expect(next.storeNormal?.startStr).toBe('2026-09-01')
  })
})
