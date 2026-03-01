/**
 * JWT 발급·검증 (서버 전용)
 * 로그인 성공 시 토큰 발급, API 요청 시 검증에 사용
 */
import * as jose from 'jose'

export interface JwtPayload {
  store: string
  name: string
  role: string
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
  return new jose.SignJWT({ ...payload })
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
    return {
      store: String(payload.store || ''),
      name: String(payload.name || ''),
      role: String(payload.role || ''),
    }
  } catch {
    return null
  }
}
