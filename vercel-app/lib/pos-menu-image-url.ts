/**
 * POS 메뉴 썸네일 URL 정규화 (웹·하이브리드 공통, 클라이언트에서 window 사용)
 *
 * DB·엑셀 등에 `https` 없이 `xxxx.supabase.co/storage/...` 만 있으면
 * 페이지 출처(예: Vercel)에 대한 **상대 URL**로 해석되어 404·빈 타일이 된다.
 */

function upgradeHttpToHttpsWhenPageIsHttps(u: string): string {
  if (
    typeof window !== 'undefined' &&
    window.location?.protocol === 'https:' &&
    u.startsWith('http://')
  ) {
    return `https://${u.slice('http://'.length)}`
  }
  if (u.startsWith('http://')) {
    const rest = u.slice('http://'.length)
    const host = (rest.split('/')[0] ?? '').toLowerCase()
    if (host.endsWith('.supabase.co') || host === 'supabase.co') {
      return `https://${rest}`
    }
  }
  return u
}

export function normalizePosMenuImageUrl(raw: string): string {
  const u = String(raw ?? '').trim()
  if (!u) return ''

  if (u.startsWith('data:') || u.startsWith('blob:')) return u
  if (u.startsWith('//')) return upgradeHttpToHttpsWhenPageIsHttps(`https:${u}`)

  const supabaseBase = (typeof process !== 'undefined'
    ? String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
    : ''
  ).trim()
  if (supabaseBase && /^\/storage\/v1\//i.test(u)) {
    return normalizePosMenuImageUrl(`${supabaseBase}${u}`)
  }
  if (supabaseBase && /^storage\/v1\//i.test(u)) {
    return normalizePosMenuImageUrl(`${supabaseBase}/${u}`)
  }

  if (u.startsWith('/') && typeof window !== 'undefined' && window.location?.origin) {
    return upgradeHttpToHttpsWhenPageIsHttps(`${window.location.origin}${u}`)
  }

  try {
    const parsed = new URL(u)
    if (typeof window !== 'undefined' && window.location?.origin) {
      const pageHost = window.location.hostname.toLowerCase()
      const onLocalPage = pageHost === 'localhost' || pageHost === '127.0.0.1'
      const uh = parsed.hostname.toLowerCase()
      const urlIsLoopback =
        uh === 'localhost' || uh === '127.0.0.1' || uh === '[::1]'
      /**
       * DB/에디터에 `http://127.0.0.1:3000/...` 가 남아 있으면 프로덕션 POS에서
       * 이미지 요청이 매장 PC의 루프백으로 가며 `net::ERR_CONNECTION_REFUSED` 가 난다.
       * 페이지 출처(origin) + 동일 path·query 로 바꿔 Vercel/배포 호스트로 요청하게 한다.
       */
      if (urlIsLoopback && !onLocalPage) {
        const rewritten = `${window.location.origin}${parsed.pathname}${parsed.search}`
        return normalizePosMenuImageUrl(rewritten)
      }
    }
    return upgradeHttpToHttpsWhenPageIsHttps(parsed.href)
  } catch {
    /* not a valid absolute URL */
  }

  /** `proj.supabase.co/storage/...` 처럼 스킴이 빠진 저장소 URL */
  if (/^[a-z0-9][a-z0-9.-]*\.supabase\.co\//i.test(u)) {
    return normalizePosMenuImageUrl(`https://${u}`)
  }

  return upgradeHttpToHttpsWhenPageIsHttps(u)
}

/** Windows 하이브리드(https 배포)에서만 동일 출처 프록시 대상 — Supabase Storage 객체 GET */
export function shouldProxyPosMenuImageForHybrid(absoluteUrl: string): boolean {
  if (!absoluteUrl || absoluteUrl.startsWith('data:') || absoluteUrl.startsWith('blob:')) return false
  try {
    const parsed = new URL(absoluteUrl)
    const h = parsed.hostname.toLowerCase()
    if (!h.endsWith('.supabase.co') && h !== 'supabase.co') return false
    return parsed.pathname.includes('/storage/v1/object/')
  } catch {
    return false
  }
}

