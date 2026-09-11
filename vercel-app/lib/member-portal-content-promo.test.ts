import { describe, expect, it } from 'vitest'
import {
  listMemberPortalHomePromosForMonth,
  listMemberPortalHomePromosForStore,
  memberPortalContentMatchesStore,
  memberPortalContentOverlapsBangkokMonth,
  pickDefaultMemberPortalPromoStoreCode,
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

  it('treats empty storeCode as all stores and matches selected store case-insensitively', () => {
    expect(memberPortalContentMatchesStore(promo({ storeCode: '' }), 'TDP')).toBe(true)
    expect(memberPortalContentMatchesStore(promo({ storeCode: 'tdp' }), 'TDP')).toBe(true)
    expect(memberPortalContentMatchesStore(promo({ storeCode: 'MBK' }), 'TDP')).toBe(false)
    expect(memberPortalContentMatchesStore(promo({ storeCode: 'MBK' }), '')).toBe(false)
  })

  it('lists brand-wide plus selected-store promos only', () => {
    const items = [
      promo({ contentKey: 'all', storeCode: '' }),
      promo({ contentKey: 'tdp', storeCode: 'TDP' }),
      promo({ contentKey: 'mbk', storeCode: 'MBK' }),
    ]
    expect(listMemberPortalHomePromosForStore(items, '2026-06', june, 'TDP').map((x) => x.contentKey)).toEqual([
      'all',
      'tdp',
    ])
    expect(listMemberPortalHomePromosForStore(items, '2026-06', june, '').map((x) => x.contentKey)).toEqual(['all'])
  })

  it('picks the first preferred store that still exists', () => {
    expect(
      pickDefaultMemberPortalPromoStoreCode({
        availableStoreCodes: ['MBK', 'TDP', 'Silom'],
        preferredStoreCodes: ['gone', 'tdp', 'MBK'],
      })
    ).toBe('TDP')
    expect(
      pickDefaultMemberPortalPromoStoreCode({
        availableStoreCodes: ['MBK', 'TDP'],
        preferredStoreCodes: ['', null],
      })
    ).toBe('MBK')
  })
})
