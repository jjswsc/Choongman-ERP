import { describe, expect, it } from 'vitest'
import {
  normalizePosMenuImageUrl,
  toPosMenuDisplayImageHref,
} from '@/lib/pos-menu-image-url'

describe('toPosMenuDisplayImageHref', () => {
  const origin = 'https://erp.example.com'

  it('routes Supabase storage through posMenuImageProxy', () => {
    const url =
      'https://abc.supabase.co/storage/v1/object/public/pos-menu-images/123.jpg'
    const out = toPosMenuDisplayImageHref(url, { preferProxy: true, pageOrigin: origin })
    expect(out).toContain('/api/posMenuImageProxy?u=')
  })

  it('routes Google Drive through general imageProxy', () => {
    const url = 'https://drive.google.com/file/d/abc123/view'
    const out = toPosMenuDisplayImageHref(url, { preferProxy: true, pageOrigin: origin })
    expect(out).toContain('/api/imageProxy?url=')
    expect(out).not.toContain('posMenuImageProxy')
  })

  it('adds https to scheme-less supabase host', () => {
    const raw = 'abc.supabase.co/storage/v1/object/public/pos-menu-images/x.jpg'
    const normalized = normalizePosMenuImageUrl(raw)
    expect(normalized).toMatch(/^https:\/\//)
  })
})
