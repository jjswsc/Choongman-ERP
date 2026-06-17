import { describe, expect, it } from 'vitest'
import {
  listMemberPortalHomePromosForMonth,
  memberPortalContentOverlapsBangkokMonth,
  type MemberPortalContentItem,
} from '@/lib/member-portal-content'

function promo(partial: Partial<MemberPortalContentItem>): MemberPortalContentItem {
  return {
    id: 1,
    contentKey: 'k1',
    contentType: 'info',
    storeCode: '',
    title: 'June deal',
    body: '',
    imageUrl: 'https://example.com/a.jpg',
    targetTab: 'home_promo',
    isActive: true,
    sortOrder: 0,
    startsAt: partial.startsAt ?? '2026-06-01 00:00:00',
    endsAt: partial.endsAt ?? '2026-06-30 23:59:59',
    updatedAt: '',
    updatedBy: '',
    ...partial,
  }
}

describe('memberPortalContentOverlapsBangkokMonth', () => {
  const june = { startStr: '2026-06-01', endStr: '2026-06-30' }

  it('includes promo when period overlaps month', () => {
    const item = promo({})
    expect(memberPortalContentOverlapsBangkokMonth(item, '2026-06', june)).toBe(true)
    expect(memberPortalContentOverlapsBangkokMonth(item, '2026-05', { startStr: '2026-05-01', endStr: '2026-05-31' })).toBe(
      false
    )
  })

  it('lists sorted promos for month', () => {
    const items = [
      promo({ contentKey: 'a', sortOrder: 2 }),
      promo({ contentKey: 'b', sortOrder: 1, title: 'First' }),
    ]
    const list = listMemberPortalHomePromosForMonth(items, '2026-06', june)
    expect(list.map((x) => x.contentKey)).toEqual(['b', 'a'])
  })

  it('filters promos by dine and delivery channel', () => {
    const items = [
      promo({ contentKey: 'dine', targetTab: 'home_promo_dine' }),
      promo({ contentKey: 'legacy', targetTab: 'home_promo' }),
      promo({ contentKey: 'del', targetTab: 'home_promo_delivery' }),
    ]
    expect(listMemberPortalHomePromosForMonth(items, '2026-06', june, 'dine').map((x) => x.contentKey)).toEqual([
      'dine',
      'legacy',
    ])
    expect(listMemberPortalHomePromosForMonth(items, '2026-06', june, 'delivery').map((x) => x.contentKey)).toEqual([
      'del',
    ])
  })
})
