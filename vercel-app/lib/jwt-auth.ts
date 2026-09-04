/**
 * JWT 발급·검증 (서버 전용)
 * 로그인 성공 시 토큰 발급, API 요청 시 검증에 사용
 */
import * as jose from 'jose'
import { AUTH_TOKEN_JWT_EXPIRY } from '@/lib/auth-token-ttl'

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
  /** employees.can_manage_office_payroll — 오피스 급여 조회·계산·확정 */
  canManageOfficePayroll?: boolean
  iat?: number
  exp?: number
}

const ALG = 'HS256'

const FALLBACK_SECRET = 'cm-erp-fallback'

function isProdLike(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}

function getSecret(): Uint8Array {
  const jwtExplicit = (process.env.JWT_SECRET || '').trim()
  if (isProdLike()) {
    if (jwtExplicit.length < 32) {
      throw new Error(
        '운영 환경에서는 서버 전용 JWT_SECRET을 32자 이상으로 설정하세요. (SUPABASE_ANON_KEY로 서명하지 마세요.)'
      )
    }
    return new TextEncoder().encode(jwtExplicit)
  }
  if (jwtExplicit.length >= 16) {
    return new TextEncoder().encode(jwtExplicit)
  }
  const anon = (process.env.SUPABASE_ANON_KEY || '').trim()
  if (anon.length >= 16) {
    return new TextEncoder().encode(anon)
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
  if (payload.canManageOfficePayroll === true) {
    body.canManageOfficePayroll = true
  }
  return new jose.SignJWT(body)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(AUTH_TOKEN_JWT_EXPIRY)
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
    const officePayrollFlag = payload.canManageOfficePayroll === true
    return {
      ...(payload.tenantId ? { tenantId: String(payload.tenantId) } : {}),
      ...(payload.company ? { company: String(payload.company) } : {}),
      store: String(payload.store || ''),
      name: String(payload.name || ''),
      role: String(payload.role || ''),
      ...(eidNum != null && eidNum > 0 ? { employeeId: eidNum } : {}),
      ...(ecode ? { employeeCode: ecode } : {}),
      ...(allowedStores ? { allowedStores } : {}),
      ...(officePayrollFlag ? { canManageOfficePayroll: true } : {}),
    }
  } catch {
    return null
  }
}
