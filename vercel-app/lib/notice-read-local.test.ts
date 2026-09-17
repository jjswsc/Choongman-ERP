import { describe, expect, it } from 'vitest'
import { applyLocalNoticeReads, parseLocalConfirmedNoticeIds } from './notice-read-local'

describe('parseLocalConfirmedNoticeIds', () => {
  it('keeps valid ids and drops junk', () => {
    expect(parseLocalConfirmedNoticeIds('[1, "2", 0, "x"]')).toEqual([1, 2])
  })
})

describe('applyLocalNoticeReads', () => {
  it('marks locally confirmed notices as read so Unread does not ask again', () => {
    const items = [
      { id: 10, status: 'New' },
      { id: 11, status: 'New' },
    ]
    const next = applyLocalNoticeReads(items, [10])
    expect(next[0].status).toBe('확인')
    expect(next[1].status).toBe('New')
  })
})
