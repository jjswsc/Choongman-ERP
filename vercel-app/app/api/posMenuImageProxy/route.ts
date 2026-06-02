import { NextRequest, NextResponse } from 'next/server'
import { canonicalPosMenuUpstreamUrl } from '@/lib/pos-menu-image-url'
import { supabaseFetch } from '@/lib/supabase-server'

/** 브라우저·POS 단말 — CDN HIT 후에도 주기적 재검증은 SWR로 완화 */
const BROWSER_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800'
const CDN_CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800'

/**
 * POS 메뉴 타일 표시 크기(높이 88~92px, 가로 ~180px)에 맞춘 다운스케일 기본값.
 * 레티나(2x)까지 고려해 가로 400px이면 화면상 차이 없이 전송량만 크게 줄인다.
 * (Vercel Fast Data Transfer 절감) — `w`/`q` 쿼리로 상한 내 조정 가능.
 */
const DEFAULT_RENDER_WIDTH = 400
const MAX_RENDER_WIDTH = 1000
const DEFAULT_RENDER_QUALITY = 70

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function isAllowedUpstream(parsed: URL): boolean {
  const h = parsed.hostname.toLowerCase()
  if (!h.endsWith('.supabase.co') && h !== 'supabase.co') return false
  return parsed.pathname.includes('/storage/v1/object/')
}

/**
 * Supabase Storage 공개 객체 URL → 이미지 변환(render) URL.
 * `/storage/v1/object/public/{bucket}/{path}` → `/storage/v1/render/image/public/{bucket}/{path}?width&quality`
 * 변환 기능(Pro 이미지 transformation)이 꺼져 있거나 실패하면 호출부에서 원본으로 폴백한다.
 */
function toRenderImageUrl(parsed: URL, width: number, quality: number): string | null {
  if (!/\/storage\/v1\/object\/public\//i.test(parsed.pathname)) return null
  const rendered = new URL(parsed.href)
  rendered.pathname = parsed.pathname.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/'
  )
  rendered.searchParams.set('width', String(width))
  rendered.searchParams.set('quality', String(quality))
  rendered.searchParams.set('resize', 'contain')
  return rendered.href
}

/** `/storage/v1/object/public/{bucket}/{path}` → bucket + object path */
function parsePublicStorageObject(parsed: URL): { bucket: string; path: string } | null {
  const m = parsed.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/i)
  if (!m) return null
  const bucket = decodeURIComponent(m[1] || '').trim()
  const path = decodeURIComponent(m[2] || '').trim()
  if (!bucket || !path) return null
  return { bucket, path }
}

async function fetchStorageWithServiceRole(bucket: string, objectPath: string): Promise<Response | null> {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/$/, '')
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!base || !key) return null

  const encodedPath = objectPath
    .split('/')
    .filter(Boolean)
    .map((p) => encodeURIComponent(p))
    .join('/')
  const apiPath = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`

  return supabaseFetch(apiPath, {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'image/*,*/*;q=0.8',
    },
    cache: 'no-store',
  })
}

async function readImageResponse(upstream: Response): Promise<NextResponse | null> {
  if (!upstream.ok || !upstream.body) return null
  const rawCt = upstream.headers.get('content-type')?.split(';')[0]?.trim() || ''
  const outCt = /^image\//i.test(rawCt) ? rawCt : 'image/jpeg'
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': outCt,
      'Cache-Control': BROWSER_CACHE_CONTROL,
      'CDN-Cache-Control': CDN_CACHE_CONTROL,
      'Vercel-CDN-Cache-Control': CDN_CACHE_CONTROL,
    },
  })
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('u')?.trim()
  if (!raw) {
    return new NextResponse(null, { status: 400 })
  }
  let parsed: URL
  try {
    parsed = new URL(canonicalPosMenuUpstreamUrl(raw))
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return new NextResponse(null, { status: 400 })
  }
  if (!isAllowedUpstream(parsed)) {
    return new NextResponse(null, { status: 403 })
  }

  const width = clampInt(request.nextUrl.searchParams.get('w'), DEFAULT_RENDER_WIDTH, 64, MAX_RENDER_WIDTH)
  const quality = clampInt(request.nextUrl.searchParams.get('q'), DEFAULT_RENDER_QUALITY, 40, 100)

  const fetchImage = (href: string) =>
    fetch(href, {
      redirect: 'follow',
      next: { revalidate: 60 * 60 },
      headers: { Accept: 'image/*,*/*;q=0.8' },
    })

  // 1) 변환(render) 엔드포인트로 다운스케일 시도 → 전송량 절감
  const renderHref = toRenderImageUrl(parsed, width, quality)
  if (renderHref) {
    try {
      const rendered = await fetchImage(renderHref)
      const renderedBody = await readImageResponse(rendered)
      if (renderedBody) return renderedBody
    } catch {
      /* 변환 비활성/오류 → 원본 폴백 */
    }
  }

  // 2) 원본 객체 폴백 (변환 기능이 꺼져 있거나 실패한 경우)
  const upstream = await fetchImage(parsed.href)

  let body = await readImageResponse(upstream)
  if (body) return body

  const storageObj = parsePublicStorageObject(parsed)
  if (storageObj) {
    const authed = await fetchStorageWithServiceRole(storageObj.bucket, storageObj.path)
    if (authed) {
      body = await readImageResponse(authed)
      if (body) return body
    }
  }

  return new NextResponse(null, {
    status: upstream.status === 200 ? 502 : upstream.status,
  })
}
