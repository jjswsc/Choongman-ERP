import { describe, expect, it } from 'vitest'
import {
  filterContentForAdminTab,
  isHomePromoContent,
  resolveMemberPortalContentDisplayStatus,
  searchContentAdminItems,
  sortContentAdminItems,
  summarizeContentAdminItems,
  type MemberPortalContentAdminItem,
} from '@/lib/member-portal-content-admin'

function item(partial: Partial<MemberPortalContentAdminItem>): MemberPortalContentAdminItem {
  return {
    id: 1,
    contentKey: 'k',
    contentType: 'info',
    storeCode: '',
    title: '',
    body: '',
    imageUrl: '',
    targetTab: '',
    isActive: true,
    sortOrder: 0,
    startsAt: '',
    endsAt: '',
    updatedAt: '',
    updatedBy: '',
    ...partial,
  }
}

describe('filterContentForAdminTab', () => {
  it('splits promo from general info', () => {
    const items = [
      item({ contentKey: 'p', targetTab: 'home_promo' }),
      item({ contentKey: 'i', targetTab: 'home' }),
      item({ contentKey: 'pop', contentType: 'popup', targetTab: 'home' }),
    ]
    expect(filterContentForAdminTab(items, 'promo').map((x) => x.contentKey)).toEqual(['p'])
    expect(filterContentForAdminTab(items, 'info').map((x) => x.contentKey)).toEqual(['i'])
    expect(filterContentForAdminTab(items, 'popup').map((x) => x.contentKey)).toEqual(['pop'])
    expect(filterContentForAdminTab(items, 'all').map((x) => x.contentKey)).toEqual(['p', 'i', 'pop'])
  })

  it('detects home promo', () => {
    expect(isHomePromoContent(item({ targetTab: 'home_promo' }))).toBe(true)
    expect(isHomePromoContent(item({ targetTab: 'home' }))).toBe(false)
  })
})

describe('content admin helpers', () => {
  it('resolves display status', () => {
    expect(resolveMemberPortalContentDisplayStatus(item({ isActive: false }), '2026-06-03 12:00:00')).toBe('paused')
    expect(
      resolveMemberPortalContentDisplayStatus(
        item({ isActive: true, startsAt: '2026-06-10 00:00:00' }),
        '2026-06-03 12:00:00'
      )
    ).toBe('scheduled')
    expect(
      resolveMemberPortalContentDisplayStatus(
        item({ isActive: true, endsAt: '2026-06-01 00:00:00' }),
        '2026-06-03 12:00:00'
      )
    ).toBe('expired')
    expect(resolveMemberPortalContentDisplayStatus(item({ isActive: true }), '2026-06-03 12:00:00')).toBe('live')
  })

  it('searches title and body', () => {
    const rows = [
      item({ contentKey: 'a', title: 'Snow Chicken' }),
      item({ contentKey: 'b', body: 'VIP coupon' }),
    ]
    expect(searchContentAdminItems(rows, 'snow').map((x) => x.contentKey)).toEqual(['a'])
    expect(searchContentAdminItems(rows, 'coupon').map((x) => x.contentKey)).toEqual(['b'])
  })

  it('sorts and summarizes', () => {
    const rows = [
      item({ contentKey: 'a', sortOrder: 2, title: 'B' }),
      item({ contentKey: 'b', sortOrder: 1, title: 'A' }),
    ]
    expect(sortContentAdminItems(rows, 'sort_order').map((x) => x.contentKey)).toEqual(['b', 'a'])
    expect(summarizeContentAdminItems(rows).total).toBe(2)
  })
})
