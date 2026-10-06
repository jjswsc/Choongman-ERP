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

function tenantKeySuffix(tenantId?: string): string {
  const id = String(tenantId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
  return id ? `__${id}` : ''
}

function tokenKeys(tenantId?: string): { storage: string; cookie: string } {
  const suffix = tenantKeySuffix(tenantId)
  return {
    storage: ATTENDANCE_QR_DEVICE_TOKEN_KEY + suffix,
    cookie: ATTENDANCE_QR_DEVICE_TOKEN_COOKIE + suffix,
  }
}

function storeKeys(tenantId?: string): { storage: string; cookie: string } {
  const suffix = tenantKeySuffix(tenantId)
  return {
    storage: ATTENDANCE_QR_STORE_CODE_KEY + suffix,
    cookie: ATTENDANCE_QR_STORE_CODE_COOKIE + suffix,
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

/** tenantId 가 있으면 그 회사 키만 읽고 쓴다. 없으면 로그인 없이 켜 둔 키오스크용 공통 키. */
export function readAttendanceQrDeviceToken(tenantId?: string): string {
  const keys = tokenKeys(tenantId)
  return readPersistedValue(keys.storage, keys.cookie)
}

export function getOrCreateAttendanceQrDeviceToken(tenantId?: string): string {
  if (typeof window === 'undefined') return ''
  try {
    const keys = tokenKeys(tenantId)
    let token = readPersistedValue(keys.storage, keys.cookie)
    if (!token || token.length < 10) {
      token = `aqr-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
      writePersistedValue(keys.storage, keys.cookie, token)
    }
    return token
  } catch {
    return ''
  }
}

export function writeAttendanceQrDeviceToken(deviceToken: string, tenantId?: string): void {
  const keys = tokenKeys(tenantId)
  writePersistedValue(keys.storage, keys.cookie, deviceToken)
}

export function readAttendanceQrStoreCode(tenantId?: string): string {
  const keys = storeKeys(tenantId)
  return readPersistedValue(keys.storage, keys.cookie)
}

export function writeAttendanceQrStoreCode(storeCode: string, tenantId?: string): void {
  const keys = storeKeys(tenantId)
  writePersistedValue(keys.storage, keys.cookie, storeCode)
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

export const ATTENDANCE_QR_KIOSK_PATH = '/kiosk/attendance-qr'

/** switch=1: 직원 세션이 남아 있어도 로그인 폼을 보여 매니저로 전환 가능하게 함 (자동 복귀 루프 방지) */
export function attendanceQrKioskLoginHref(): string {
  return `/pos/login?redirect=${encodeURIComponent(ATTENDANCE_QR_KIOSK_PATH)}&switch=1`
}

/** POS/관리자 로그인 ?redirect= 은 출퇴근 QR 키오스크 경로만 허용 (오픈 리다이렉트 방지) */
export function safeAttendanceQrKioskRedirect(raw: string | null | undefined): string {
  const p = String(raw || '').trim()
  if (p === ATTENDANCE_QR_KIOSK_PATH) return p
  return ''
}

export const ATTENDANCE_QR_DEVICE_HEADERS = {
  deviceToken: 'X-Cm-Attendance-Qr-Device-Token',
  storeCode: 'X-Cm-Attendance-Qr-Store-Code',
} as const
