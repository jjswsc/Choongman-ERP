import { describe, expect, it } from 'vitest'
import { filterContentForAdminTab, isHomePromoContent, type MemberPortalContentAdminItem } from '@/lib/member-portal-content-admin'

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
  })

  it('detects home promo', () => {
    expect(isHomePromoContent(item({ targetTab: 'home_promo' }))).toBe(true)
    expect(isHomePromoContent(item({ targetTab: 'home' }))).toBe(false)
  })
})
