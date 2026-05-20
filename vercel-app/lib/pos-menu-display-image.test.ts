import { describe, expect, it } from 'vitest'
import { resolvePromoTileImageSrc } from '@/lib/pos-menu-display-image'
import type { PosMenu, PosPromoWithItems } from '@/lib/api-client'

describe('resolvePromoTileImageSrc', () => {
  it('uses mirror menu image when promo_id is linked', () => {
    const promo = { id: '10', items: [] } as PosPromoWithItems
    const menus = [
      { id: '1', promoId: '10', imageUrl: 'https://x.supabase.co/storage/v1/object/public/pos-menu-images/a.jpg' },
    ] as PosMenu[]
    expect(resolvePromoTileImageSrc(promo, menus)).toContain('a.jpg')
  })

  it('falls back to first component menu image', () => {
    const promo = {
      id: '20',
      items: [{ menuId: '2', optionId: null, quantity: 1 }],
    } as PosPromoWithItems
    const menus = [
      { id: '2', imageUrl: 'https://x.supabase.co/storage/v1/object/public/pos-menu-images/b.jpg' },
    ] as PosMenu[]
    expect(resolvePromoTileImageSrc(promo, menus)).toContain('b.jpg')
  })

  it('prefers non-side component image over rice/side', () => {
    const promo = {
      id: '30',
      items: [
        { menuId: '11', optionId: null, quantity: 1 },
        { menuId: '12', optionId: null, quantity: 1 },
      ],
    } as PosPromoWithItems
    const menus = [
      { id: '11', categoryMain: 'Side', category: 'Rice', imageUrl: 'https://x.supabase.co/storage/v1/object/public/pos-menu-images/rice.jpg' },
      { id: '12', categoryMain: 'Chicken', category: 'Fried', imageUrl: 'https://x.supabase.co/storage/v1/object/public/pos-menu-images/chicken.jpg' },
    ] as PosMenu[]
    expect(resolvePromoTileImageSrc(promo, menus)).toContain('chicken.jpg')
  })
})
