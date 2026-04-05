/**
 * POS 메뉴 썸네일 URL 정규화 (웹·하이브리드 공통, 클라이언트에서 window 사용)
 */

export function normalizePosMenuImageUrl(raw: string): string {
  const u = String(raw ?? '').trim()
  if (!u) return ''
  if (u.startsWith('//')) return `https:${u}`
  if (u.startsWith('/') && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${u}`
  }
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
