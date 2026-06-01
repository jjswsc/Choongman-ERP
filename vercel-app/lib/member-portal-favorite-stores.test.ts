import { describe, expect, it } from 'vitest'
import {
  memberPortalGoogleMapsSearchQuery,
  defaultMemberPortalMapQuery,
} from '@/lib/member-portal-stores'
import {
  readFavoriteStoreCodesFromMemberNotes,
  sortStoresWithFavoritesFirst,
  toggleFavoriteStoreCode,
} from '@/lib/member-portal-favorite-stores'

describe('memberPortalGoogleMapsSearchQuery', () => {
  it('prefers store name + address for a single pin', () => {
    expect(
      memberPortalGoogleMapsSearchQuery({
        displayName: 'Silom',
        address: '123 Rama IV, Bangkok',
        mapQuery: 'Choongman Chicken',
      })
    ).toBe('Silom, 123 Rama IV, Bangkok')
  })

  it('falls back to brand + store name when address is missing', () => {
    expect(
      memberPortalGoogleMapsSearchQuery({
        displayName: 'Silom',
        address: '',
        mapQuery: 'Choongman Chicken',
      })
    ).toBe(defaultMemberPortalMapQuery('Silom'))
  })
})

describe('favorite store helpers', () => {
  it('toggles add/remove and keeps newest favorite first', () => {
    expect(toggleFavoriteStoreCode([], 'A')).toEqual(['A'])
    expect(toggleFavoriteStoreCode(['A'], 'B')).toEqual(['B', 'A'])
    expect(toggleFavoriteStoreCode(['B', 'A'], 'A')).toEqual(['B'])
  })

  it('reads newest consolidated note first', () => {
    const rows = [
      { note: JSON.stringify({ type: 'favorite_stores', storeCodes: ['B', 'A'] }) },
      { note: JSON.stringify({ type: 'favorite_store', storeCode: 'OLD' }) },
    ]
    expect(readFavoriteStoreCodesFromMemberNotes(rows)).toEqual(['B', 'A'])
  })

  it('sorts favorites to the top', () => {
    const stores = [
      { storeCode: 'C', displayName: 'C' },
      { storeCode: 'A', displayName: 'A' },
      { storeCode: 'B', displayName: 'B' },
    ]
    expect(sortStoresWithFavoritesFirst(stores, ['B', 'A']).map((s) => s.storeCode)).toEqual(['B', 'A', 'C'])
  })
})
