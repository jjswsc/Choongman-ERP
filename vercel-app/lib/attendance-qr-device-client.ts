/** 출퇴근 QR 키오스크 단말 — localStorage 키 (POS device_token 과 분리) */
export const ATTENDANCE_QR_DEVICE_TOKEN_KEY = 'attendance_qr_device_token'
export const ATTENDANCE_QR_STORE_CODE_KEY = 'attendance_qr_store_code'

/** localStorage 유실 시 복구용 — 1년 유지 쿠키 */
const ATTENDANCE_QR_DEVICE_TOKEN_COOKIE = 'cm_aqr_device_token'
const ATTENDANCE_QR_STORE_CODE_COOKIE = 'cm_aqr_store_code'
const ATTENDANCE_QR_COOKIE_MAX_AGE_SEC = 365 * 24 * 60 * 60

function readCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  try {
    const key = `${encodeURIComponent(name)}=`
    for (const part of document.cookie.split(';')) {
      const trimmed = part.trim()
      if (trimmed.startsWith(key)) {
        return decodeURIComponent(trimmed.slice(key.length))
      }
    }
  } catch {
    /* ignore */
  }
  return ''
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return
  try {
    const secure =
      typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${ATTENDANCE_QR_COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure}`
  } catch {
    /* ignore */
  }
}

function clearCookie(name: string): void {
  if (typeof document === 'undefined') return
  try {
    const secure =
      typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${encodeURIComponent(name)}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
  } catch {
    /* ignore */
  }
}

function readPersistedValue(storageKey: string, cookieKey: string): string {
  if (typeof window === 'undefined') return ''
  let fromStorage = ''
  try {
    fromStorage = String(localStorage.getItem(storageKey) || '').trim()
  } catch {
    /* ignore */
  }
  if (fromStorage) return fromStorage

  const fromCookie = String(readCookie(cookieKey) || '').trim()
  if (!fromCookie) return ''

  try {
    localStorage.setItem(storageKey, fromCookie)
  } catch {
    /* ignore */
  }
  return fromCookie
}

function writePersistedValue(storageKey: string, cookieKey: string, value: string): void {
  if (typeof window === 'undefined') return
  const v = String(value || '').trim()
  try {
    if (v) localStorage.setItem(storageKey, v)
    else localStorage.removeItem(storageKey)
  } catch {
    /* ignore */
  }
  try {
    if (v) writeCookie(cookieKey, v)
    else clearCookie(cookieKey)
  } catch {
    /* ignore */
  }
}

/** 태블릿·키오스크 브라우저가 저장소를 덜 aggressively purge 하도록 요청 */
export function requestAttendanceQrPersistentStorage(): void {
  if (typeof navigator === 'undefined') return
  try {
    const storage = navigator.storage
    if (storage?.persist) {
      void storage.persist().catch(() => {})
    }
  } catch {
    /* ignore */
  }
}

export function getOrCreateAttendanceQrDeviceToken(): string {
  if (typeof window === 'undefined') return ''
  try {
    let token = readPersistedValue(
      ATTENDANCE_QR_DEVICE_TOKEN_KEY,
      ATTENDANCE_QR_DEVICE_TOKEN_COOKIE
    )
    if (!token || token.length < 10) {
      token = `aqr-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
      writePersistedValue(
        ATTENDANCE_QR_DEVICE_TOKEN_KEY,
        ATTENDANCE_QR_DEVICE_TOKEN_COOKIE,
        token
      )
    }
    return token
  } catch {
    return ''
  }
}

export function writeAttendanceQrDeviceToken(deviceToken: string): void {
  writePersistedValue(
    ATTENDANCE_QR_DEVICE_TOKEN_KEY,
    ATTENDANCE_QR_DEVICE_TOKEN_COOKIE,
    deviceToken
  )
}

export function readAttendanceQrStoreCode(): string {
  return readPersistedValue(ATTENDANCE_QR_STORE_CODE_KEY, ATTENDANCE_QR_STORE_CODE_COOKIE)
}

export function writeAttendanceQrStoreCode(storeCode: string): void {
  writePersistedValue(
    ATTENDANCE_QR_STORE_CODE_KEY,
    ATTENDANCE_QR_STORE_CODE_COOKIE,
    storeCode
  )
}

export function buildAttendanceQrClientHint(): string {
  if (typeof navigator === 'undefined') return ''
  try {
    const ua = String(navigator.userAgent || '').trim()
    const plat = String(navigator.platform || '').trim()
    const parts = ['QR kiosk', plat && plat !== 'Unknown' ? plat : '', ua].filter(Boolean)
    const s = parts.join(' · ')
    return s.length <= 240 ? s : `${s.slice(0, 237)}…`
  } catch {
    return 'QR kiosk'
  }
}

export const ATTENDANCE_QR_DEVICE_HEADERS = {
  deviceToken: 'X-Cm-Attendance-Qr-Device-Token',
  storeCode: 'X-Cm-Attendance-Qr-Store-Code',
} as const
