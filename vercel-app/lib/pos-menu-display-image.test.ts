import { describe, expect, it } from 'vitest'
import {
  isPromoMirrorImageCopiedFromComponent,
  resolvePromoTileImageSrc,
  shouldUsePromoTileImageUrl,
} from '@/lib/pos-menu-display-image'
import type { PosMenu, PosPromoWithItems } from '@/lib/api-client'

describe('resolvePromoTileImageSrc', () => {
  it('uses mirror menu image when promo_id is linked', () => {
    const promo = { id: '10', items: [] } as PosPromoWithItems
    const menus = [
      { id: '1', promoId: '10', imageUrl: 'https://x.supabase.co/storage/v1/object/public/pos-menu-images/set-only.jpg' },
    ] as PosMenu[]
    expect(resolvePromoTileImageSrc(promo, menus)).toContain('set-only.jpg')
  })

  it('does not fall back to component chicken menu image', () => {
    const chickenUrl = 'https://x.supabase.co/storage/v1/object/public/pos-menu-images/chicken.jpg'
    const promo = {
      id: '20',
      items: [{ menuId: '2', optionId: null, quantity: 1 }],
    } as PosPromoWithItems
    const menus = [
      { id: '99', promoId: '20', imageUrl: '' },
      { id: '2', categoryMain: 'Chicken', imageUrl: chickenUrl },
    ] as PosMenu[]
    expect(resolvePromoTileImageSrc(promo, menus)).toBe('')
  })

  it('rejects mirror when mirror image equals rice component copy', () => {
    const riceUrl = 'https://x.supabase.co/storage/v1/object/public/pos-menu-images/rice.jpg'
    const promo = {
      id: '40',
      items: [
        { menuId: '11', optionId: null, quantity: 1 },
        { menuId: '12', optionId: null, quantity: 1 },
      ],
    } as PosPromoWithItems
    const menus = [
      { id: '99', promoId: '40', imageUrl: riceUrl },
      { id: '11', categoryMain: 'Side', category: 'Rice', imageUrl: riceUrl },
      {
        id: '12',
        categoryMain: 'Chicken',
        category: 'Fried',
        imageUrl: 'https://x.supabase.co/storage/v1/object/public/pos-menu-images/chicken.jpg',
      },
    ] as PosMenu[]
    expect(resolvePromoTileImageSrc(promo, menus)).toBe('')
  })

  it('rejects mirror when mirror image equals chicken component copy', () => {
    const chickenUrl = 'https://x.supabase.co/storage/v1/object/public/pos-menu-images/chicken.jpg'
    const promo = {
      id: '41',
      items: [{ menuId: '12', optionId: null, quantity: 1 }],
    } as PosPromoWithItems
    const menus = [
      { id: '99', promoId: '41', imageUrl: chickenUrl },
      { id: '12', categoryMain: 'Chicken', imageUrl: chickenUrl },
    ] as PosMenu[]
    expect(resolvePromoTileImageSrc(promo, menus)).toBe('')
  })

  it('prefers delivery ops set image over stale mirror chicken copy', () => {
    const chickenUrl = 'https://x.supabase.co/storage/v1/object/public/pos-menu-images/chicken.jpg'
    const setUrl = 'https://x.supabase.co/storage/v1/object/public/pos-menu-images/april-set.jpg'
    const promo = {
      id: '42',
      items: [{ menuId: '12', optionId: null, quantity: 1 }],
    } as PosPromoWithItems
    const menus = [
      { id: '99', promoId: '42', imageUrl: chickenUrl },
      { id: '12', categoryMain: 'Chicken', imageUrl: chickenUrl },
    ] as PosMenu[]
    expect(
      resolvePromoTileImageSrc(promo, menus, {
        deliveryImageByMenuId: { '99': setUrl },
      })
    ).toBe(setUrl)
  })

  it('detects component copy on mirror url', () => {
    const riceUrl = 'https://x.supabase.co/storage/v1/object/public/pos-menu-images/rice.jpg'
    const promo = {
      id: '50',
      items: [{ menuId: '11', optionId: null, quantity: 1 }],
    } as PosPromoWithItems
    const menusById = new Map<string, PosMenu>([
      ['11', { id: '11', category: 'Rice', imageUrl: riceUrl } as PosMenu],
    ])
    expect(isPromoMirrorImageCopiedFromComponent(riceUrl, promo, menusById)).toBe(true)
    expect(shouldUsePromoTileImageUrl(riceUrl, promo, menusById)).toBe(false)
  })
})
