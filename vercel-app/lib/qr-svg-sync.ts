/**
 * 로컬 QR data URI (영수증 HTML용).
 * `qrcode`는 async만 지원 → 인쇄 전에 await 하거나, 동기 빌더는 캐시만 읽는다.
 * quickchart.io 등 외부 URL 금지: Electron loadFile이 이미지 로딩에서 수 초~10초+ 지연됨.
 */
import QRCode from 'qrcode'

let cache: Map<string, string> | null = null

function getCache(): Map<string, string> {
  if (!cache) cache = new Map()
  return cache
}

function cacheKey(text: string, size: number): string {
  return `${text}__${size}`
}

/** 이미 생성된 QR만 반환(네트워크 없음). 없으면 빈 문자열. */
export function peekCachedQrDataUri(text: string, size = 180): string {
  const raw = String(text || '').trim()
  if (!raw) return ''
  return getCache().get(cacheKey(raw, size)) || ''
}

/** QR 텍스트 → data URI (캐시됨). 영수증 빌더 호출 전에 await. */
export async function buildQrDataUri(text: string, size = 180): Promise<string> {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const key = cacheKey(raw, size)
  const c = getCache()
  const hit = c.get(key)
  if (hit) return hit

  try {
    const url = await QRCode.toDataURL(raw, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
    c.set(key, url)
    return url
  } catch {
    return ''
  }
}
