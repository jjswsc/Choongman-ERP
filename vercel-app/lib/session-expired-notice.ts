/** 로그인 화면·401 리다이렉트에서 쓰는 세션 만료 안내 */

export const SESSION_EXPIRED_MSG = "session_expired"
export const SESSION_EXPIRED_I18N_KEY = "sessionExpiredRelogin"

export function loginNoticeKeyFromQueryMsg(msg: string | null | undefined): string | undefined {
  const v = String(msg || "").trim()
  if (v === "no_admin") return "msg_no_admin_permission"
  if (v === SESSION_EXPIRED_MSG) return SESSION_EXPIRED_I18N_KEY
  return undefined
}

/** `/login` 또는 `/admin/login` 등에 `msg=session_expired`를 붙인다. */
export function loginPathWithSessionExpired(loginPath: string): string {
  const path = String(loginPath || "/login").trim() || "/login"
  const q = path.indexOf("?")
  const pathname = q >= 0 ? path.slice(0, q) : path
  const search = q >= 0 ? path.slice(q + 1) : ""
  const params = new URLSearchParams(search)
  params.set("msg", SESSION_EXPIRED_MSG)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}
