import { describe, expect, it } from 'vitest'
import {
  buildPosMenuImageStorageObjectName,
  extractPosMenuIdFromStorageObjectName,
  resolvePosMenuImageUrlPayloadForSave,
  validatePosMenuImageUrlForMenu,
} from '@/lib/pos-menu-image-storage-path'

describe('pos-menu-image-storage-path', () => {
  it('builds object name with menu id', () => {
    expect(buildPosMenuImageStorageObjectName(27, 'photo.jpg', 1000)).toBe('1000-27_photo.jpg')
  })

  it('extracts menu id from object name and public url', () => {
    expect(extractPosMenuIdFromStorageObjectName('1774343948409-27._G')).toBe(27)
    expect(
      extractPosMenuIdFromStorageObjectName(
        'https://x.supabase.co/storage/v1/object/public/pos-menu-images/1777969760600-76_B'
      )
    ).toBe(76)
    expect(extractPosMenuIdFromStorageObjectName('1777951668379-Asah')).toBeNull()
  })

  it('validates url menu id matches', () => {
    const url =
      'https://x.supabase.co/storage/v1/object/public/pos-menu-images/1774343948409-27._G'
    expect(validatePosMenuImageUrlForMenu(url, 27)).toEqual({ ok: true })
    expect(validatePosMenuImageUrlForMenu(url, 28).ok).toBe(false)
    expect(validatePosMenuImageUrlForMenu('https://cdn.example/a.jpg', 27)).toEqual({ ok: true })
  })

  it('omits mismatched image on edit save but keeps valid image', () => {
    const url =
      'https://x.supabase.co/storage/v1/object/public/pos-menu-images/1774343948409-27._G'
    expect(resolvePosMenuImageUrlPayloadForSave(url, 27, { isEdit: true })).toEqual({
      includeImageUrl: true,
      imageUrl: url,
    })
    const bad = resolvePosMenuImageUrlPayloadForSave(url, 3, { isEdit: true })
    expect(bad.includeImageUrl).toBe(false)
    expect(bad.mismatchMessage).toContain('id 3')
    expect(resolvePosMenuImageUrlPayloadForSave('', 3, { isEdit: true })).toEqual({
      includeImageUrl: false,
    })
  })
})
