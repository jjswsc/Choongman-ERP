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
})
