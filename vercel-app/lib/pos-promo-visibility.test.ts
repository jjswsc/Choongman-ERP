import { describe, expect, it } from 'vitest'
import {
  shouldIncludeMirroredPromoForStore,
  shouldShowStandalonePromoTile,
} from '@/lib/pos-promo-visibility'

describe('shouldShowStandalonePromoTile', () => {
  it('hides yellow card when the promo has a mirror menu', () => {
    expect(
      shouldShowStandalonePromoTile({
        hasMirrorMenu: true,
        promoId: '10',
        linkedPromoIds: new Set(),
      })
    ).toBe(false)
  })

  it('hides yellow card when the mirror is already in this store menu list', () => {
    expect(
      shouldShowStandalonePromoTile({
        hasMirrorMenu: false,
        promoId: '10',
        linkedPromoIds: new Set(['10']),
      })
    ).toBe(false)
  })

  it('shows yellow card only for promos without a mirror', () => {
    expect(
      shouldShowStandalonePromoTile({
        hasMirrorMenu: false,
        promoId: '10',
        linkedPromoIds: new Set(),
      })
    ).toBe(true)
  })
})

describe('shouldIncludeMirroredPromoForStore', () => {
  it('keeps unmirrored legacy promos at every store', () => {
    expect(
      shouldIncludeMirroredPromoForStore({
        requestedStoreCode: 'CM Rama9',
        hasMirrorMenu: false,
        mirrorStoreCodes: ['CM The street'],
        compatibilityMode: true,
        scopeSchemaReady: true,
      })
    ).toBe(true)
  })

  it('hides a The Street-only mirror promo at another store', () => {
    expect(
      shouldIncludeMirroredPromoForStore({
        requestedStoreCode: 'CM Rama9',
        hasMirrorMenu: true,
        mirrorStoreCodes: ['CM The street'],
        compatibilityMode: true,
        scopeSchemaReady: true,
      })
    ).toBe(false)
  })

  it('shows a The Street-only mirror promo at The Street aliases', () => {
    expect(
      shouldIncludeMirroredPromoForStore({
        requestedStoreCode: 'CM The Street',
        hasMirrorMenu: true,
        mirrorStoreCodes: ['CM The street'],
        compatibilityMode: true,
        scopeSchemaReady: true,
      })
    ).toBe(true)
  })
})
