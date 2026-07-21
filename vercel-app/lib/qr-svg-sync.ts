/**
 * 동기 QR코드 SVG data URI 생성 (영수증 HTML 빌더에서 사용).
 * `qrcode` 패키지는 async만 지원하므로, 영수증 빌더 호출 전에 미리 생성하는 헬퍼.
 *
 * 이 모듈은 **비동기** — 호출자가 await 해서 결과를 동기 빌더에 전달.
 */
import QRCode from 'qrcode'

let cache: Map<string, string> | null = null

function getCache(): Map<string, string> {
  if (!cache) cache = new Map()
  return cache
}

/** QR 텍스트 → data URI (캐시됨). 영수증 빌더 호출 전에 await. */
export async function buildQrDataUri(text: string, size = 180): Promise<string> {
  const key = `${text}__${size}`
  const c = getCache()
  const hit = c.get(key)
  if (hit) return hit

  try {
    const url = await QRCode.toDataURL(text, {
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
