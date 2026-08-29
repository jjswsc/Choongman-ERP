import { describe, expect, it } from 'vitest'
import {
  canonicalPosMenuUpstreamUrl,
  normalizePosMenuImageUrl,
  toHybridProxiedMenuImageHref,
  toPosMenuDisplayImageHref,
  toSupabaseStorageRenderHref,
} from '@/lib/pos-menu-image-url'

describe('canonicalPosMenuUpstreamUrl', () => {
  it('forces https and lowercases supabase host', () => {
    const out = canonicalPosMenuUpstreamUrl(
      'http://ABC.supabase.co/storage/v1/object/public/menu/a.png'
    )
    expect(out).toMatch(/^https:\/\/abc\.supabase\.co\//)
  })
})

describe('toSupabaseStorageRenderHref', () => {
  it('rewrites public object URLs to image transform', () => {
    const out = toSupabaseStorageRenderHref(
      'https://abc.supabase.co/storage/v1/object/public/pos-menu-images/123.jpg'
    )
    expect(out).toContain('/storage/v1/render/image/public/pos-menu-images/123.jpg')
    expect(out).toContain('width=400')
    expect(out).toContain('quality=70')
  })

  it('returns null for non-public object paths', () => {
    expect(
      toSupabaseStorageRenderHref('https://abc.supabase.co/storage/v1/object/sign/pos-menu-images/123.jpg')
    ).toBeNull()
  })
})

describe('toHybridProxiedMenuImageHref', () => {
  it('uses canonical upstream in query', () => {
    const href = toHybridProxiedMenuImageHref(
      'http://x.supabase.co/storage/v1/object/public/b/p.jpg'
    )
    expect(href).toContain('u=https%3A%2F%2Fx.supabase.co%2F')
    expect(href).not.toContain('http%3A')
  })

  it('requests tile-sized render (Fast Data Transfer)', () => {
    const href = toHybridProxiedMenuImageHref(
      'https://x.supabase.co/storage/v1/object/public/b/p.jpg'
    )
    expect(href).toContain('w=400')
    expect(href).toContain('q=70')
    expect(href).toContain('v=3')
  })
})

describe('toPosMenuDisplayImageHref', () => {
  const origin = 'https://erp.example.com'

  it('loads Supabase public images from transform URL (not Vercel proxy)', () => {
    const url =
      'https://abc.supabase.co/storage/v1/object/public/pos-menu-images/123.jpg'
    const out = toPosMenuDisplayImageHref(url, { preferProxy: false, pageOrigin: origin })
    expect(out).toContain('/storage/v1/render/image/public/')
    expect(out).not.toContain('/api/posMenuImageProxy')
  })

  it('routes Supabase storage through posMenuImageProxy when preferProxy', () => {
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
