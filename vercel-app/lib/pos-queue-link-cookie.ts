/** 손님 번호표 → LINE 로그인 후 번호표로 돌아오기 위한 단기 쿠키 (경로는 /q/<token> 으로만 제한) */

export const POS_QUEUE_LINK_COOKIE = 'cm_queue_link'
const MAX_AGE_SEC = 30 * 60
const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/

export function isValidPosQueuePublicToken(token: string): boolean {
  return TOKEN_RE.test(String(token || ''))
}

export function buildPosQueueLinkCookie(token: string, secure: boolean): string {
  return `${POS_QUEUE_LINK_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${MAX_AGE_SEC}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}

export function buildPosQueueLinkClearCookie(secure: boolean): string {
  return `${POS_QUEUE_LINK_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}

export function readPosQueueLinkTokenFromCookieHeader(cookieHeader: string | null | undefined): string {
  for (const part of String(cookieHeader || '').split(';')) {
    const [rawKey, ...rest] = part.trim().split('=')
    if (rawKey !== POS_QUEUE_LINK_COOKIE) continue
    let value = rest.join('=')
    try {
      value = decodeURIComponent(value)
    } catch {
      return ''
    }
    return isValidPosQueuePublicToken(value) ? value : ''
  }
  return ''
}
