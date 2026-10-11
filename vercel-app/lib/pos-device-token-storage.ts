/**
 * POS 단말 ID(pos_connected_devices.device_token) 보관.
 * localStorage만 쓰면 매장 PC 전원 차단·정리 프로그램 등으로 지워질 때마다 새 기기(주문 단말)로 등록돼
 * 잠금 ON 매장에서 메인이 풀린다 → 별도 파일에 저장되는 쿠키에 사본을 두고 복구한다.
 */

export const POS_DEVICE_TOKEN_STORAGE_KEY = 'pos_device_token'
export const POS_DEVICE_TOKEN_COOKIE = 'cm_pos_device_token'
/** Chromium 쿠키 만료 상한(400일) — 접속할 때마다 갱신 */
const POS_DEVICE_TOKEN_COOKIE_MAX_AGE_SEC = 400 * 24 * 60 * 60

export function isUsablePosDeviceToken(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  const t = raw.trim()
  return t.length >= 10 && t.length <= 128 && !/[\s;,]/.test(t)
}

export function readPosDeviceTokenFromCookie(cookieHeader: string): string {
  for (const part of String(cookieHeader || '').split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== POS_DEVICE_TOKEN_COOKIE) continue
    try {
      const v = decodeURIComponent(part.slice(eq + 1).trim())
      return isUsablePosDeviceToken(v) ? v : ''
    } catch {
      return ''
    }
  }
  return ''
}

export function buildPosDeviceTokenCookie(token: string, secure: boolean): string {
  return [
    `${POS_DEVICE_TOKEN_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${POS_DEVICE_TOKEN_COOKIE_MAX_AGE_SEC}`,
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

function newPosDeviceToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

/** localStorage → 쿠키 사본 순으로 기존 ID를 찾고, 없을 때만 새로 만든다. 찾은 ID는 두 곳에 다시 기록. */
export function getOrCreatePosDeviceToken(): string {
  if (typeof window === 'undefined') return ''
  let fromLocal = ''
  let localOk = true
  try {
    fromLocal = String(localStorage.getItem(POS_DEVICE_TOKEN_STORAGE_KEY) ?? '').trim()
  } catch {
    localOk = false
  }
  let fromCookie = ''
  try {
    fromCookie = readPosDeviceTokenFromCookie(document.cookie)
  } catch {
    /* ignore */
  }

  const token = isUsablePosDeviceToken(fromLocal)
    ? fromLocal
    : fromCookie || (localOk ? newPosDeviceToken() : '')
  if (!token) return ''

  if (localOk && fromLocal !== token) {
    try {
      localStorage.setItem(POS_DEVICE_TOKEN_STORAGE_KEY, token)
    } catch {
      /* ignore */
    }
  }
  try {
    document.cookie = buildPosDeviceTokenCookie(token, window.location.protocol === 'https:')
  } catch {
    /* ignore */
  }
  return token
}
