/** 로그인 「새로고침·다시 시도」가 SW 해제 대기에 막히지 않게 쓰는 쿼리 */

export const LOGIN_HARD_REFRESH_PARAM = "_refresh"
export const CHUNK_RECOVERY_QUERY_PARAM = "_chunk"

export function isLoginHardRefreshUrl(url: URL): boolean {
  return url.searchParams.has(LOGIN_HARD_REFRESH_PARAM) || url.searchParams.has(CHUNK_RECOVERY_QUERY_PARAM)
}

/** JS 핸들러가 죽어도 브라우저가 따라갈 수 있는 고정 링크 */
export function loginNativeRefreshHref(pathname: string): string {
  const path = (pathname || "/pos/login").replace(/\/+$/, "") || "/"
  return `${path}?${LOGIN_HARD_REFRESH_PARAM}=1`
}

export function withLoginHardRefreshParam(href: string, now = Date.now()): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://local.invalid"
  const url = new URL(href, origin)
  url.searchParams.set(LOGIN_HARD_REFRESH_PARAM, String(now))
  return `${url.pathname}${url.search}${url.hash}`
}
