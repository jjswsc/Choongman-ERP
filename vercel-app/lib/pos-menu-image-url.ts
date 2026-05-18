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

export function toHybridProxiedMenuImageHref(absoluteUrl: string): string {
  return `/api/posMenuImageProxy?u=${encodeURIComponent(absoluteUrl)}`
}

function toGeneralImageProxyHref(absoluteUrl: string): string {
  return `/api/imageProxy?url=${encodeURIComponent(absoluteUrl)}`
}

/**
 * POS 타일·미리보기용 최종 img src.
 * - Supabase Storage → posMenuImageProxy (비공개 버킷·SW 호환)
 * - Google Drive 등 기타 http(s) → imageProxy (관리자 품목/재고 화면과 동일)
 */
export function toPosMenuDisplayImageHref(
  normalizedUrl: string,
  opts?: { preferProxy?: boolean; pageOrigin?: string }
): string {
  const u = String(normalizedUrl || '').trim()
  if (!u) return ''
  if (u.startsWith('data:') || u.startsWith('blob:')) return u

  const preferProxy =
    opts?.preferProxy ??
    (typeof window !== 'undefined' && window.location?.protocol === 'https:')
  if (!preferProxy) return u

  const pageOrigin =
    opts?.pageOrigin ??
    (typeof window !== 'undefined' ? window.location.origin : '')

  try {
    const parsed = new URL(u, pageOrigin || undefined)
    if (pageOrigin && parsed.origin === pageOrigin) {
      return parsed.href
    }
    if (shouldProxyPosMenuImageForHybrid(parsed.href)) {
      return toHybridProxiedMenuImageHref(parsed.href)
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return toGeneralImageProxyHref(parsed.href)
    }
  } catch {
    if (/^https?:\/\//i.test(u)) return toGeneralImageProxyHref(u)
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
