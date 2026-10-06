import { createHmac, timingSafeEqual } from 'node:crypto'

/** 방콕 기준 QR 버킷 길이(시간). 2시간마다 QR payload 갱신 */
export const ATTENDANCE_QR_BUCKET_HOURS = 2

/** 고정 QR 서명에 쓰는 버킷. 시간 창과 겹치지 않는 값 */
export const ATTENDANCE_QR_FIXED_BUCKET_MS = 0

export type AttendanceQrMode = 'rotating' | 'fixed'

export function parseAttendanceQrMode(raw: unknown): AttendanceQrMode {
  return raw === 'fixed' ? 'fixed' : 'rotating'
}

/** 매장 코드만 서명. 충만 등 테넌트 없는 배포용 */
const TOKEN_PREFIX = 'cmatt1'
/** 회사(tenant) + 매장 코드 서명. 같은 매장 코드라도 회사가 다르면 QR이 달라진다 */
const TOKEN_PREFIX_V2 = 'cmatt2'

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

function signPayload(storeCode: string, bucketStartMs: number, tenantId?: string): string {
  const tenant = String(tenantId || '').trim()
  const body = tenant
    ? `${TOKEN_PREFIX_V2}|${tenant}|${storeCode}|${bucketStartMs}`
    : `${TOKEN_PREFIX}|${storeCode}|${bucketStartMs}`
  return createHmac('sha256', getAttendanceQrSecret()).update(body, 'utf8').digest('base64url')
}

function signaturesMatch(sig: string, expected: string): boolean {
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function parseSignedPayload(qrPayload: string): {
  ok: boolean
  storeCode?: string
  tenantId?: string
  bucketStartMs?: number
  reason?: string
} {
  const raw = String(qrPayload || '').trim()
  const parts = raw.split('.')
  const prefix = parts[0]
  if (prefix === TOKEN_PREFIX_V2) {
    if (parts.length !== 5) return { ok: false, reason: 'invalid_format' }
    const tenantId = decodeURIComponent(parts[1] || '').trim()
    const storeCode = decodeURIComponent(parts[2] || '').trim()
    const bucketStartMs = Number(parts[3])
    const sig = String(parts[4] || '').trim()
    if (!tenantId || !storeCode || !Number.isFinite(bucketStartMs) || !sig) {
      return { ok: false, reason: 'invalid_format' }
    }
    if (!signaturesMatch(sig, signPayload(storeCode, bucketStartMs, tenantId))) {
      return { ok: false, reason: 'bad_signature' }
    }
    return { ok: true, storeCode, tenantId, bucketStartMs }
  }
  if (parts.length !== 4 || prefix !== TOKEN_PREFIX) {
    return { ok: false, reason: 'invalid_format' }
  }
  const storeCode = decodeURIComponent(parts[1] || '').trim()
  const bucketStartMs = Number(parts[2])
  const sig = String(parts[3] || '').trim()
  if (!storeCode || !Number.isFinite(bucketStartMs) || !sig) {
    return { ok: false, reason: 'invalid_format' }
  }
  if (!signaturesMatch(sig, signPayload(storeCode, bucketStartMs))) {
    return { ok: false, reason: 'bad_signature' }
  }
  return { ok: true, storeCode, bucketStartMs }
}

/** QR에 인코딩할 문자열. rotating=방콕 2시간 버킷, fixed=매장 고정 */
export function buildAttendanceQrPayload(
  storeCode: string,
  at: Date = new Date(),
  mode: AttendanceQrMode = 'rotating',
  tenantId?: string
): {
  qrPayload: string
  bucketStartMs: number
  expiresAt: string | null
  mode: AttendanceQrMode
  tenantId?: string
} {
  const store = String(storeCode || '').trim()
  if (!store) throw new Error('store_required')
  const tenant = String(tenantId || '').trim()
  const resolved = parseAttendanceQrMode(mode)
  const bucketStartMs =
    resolved === 'fixed' ? ATTENDANCE_QR_FIXED_BUCKET_MS : attendanceQrBucketStartMs(at)
  const sig = signPayload(store, bucketStartMs, tenant || undefined)
  const qrPayload = tenant
    ? `${TOKEN_PREFIX_V2}.${encodeURIComponent(tenant)}.${encodeURIComponent(store)}.${bucketStartMs}.${sig}`
    : `${TOKEN_PREFIX}.${encodeURIComponent(store)}.${bucketStartMs}.${sig}`
  return {
    qrPayload,
    bucketStartMs,
    expiresAt:
      resolved === 'fixed' ? null : attendanceQrBucketExpiresAt(bucketStartMs).toISOString(),
    mode: resolved,
    ...(tenant ? { tenantId: tenant } : {}),
  }
}

/** 서명만 확인. 만료·고정/변동 판정은 verifyAttendanceQrPayload */
export function readAttendanceQrPayload(qrPayload: string): {
  ok: boolean
  storeCode?: string
  tenantId?: string
  bucketStartMs?: number
  reason?: string
} {
  return parseSignedPayload(qrPayload)
}

/** submitAttendance qrToken 검증. mode 기본값은 변동(2시간) */
export function verifyAttendanceQrPayload(
  qrPayload: string,
  at: Date = new Date(),
  mode: AttendanceQrMode = 'rotating',
  opts?: { expectedTenantId?: string }
): {
  ok: boolean
  storeCode?: string
  tenantId?: string
  reason?: string
} {
  const parsed = parseSignedPayload(qrPayload)
  if (!parsed.ok || !parsed.storeCode || parsed.bucketStartMs == null) {
    return { ok: false, reason: parsed.reason || 'invalid_format' }
  }
  const { storeCode, bucketStartMs, tenantId } = parsed
  const expectedTenantId = String(opts?.expectedTenantId || '').trim()
  if (expectedTenantId && tenantId && expectedTenantId !== tenantId) {
    return { ok: false, storeCode, tenantId, reason: 'tenant_mismatch' }
  }
  const resolved = parseAttendanceQrMode(mode)
  if (resolved === 'fixed') {
    if (bucketStartMs !== ATTENDANCE_QR_FIXED_BUCKET_MS) {
      return { ok: false, storeCode, reason: 'mode_mismatch' }
    }
    return { ok: true, storeCode, ...(tenantId ? { tenantId } : {}) }
  }
  if (bucketStartMs === ATTENDANCE_QR_FIXED_BUCKET_MS) {
    return { ok: false, storeCode, reason: 'mode_mismatch' }
  }
  const nowBucket = attendanceQrBucketStartMs(at)
  if (bucketStartMs !== nowBucket) {
    return { ok: false, storeCode, reason: 'expired_bucket' }
  }
  return { ok: true, storeCode, ...(tenantId ? { tenantId } : {}) }
}
