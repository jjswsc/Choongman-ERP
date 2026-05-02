/**
 * API 라우트용 인증 검증 헬퍼
 * Authorization: Bearer <token> 또는 Cookie에서 JWT 추출 후 검증
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, type JwtPayload } from './jwt-auth'
import { isAccountingRole, isManagerOrFranchiseeRole, isOfficeRole } from '@/lib/permissions'

/** API Route의 Request/NextRequest에서 Bearer JWT만 검증 (선택) */
export async function tryVerifyBearerFromRequest(req: Request | NextRequest): Promise<JwtPayload | null> {
  const auth = req.headers.get('Authorization') || ''
  const m = auth.match(/^Bearer\s+(\S+)/i)
  if (!m?.[1]) return null
  return verifyToken(m[1].trim())
}

export type AuthLevel = 'any' | 'manager' | 'office' | 'director'

/**
 * 요청에서 JWT를 추출하고 검증.
 * @returns 검증된 identity 또는 null (인증 실패)
 */
export async function getVerifiedAuth(req: NextRequest): Promise<JwtPayload | null> {
  const authHeader = req.headers.get('Authorization')
  let bearerToken: string | null = null
  if (authHeader?.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim()
    bearerToken = t || null
  }
  const cookieRaw = req.cookies.get('cm_token')?.value
  const cookieToken = cookieRaw && String(cookieRaw).trim() ? String(cookieRaw).trim() : null

  // Bearer가 있어도 만료·불일치면 무시하고 HttpOnly 쿠키(cm_token)로 재시도 — 탭별 sessionStorage 만료와 쿠키 불일치 시 401 방지
  if (bearerToken) {
    const fromBearer = await verifyToken(bearerToken)
    if (fromBearer) return fromBearer
  }
  if (cookieToken) {
    const fromRaw = await verifyToken(cookieToken)
    if (fromRaw) return fromRaw
    try {
      const decoded = decodeURIComponent(cookieToken)
      if (decoded !== cookieToken) {
        return verifyToken(decoded)
      }
    } catch {
      return null
    }
  }
  return null
}

/**
 * 인증 필수 + 권한 레벨 검사
 * @param req NextRequest
 * @param requiredLevel 'any' | 'manager' | 'office' | 'director'
 * @returns { auth, errorResponse } - auth 있으면 성공, errorResponse 있으면 401/403 반환용
 */
export async function requireAuth(
  req: NextRequest,
  requiredLevel: AuthLevel = 'any'
): Promise<
  | { auth: JwtPayload; errorResponse: null }
  | { auth: null; errorResponse: NextResponse }
> {
  const auth = await getVerifiedAuth(req)
  if (!auth) {
    return {
      auth: null,
      errorResponse: NextResponse.json(
        {
          success: false,
          message: '인증이 필요합니다. 다시 로그인해 주세요.',
          msg: '인증이 필요합니다. 다시 로그인해 주세요.',
        },
        { status: 401 }
      ),
    }
  }

  if (requiredLevel === 'any') {
    return { auth, errorResponse: null }
  }

  const r = (auth.role || '').toLowerCase()
  const roleRaw = String(auth.role || '')
  const isDirector = ['director', 'ceo', 'hr'].some((x) => r.includes(x))
  const isOffice = isOfficeRole(roleRaw)
  const isManager = isManagerOrFranchiseeRole(roleRaw)

  if (requiredLevel === 'director' && !isDirector) {
    return {
      auth: null,
      errorResponse: NextResponse.json(
        {
          success: false,
          message: '본 기능은 Director 권한이 필요합니다.',
          msg: '본 기능은 Director 권한이 필요합니다.',
        },
        { status: 403 }
      ),
    }
  }
  if (requiredLevel === 'office' && !isOffice) {
    return {
      auth: null,
      errorResponse: NextResponse.json(
        {
          success: false,
          message: '본사 권한이 필요합니다.',
          msg: '본사 권한이 필요합니다.',
        },
        { status: 403 }
      ),
    }
  }
  if (requiredLevel === 'manager' && !isManager && !isOffice && !isAccountingRole(r)) {
    return {
      auth: null,
      errorResponse: NextResponse.json(
        {
          success: false,
          message: '매니저 이상 권한이 필요합니다.',
          msg: '매니저 이상 권한이 필요합니다.',
        },
        { status: 403 }
      ),
    }
  }

  return { auth, errorResponse: null }
}
