/**
 * 열전사 HTML 인쇄용 자산셋.
 * Electron loadFile(file://)은 https img를 네트워크로 받아 did-finish-load가
 * 수 초~10초+ 지연될 수 있음 → data URI만 쓰거나 짧게 실패.
 */

const TRANSPARENT_1PX_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

export function isOfflineSafePrintImgSrc(src: string): boolean {
  const s = String(src || '').trim()
  return s.startsWith('data:') || s.startsWith('blob:')
}

/** 인쇄 HTML에서 http(s) img를 투명 1px로 치환 — Electron loadFile 지연 방지 */
export function stripRemoteImgSrcForThermalPrint(html: string): string {
  return String(html || '').replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(https?:\/\/[^"']*)\2/gi,
    `$1$2${TRANSPARENT_1PX_GIF}$2`
  )
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('read_failed'))
    reader.readAsDataURL(blob)
  })
}

/**
 * URL → data URI. 이미 data/blob이면 그대로.
 * 실패·타임아웃 시 빈 문자열(해당 이미지 생략).
 */
export async function fetchPrintAssetAsDataUri(
  url: string,
  opts?: { timeoutMs?: number; origin?: string }
): Promise<string> {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (isOfflineSafePrintImgSrc(raw)) return raw

  let absolute = raw
  if (raw.startsWith('/') && opts?.origin) {
    absolute = `${String(opts.origin).replace(/\/$/, '')}${raw}`
  }
  if (!/^https?:\/\//i.test(absolute)) return ''

  const timeoutMs = Math.max(100, Math.trunc(Number(opts?.timeoutMs) || 700))
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer =
    ac != null
      ? setTimeout(() => {
          try {
            ac.abort()
          } catch {
            /* ignore */
          }
        }, timeoutMs)
      : null

  try {
    const res = await fetch(absolute, {
      method: 'GET',
      credentials: 'omit',
      cache: 'force-cache',
      signal: ac?.signal,
    })
    if (!res.ok) return ''
    const blob = await res.blob()
    if (!blob || blob.size <= 0 || blob.size > 1_500_000) return ''
    const dataUri = await blobToDataUri(blob)
    return isOfflineSafePrintImgSrc(dataUri) ? dataUri : ''
  } catch {
    return ''
  } finally {
    if (timer != null) clearTimeout(timer)
  }
}
