/**
 * API 라우트용 인증 검증 헬퍼
 * Authorization: Bearer <token> 또는 Cookie에서 JWT 추출 후 검증
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, type JwtPayload } from './jwt-auth'

export type AuthLevel = 'any' | 'manager' | 'office' | 'director'

/**
 * 요청에서 JWT를 추출하고 검증.
 * @returns 검증된 identity 또는 null (인증 실패)
 */
export async function getVerifiedAuth(req: NextRequest): Promise<JwtPayload | null> {
  const authHeader = req.headers.get('Authorization')
  let token: string | null = null

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim()
  } else {
    const cookieToken = req.cookies.get('cm_token')?.value
    if (cookieToken) token = cookieToken
  }

  if (!token) return null
  return verifyToken(token)
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
        { success: false, message: '인증이 필요합니다. 다시 로그인해 주세요.' },
        { status: 401 }
      ),
    }
  }

  if (requiredLevel === 'any') {
    return { auth, errorResponse: null }
  }

  const r = (auth.role || '').toLowerCase()
  const isDirector = ['director', 'ceo', 'hr'].some((x) => r.includes(x))
  const isOffice = isDirector || r.includes('officer')
  const isManager = r.includes('manager')

  if (requiredLevel === 'director' && !isDirector) {
    return {
      auth: null,
      errorResponse: NextResponse.json(
        { success: false, message: '본 기능은 Director 권한이 필요합니다.' },
        { status: 403 }
      ),
    }
  }
  if (requiredLevel === 'office' && !isOffice) {
    return {
      auth: null,
      errorResponse: NextResponse.json(
        { success: false, message: '본사 권한이 필요합니다.' },
        { status: 403 }
      ),
    }
  }
  if (requiredLevel === 'manager' && !isManager && !isOffice) {
    return {
      auth: null,
      errorResponse: NextResponse.json(
        { success: false, message: '매니저 이상 권한이 필요합니다.' },
        { status: 403 }
      ),
    }
  }

  return { auth, errorResponse: null }
}
