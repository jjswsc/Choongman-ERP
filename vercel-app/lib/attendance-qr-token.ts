import { createHmac, timingSafeEqual } from 'node:crypto'

/** 방콕 기준 QR 버킷 길이(시간). 3시간마다 QR payload 갱신 */
export const ATTENDANCE_QR_BUCKET_HOURS = 3

const TOKEN_PREFIX = 'cmatt1'

function getAttendanceQrSecret(): string {
  const explicit = String(process.env.ATTENDANCE_QR_HMAC_SECRET || '').trim()
  if (explicit.length >= 16) return explicit
  const jwt = String(process.env.JWT_SECRET || '').trim()
  if (jwt.length >= 16) return jwt
  return 'cm-erp-attendance-qr-dev-only'
}

/** 방콕 기준 현재 버킷 시작 시각(UTC ms) */
export function attendanceQrBucketStartMs(at: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(at)
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0)
  const y = pick('year')
  const m = pick('month')
  const d = pick('day')
  let h = pick('hour')
  if (h === 24) h = 0
  const bucketHour = Math.floor(h / ATTENDANCE_QR_BUCKET_HOURS) * ATTENDANCE_QR_BUCKET_HOURS
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(bucketHour).padStart(2, '0')}:00:00+07:00`
  return new Date(iso).getTime()
}

export function attendanceQrBucketExpiresAt(bucketStartMs: number): Date {
  return new Date(bucketStartMs + ATTENDANCE_QR_BUCKET_HOURS * 60 * 60 * 1000)
}

function signPayload(storeCode: string, bucketStartMs: number): string {
  const body = `${TOKEN_PREFIX}|${storeCode}|${bucketStartMs}`
  return createHmac('sha256', getAttendanceQrSecret()).update(body, 'utf8').digest('base64url')
}

/** QR에 인코딩할 문자열 (직원 스캔용 — phase 2 submitAttendance에서 검증) */
export function buildAttendanceQrPayload(storeCode: string, at: Date = new Date()): {
  qrPayload: string
  bucketStartMs: number
  expiresAt: string
} {
  const store = String(storeCode || '').trim()
  if (!store) throw new Error('store_required')
  const bucketStartMs = attendanceQrBucketStartMs(at)
  const sig = signPayload(store, bucketStartMs)
  const qrPayload = `${TOKEN_PREFIX}.${encodeURIComponent(store)}.${bucketStartMs}.${sig}`
  return {
    qrPayload,
    bucketStartMs,
    expiresAt: attendanceQrBucketExpiresAt(bucketStartMs).toISOString(),
  }
}

/** phase 2: submitAttendance qrToken 검증용 */
export function verifyAttendanceQrPayload(qrPayload: string, at: Date = new Date()): {
  ok: boolean
  storeCode?: string
  reason?: string
} {
  const raw = String(qrPayload || '').trim()
  const parts = raw.split('.')
  if (parts.length !== 4 || parts[0] !== TOKEN_PREFIX) {
    return { ok: false, reason: 'invalid_format' }
  }
  const storeCode = decodeURIComponent(parts[1] || '').trim()
  const bucketStartMs = Number(parts[2])
  const sig = String(parts[3] || '').trim()
  if (!storeCode || !Number.isFinite(bucketStartMs) || !sig) {
    return { ok: false, reason: 'invalid_format' }
  }
  const expected = signPayload(storeCode, bucketStartMs)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: 'bad_signature' }
    }
  } catch {
    return { ok: false, reason: 'bad_signature' }
  }
  const nowBucket = attendanceQrBucketStartMs(at)
  if (bucketStartMs !== nowBucket) {
    return { ok: false, reason: 'expired_bucket' }
  }
  return { ok: true, storeCode }
}
