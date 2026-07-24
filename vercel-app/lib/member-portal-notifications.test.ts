import { describe, expect, it } from 'vitest'
import {
  hasUnreadMemberPortalNotifications,
  mergeMemberPortalNotificationItems,
  parseMemberPortalNotifTime,
} from '@/lib/member-portal-notifications'

describe('member-portal-notifications', () => {
  it('merges points and stamps by time desc', () => {
    const items = mergeMemberPortalNotificationItems({
      points: [
        { id: 1, kind: 'earn', points: 7.77, createdAt: '2026-07-23 12:00:00' },
        { id: 2, kind: 'expire', points: -1, createdAt: '2026-07-24 12:00:00' },
      ],
      stamps: [{ id: 9, kind: 'earn', balanceAfter: 3, createdAt: '2026-07-23 13:00:00' }],
      limit: 10,
    })
    expect(items.map((x) => x.id)).toEqual(['stamp:9', 'point:1'])
  })

  it('unread uses 7-day window when never seen', () => {
    const now = parseMemberPortalNotifTime('2026-07-24 12:00:00')
    const items = mergeMemberPortalNotificationItems({
      points: [{ id: 1, kind: 'earn', points: 1, createdAt: '2026-07-23 12:00:00' }],
      stamps: [],
    })
    expect(hasUnreadMemberPortalNotifications(items, null, now)).toBe(true)
    expect(
      hasUnreadMemberPortalNotifications(items, '2026-07-23 18:00:00', now)
    ).toBe(false)
  })

  it('parses naive Bangkok timestamps with +07 offset', () => {
    const a = parseMemberPortalNotifTime('2026-07-23 12:00:00')
    const b = parseMemberPortalNotifTime('2026-07-23T12:00:00+07:00')
    expect(a).toBe(b)
  })
})
