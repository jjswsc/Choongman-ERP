import { describe, expect, it } from 'vitest'
import { resolveMenuImageColumnForUpsert } from '@/lib/pos-menu-image-upsert'

describe('resolveMenuImageColumnForUpsert', () => {
  it('insert always writes image column (may be empty)', () => {
    expect(resolveMenuImageColumnForUpsert({ imageUrl: '' }, { isEdit: false })).toEqual({
      includeInRow: true,
      image: '',
    })
  })

  it('edit with empty imageUrl does not touch image column', () => {
    expect(resolveMenuImageColumnForUpsert({ imageUrl: '' }, { isEdit: true })).toEqual({
      includeInRow: false,
      image: '',
    })
  })

  it('edit with non-empty imageUrl updates image', () => {
    expect(
      resolveMenuImageColumnForUpsert(
        { imageUrl: 'https://x.supabase.co/storage/v1/object/public/pos-menu-images/a.jpg' },
        { isEdit: true }
      )
    ).toEqual({
      includeInRow: true,
      image: 'https://x.supabase.co/storage/v1/object/public/pos-menu-images/a.jpg',
    })
  })

  it('imageOnly may clear image intentionally', () => {
    expect(
      resolveMenuImageColumnForUpsert({ imageUrl: '', imageOnly: true }, { isEdit: true })
    ).toEqual({ includeInRow: true, image: '' })
  })
})
