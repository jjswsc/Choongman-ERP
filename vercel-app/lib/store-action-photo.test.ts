import { describe, expect, it } from 'vitest'
import {
  STORE_ACTION_PHOTO_THUMB_QUALITY,
  STORE_ACTION_PHOTO_THUMB_WIDTH,
  storeActionPhotoThumbUrl,
} from '@/lib/store-action-photo'

describe('storeActionPhotoThumbUrl', () => {
  it('rewrites public object URLs to image transform', () => {
    const raw =
      'https://faxolqgaadcvyeyvrydc.supabase.co/storage/v1/object/public/store-action-photos/CM_Silom/1.jpg'
    const out = storeActionPhotoThumbUrl(raw)
    expect(out).toContain('/storage/v1/render/image/public/store-action-photos/')
    expect(out).toContain(`width=${STORE_ACTION_PHOTO_THUMB_WIDTH}`)
    expect(out).toContain(`quality=${STORE_ACTION_PHOTO_THUMB_QUALITY}`)
  })

  it('returns empty for blank', () => {
    expect(storeActionPhotoThumbUrl('')).toBe('')
  })

  it('passes through non-storage URLs', () => {
    expect(storeActionPhotoThumbUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg')
  })
})
