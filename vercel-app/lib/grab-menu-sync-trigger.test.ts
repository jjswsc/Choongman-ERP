import { describe, expect, it } from 'vitest'
import { normalizeGrabMenuSyncStoreCodes } from '@/lib/grab-menu-sync-trigger'

describe('normalizeGrabMenuSyncStoreCodes', () => {
  it('dedupes case-insensitively and sorts', () => {
    expect(normalizeGrabMenuSyncStoreCodes(['1043', '1040', '1040', '1042'])).toEqual([
      '1040',
      '1042',
      '1043',
    ])
  })

  it('returns empty for non-array', () => {
    expect(normalizeGrabMenuSyncStoreCodes(null)).toEqual([])
    expect(normalizeGrabMenuSyncStoreCodes('1040')).toEqual([])
  })
})
