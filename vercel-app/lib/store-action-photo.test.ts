import { describe, expect, it } from 'vitest'
import { storeActionPhotoThumbUrl } from '@/lib/store-action-photo'

describe('storeActionPhotoThumbUrl', () => {
  it('keeps public object URLs (no image transform)', () => {
    const raw =
      'https://faxolqgaadcvyeyvrydc.supabase.co/storage/v1/object/public/store-action-photos/CM_Silom/1.jpg'
    expect(storeActionPhotoThumbUrl(raw)).toBe(raw)
    expect(storeActionPhotoThumbUrl(raw)).not.toContain('/storage/v1/render/image/')
  })

  it('returns empty for blank', () => {
    expect(storeActionPhotoThumbUrl('')).toBe('')
  })

  it('passes through non-storage URLs', () => {
    expect(storeActionPhotoThumbUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg')
  })
})
