/**
 * 권한 관리 유틸리티
 *
 * 역할 구분:
 * - Director급: director, ceo, hr → 전체 권한, Office 검색 가능
 * - Officer: officer → Office 제외한 전체 권한 (급여/직원 관리)
 * - Manager: manager → 매장 매니저, 자기 매장 한정
 * - Franchisee: franchisee (추후)
 */

const DIRECTOR_ROLES = ["director", "ceo", "hr"]
const OFFICE_ROLES = ["director", "ceo", "hr", "officer"]
const MANAGER_ROLE = "manager"

/** Director급인지 (전체 권한 + Office 검색) */
export function isDirectorRole(role: string): boolean {
  const r = String(role || "").toLowerCase().trim()
  return DIRECTOR_ROLES.some((x) => r.includes(x))
}

/** 본사 권한인지 (Director + Officer) */
export function isOfficeRole(role: string): boolean {
  const r = String(role || "").toLowerCase().trim()
  return OFFICE_ROLES.some((x) => r.includes(x))
}

/** 매장 매니저인지 */
export function isManagerRole(role: string): boolean {
  const r = String(role || "").toLowerCase().trim()
  return r.includes(MANAGER_ROLE)
}

/** 설정 페이지 접근 가능 (Director, Officer만) */
export function canAccessSettings(role: string): boolean {
  const r = String(role || "").toLowerCase().trim()
  return r.includes("director") || r.includes("officer") || r.includes("ceo") || r.includes("hr")
}

/** 해당 경로에 매니저 접근 불가 여부 */
const MANAGER_DENIED_PATHS = [
  "/admin/items",
  "/admin/vendors",
  "/admin/settings",
]

/** 매니저가 해당 경로에 접근할 수 있는지 */
export function canManagerAccessPath(pathname: string): boolean {
  const p = String(pathname || "").trim()
  if (!p.startsWith("/admin")) return true
  return !MANAGER_DENIED_PATHS.some((denied) => p === denied || p.startsWith(denied + "/"))
}
