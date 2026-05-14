import { describe, expect, it } from 'vitest'
import { iterBangkokYmdInclusive } from '@/lib/attendance-utils'

describe('iterBangkokYmdInclusive', () => {
  it('lists consecutive Bangkok calendar days inclusive', () => {
    expect(iterBangkokYmdInclusive('2026-05-12', '2026-05-12')).toEqual(['2026-05-12'])
    expect(iterBangkokYmdInclusive('2026-05-12', '2026-05-14')).toEqual(['2026-05-12', '2026-05-13', '2026-05-14'])
  })

  it('swaps when start > end', () => {
    expect(iterBangkokYmdInclusive('2026-05-14', '2026-05-12')).toEqual(['2026-05-12', '2026-05-13', '2026-05-14'])
  })
})
