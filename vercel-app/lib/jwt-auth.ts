/**
 * JWT 발급·검증 (서버 전용)
 * 로그인 성공 시 토큰 발급, API 요청 시 검증에 사용
 */
import * as jose from 'jose'

export interface JwtPayload {
  tenantId?: string
  company?: string
  store: string
  name: string
  role: string
  /** 직원 PK (휴가·집계 식별, 구 토큰에는 없을 수 있음) */
  employeeId?: number
  /** 직원 코드(표시용) */
  employeeCode?: string
  /** 가맹점주 복수 매장 시 JWT에 허용 매장(대표+추가), 없으면 store만 사용 */
  allowedStores?: string[]
  iat?: number
  exp?: number
}

const ALG = 'HS256'
const EXPIRY = '7d'

const FALLBACK_SECRET = 'cm-erp-fallback'

function getSecret(): Uint8Array {
  const secret = (process.env.JWT_SECRET || process.env.SUPABASE_ANON_KEY || '').trim()
  if (secret.length >= 16) {
    return new TextEncoder().encode(secret)
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '운영 환경에서는 .env에 JWT_SECRET(32자 이상 권장) 또는 SUPABASE_ANON_KEY를 반드시 설정하세요.'
    )
  }
  return new TextEncoder().encode(FALLBACK_SECRET)
}

/** 로그인 성공 시 토큰 발급 */
export async function signToken(payload: JwtPayload): Promise<string> {
  const secret = getSecret()
  const body: Record<string, unknown> = {
    store: payload.store,
    name: payload.name,
    role: payload.role,
  }
  if (payload.tenantId != null && String(payload.tenantId).trim() !== '') {
    body.tenantId = String(payload.tenantId).trim()
  }
  if (payload.company != null && String(payload.company).trim() !== '') {
    body.company = String(payload.company).trim()
  }
  if (payload.employeeId != null && Number.isFinite(Number(payload.employeeId))) {
    body.employeeId = Math.floor(Number(payload.employeeId))
  }
  if (payload.employeeCode != null && String(payload.employeeCode).trim() !== '') {
    body.employeeCode = String(payload.employeeCode).trim()
  }
  if (Array.isArray(payload.allowedStores) && payload.allowedStores.length > 0) {
    body.allowedStores = payload.allowedStores
  }
  return new jose.SignJWT(body)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secret)
}

/** API 요청에서 토큰 검증, 페이로드 반환 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const secret = getSecret()
    const { payload } = await jose.jwtVerify(token, secret)
    const allowedRaw = payload.allowedStores
    let allowedStores: string[] | undefined
    if (Array.isArray(allowedRaw)) {
      allowedStores = allowedRaw.map((x) => String(x || '').trim()).filter(Boolean)
      if (allowedStores.length === 0) allowedStores = undefined
    }
    const eid = payload.employeeId
    const eidNum = eid != null && Number.isFinite(Number(eid)) ? Math.floor(Number(eid)) : undefined
    const ecode = payload.employeeCode != null ? String(payload.employeeCode).trim() : ''
    return {
      ...(payload.tenantId ? { tenantId: String(payload.tenantId) } : {}),
      ...(payload.company ? { company: String(payload.company) } : {}),
      store: String(payload.store || ''),
      name: String(payload.name || ''),
      role: String(payload.role || ''),
      ...(eidNum != null && eidNum > 0 ? { employeeId: eidNum } : {}),
      ...(ecode ? { employeeCode: ecode } : {}),
      ...(allowedStores ? { allowedStores } : {}),
    }
  } catch {
    return null
  }
}
