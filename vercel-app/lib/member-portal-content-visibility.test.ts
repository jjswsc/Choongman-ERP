import { describe, expect, it } from 'vitest'
import {
  isMemberPortalContentVisibleNow,
  pickMemberPortalHomePopup,
  type MemberPortalContentItem,
} from '@/lib/member-portal-content'
import {
  isBangkokDateTimeAfter,
  isBangkokDateTimeBefore,
  normalizeBangkokDateTimeCompareKey,
} from '@/lib/bangkok-time'

function item(partial: Partial<MemberPortalContentItem>): MemberPortalContentItem {
  return {
    id: 1,
    contentKey: 'k',
    contentType: 'popup',
    storeCode: '',
    title: 'Test',
    body: '',
    imageUrl: '',
    targetTab: 'home',
    isActive: true,
    sortOrder: 0,
    startsAt: '',
    endsAt: '',
    updatedAt: '',
    updatedBy: '',
    ...partial,
  }
}

describe('normalizeBangkokDateTimeCompareKey', () => {
  it('normalizes ISO and space formats to the same key', () => {
    expect(normalizeBangkokDateTimeCompareKey('2026-06-17T13:32:00+07:00')).toBe('2026-06-17 13:32:00')
    expect(normalizeBangkokDateTimeCompareKey('2026-06-17 13:32:00')).toBe('2026-06-17 13:32:00')
  })
})

describe('isBangkokDateTimeBefore/After', () => {
  it('compares same-day times across format variants', () => {
    const morningIso = '2026-06-17T08:00:00+07:00'
    const afternoon = '2026-06-17 20:32:00'
    expect(isBangkokDateTimeBefore(morningIso, afternoon)).toBe(true)
    expect(isBangkokDateTimeAfter(afternoon, morningIso)).toBe(true)
  })
})

describe('isMemberPortalContentVisibleNow', () => {
  it('treats ISO publish window as visible when now is inside range', () => {
    const popup = item({
      startsAt: '2026-06-08T13:32:00+07:00',
      endsAt: '2026-06-30T13:32:00+07:00',
    })
    expect(isMemberPortalContentVisibleNow(popup, '2026-06-17 20:32:00')).toBe(true)
  })

  it('hides popup before start time on the same day', () => {
    const popup = item({
      startsAt: '2026-06-17T18:00:00+07:00',
      endsAt: '2026-06-30T13:32:00+07:00',
    })
    expect(isMemberPortalContentVisibleNow(popup, '2026-06-17 13:00:00')).toBe(false)
    expect(isMemberPortalContentVisibleNow(popup, '2026-06-17 19:00:00')).toBe(true)
  })
})

describe('pickMemberPortalHomePopup', () => {
  it('picks lowest sort_order home popup', () => {
    const picked = pickMemberPortalHomePopup([
      item({ contentKey: 'b', sortOrder: 2, title: 'B' }),
      item({ contentKey: 'a', sortOrder: 0, title: 'A' }),
      item({ contentKey: 'loc', targetTab: 'location' }),
    ])
    expect(picked?.contentKey).toBe('a')
  })
})
