import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/attendance-utils', () => ({
  todayStrBangkok: () => '2026-08-08',
}))

import {
  buildStoreListFromEmployees,
  isEffectivelyResignedForStaffRollup,
} from '@/lib/erp-store-master-shared'

describe('login employee list excludes resigned / deleted', () => {
  it('isEffectivelyResignedForStaffRollup matches resign on/before Bangkok today', () => {
    expect(isEffectivelyResignedForStaffRollup(null, null)).toBe(false)
    expect(isEffectivelyResignedForStaffRollup(null, '2026-08-09')).toBe(false)
    expect(isEffectivelyResignedForStaffRollup(null, '2026-08-08')).toBe(true)
    expect(isEffectivelyResignedForStaffRollup(null, '2026-08-07')).toBe(true)
    expect(isEffectivelyResignedForStaffRollup('resigned', null)).toBe(true)
    expect(isEffectivelyResignedForStaffRollup('resigned', '2026-08-09')).toBe(false)
  })

  it('buildStoreListFromEmployees hides resigned and soft-deleted names by default', () => {
    const built = buildStoreListFromEmployees(
      [
        { store: 'CM The street', name: 'Active Staff', resign_date: null },
        { store: 'CM The street', name: 'Resigned Today', resign_date: '2026-08-08' },
        { store: 'CM The street', name: 'Deleted Soft', resign_date: null, deleted_at: '2026-08-08T10:00:00Z' },
        { store: 'CM The street', name: 'Future Resign', resign_date: '2026-08-20' },
      ],
      []
    )
    expect(built.users['CM The street']).toEqual(['Active Staff', 'Future Resign'])
  })

  it('includeResignedInUserMap still excludes soft-deleted', () => {
    const built = buildStoreListFromEmployees(
      [
        { store: 'S1', name: 'Keep', resign_date: '2026-08-01' },
        { store: 'S1', name: 'Gone', resign_date: '2026-08-01', deleted_at: '2026-08-01T00:00:00Z' },
      ],
      [],
      { includeResignedInUserMap: true }
    )
    expect(built.users['S1']).toEqual(['Keep'])
  })
})
