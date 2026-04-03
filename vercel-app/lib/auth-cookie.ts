/**
 * 관리자/API 인증용 cm_token 쿠키 (sessionStorage와 병행).
 * sessionStorage는 탭마다 달라 새 탭에서 API만 401 나는 문제를 쿠키로 보완.
 */

const COOKIE_NAME = 'cm_token'
const MAX_AGE_SEC = 7 * 24 * 60 * 60

function isSecureCookieEnv(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}

/** 로그인 성공 응답에 부착 */
export function buildSetAuthCookieHeader(token: string): string {
  const v = encodeURIComponent(token)
  const parts = [`${COOKIE_NAME}=${v}`, 'Path=/', `Max-Age=${MAX_AGE_SEC}`, 'HttpOnly', 'SameSite=Lax']
  if (isSecureCookieEnv()) parts.push('Secure')
  return parts.join('; ')
}

/** 로그아웃·세션 종료 시 무효화 */
export function buildClearAuthCookieHeader(): string {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax']
  if (isSecureCookieEnv()) parts.push('Secure')
  return parts.join('; ')
}
