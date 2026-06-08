/** 출퇴근 QR 키오스크 단말 — localStorage 키 (POS device_token 과 분리) */
export const ATTENDANCE_QR_DEVICE_TOKEN_KEY = 'attendance_qr_device_token'
export const ATTENDANCE_QR_STORE_CODE_KEY = 'attendance_qr_store_code'

export function getOrCreateAttendanceQrDeviceToken(): string {
  if (typeof window === 'undefined') return ''
  try {
    let token = localStorage.getItem(ATTENDANCE_QR_DEVICE_TOKEN_KEY)
    if (!token || token.length < 10) {
      token = `aqr-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
      localStorage.setItem(ATTENDANCE_QR_DEVICE_TOKEN_KEY, token)
    }
    return token
  } catch {
    return ''
  }
}

export function readAttendanceQrStoreCode(): string {
  if (typeof window === 'undefined') return ''
  try {
    return String(localStorage.getItem(ATTENDANCE_QR_STORE_CODE_KEY) || '').trim()
  } catch {
    return ''
  }
}

export function writeAttendanceQrStoreCode(storeCode: string): void {
  if (typeof window === 'undefined') return
  try {
    const s = String(storeCode || '').trim()
    if (s) localStorage.setItem(ATTENDANCE_QR_STORE_CODE_KEY, s)
    else localStorage.removeItem(ATTENDANCE_QR_STORE_CODE_KEY)
  } catch {
    /* ignore */
  }
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