/** 프록시·CDN 캐시 키 통일 — http→https, 호스트 소문자 (동일 이미지 이중 캐시 방지) */
export function canonicalPosMenuUpstreamUrl(raw: string): string {
  const parsed = new URL(String(raw ?? '').trim())
  const h = parsed.hostname.toLowerCase()
  if (h.endsWith('.supabase.co') || h === 'supabase.co') {
    parsed.protocol = 'https:'
    if (parsed.hostname !== h) parsed.hostname = h
  }
  return parsed.href
}

/** CDN에 잘못 캐시된 구 응답(750px 등) 우회 — 배포 시 증가 */
const POS_MENU_IMAGE_PROXY_RENDER_VERSION = 3

/** POS 타일 표시 크기(높이 88~92px, 가로 ~180px) + 레티나 2x */
export const POS_MENU_TILE_RENDER_WIDTH = 400
export const POS_MENU_TILE_RENDER_QUALITY = 70

/**
 * Supabase 공개 객체 → Image Transformation URL.
 * 브라우저가 이 URL을 직접 받으면 이미지 바이트가 Vercel Origin을 거치지 않는다
 * (Fluid Active CPU·Fast Origin Transfer 절감). 변환 미지원이면 null.
 */
export function toSupabaseStorageRenderHref(
  absoluteUrl: string,
  opts?: { width?: number; quality?: number }
): string | null {
  try {
    const parsed = new URL(canonicalPosMenuUpstreamUrl(absoluteUrl))
    if (!/\/storage\/v1\/object\/public\//i.test(parsed.pathname)) return null
    parsed.pathname = parsed.pathname.replace(
      '/storage/v1/object/public/',
      '/storage/v1/render/image/public/'
    )
    parsed.searchParams.set(
      'width',
      String(opts?.width ?? POS_MENU_TILE_RENDER_WIDTH)
    )
    parsed.searchParams.set(
      'quality',
      String(opts?.quality ?? POS_MENU_TILE_RENDER_QUALITY)
    )
    parsed.searchParams.set('resize', 'contain')
    return parsed.href
  } catch {
    return null
  }
}

export function toHybridProxiedMenuImageHref(absoluteUrl: string): string {
  const u = encodeURIComponent(canonicalPosMenuUpstreamUrl(absoluteUrl))
  return `/api/posMenuImageProxy?u=${u}&w=${POS_MENU_TILE_RENDER_WIDTH}&q=${POS_MENU_TILE_RENDER_QUALITY}&v=${POS_MENU_IMAGE_PROXY_RENDER_VERSION}`
}

function toGeneralImageProxyHref(absoluteUrl: string): string {
  return `/api/imageProxy?url=${encodeURIComponent(absoluteUrl)}`
}

/**
 * POS 타일·미리보기용 최종 img src.
 * - 기본(preferProxy false): Supabase 공개 이미지는 transform URL 직접 로드 (Vercel 우회)
 * - preferProxy true: 비공개 버킷·Electron 폴백용 동일 출처 프록시
 * - Google Drive 등: preferProxy true 일 때만 imageProxy
 */
export function toPosMenuDisplayImageHref(
  normalizedUrl: string,
  opts?: { preferProxy?: boolean; pageOrigin?: string }
): string {
  const u = String(normalizedUrl || '').trim()
  if (!u) return ''
  if (u.startsWith('data:') || u.startsWith('blob:')) return u

  const preferProxy = opts?.preferProxy === true
  const pageOrigin =
    opts?.pageOrigin ??
    (typeof window !== 'undefined' ? window.location.origin : '')

  try {
    const parsed = new URL(u, pageOrigin || undefined)
    if (pageOrigin && parsed.origin === pageOrigin) {
      return parsed.href
    }
    if (!preferProxy) {
      const render = toSupabaseStorageRenderHref(parsed.href)
      if (render) return render
      return parsed.href
    }
    if (shouldProxyPosMenuImageForHybrid(parsed.href)) {
      return toHybridProxiedMenuImageHref(parsed.href)
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return toGeneralImageProxyHref(parsed.href)
    }
  } catch {
    if (preferProxy && /^https?:\/\//i.test(u)) return toGeneralImageProxyHref(u)
  }
  return u
}

/** IndexedDB·프리패치에 넣을 수 있는 출처만 허용 */
export function isPosMenuImageUrlCacheable(url: string, pageOrigin: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.origin === pageOrigin) return true
    const h = parsed.hostname.toLowerCase()
    return h.endsWith('.supabase.co') || h === 'supabase.co'
  } catch {
    return false
  }
}
