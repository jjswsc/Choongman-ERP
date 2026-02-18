/**
 * 권한 관리 유틸리티
 *
 * 역할 구분:
 * - Director급: director, ceo, hr → 전체 권한, Office 검색 가능
 * - Officer: officer → Office 제외한 전체 권한 (급여/직원 관리)
 * - Manager: manager → 매장 매니저, 자기 매장 한정
 * - Franchisee: franchisee (추후)
 *
 * store=Office → Officer로 인식 (employees.store가 본사/Office/오피스/본점이면)
 */

/** employees.store가 본사/Office인지 (→ Officer 권한 적용) */
export function isOfficeStore(store: string): boolean {
  const x = String(store || "").trim()
  return x === "본사" || x === "Office" || x === "오피스" || x === "본점" || x.toLowerCase() === "office"
}

export const OFFICE_STORES = ["본사", "Office", "오피스", "본점"]

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

/** 관리자 페이지 접근 가능 (본사 + 매니저 + POS 직원) */
export function canAccessAdmin(role: string): boolean {
  return (
    isOfficeRole(role) ||
    isManagerRole(role) ||
    isPosOrderOnlyRole(role) ||
    isPosSettlementOnlyRole(role)
  )
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

// ─── POS 직원·권한 (주문만 / 결산만 / 관리자) ───

/** 주문만 역할 (POS 주문 접수만 가능) */
const POS_ORDER_ONLY_ROLES = ["staff", "pos_staff", "pos"]

/** 결산만 역할 (결산만 가능) */
const POS_SETTLEMENT_ONLY_ROLES = ["settlement", "pos_settlement"]

/** 주문만 역할인지 */
export function isPosOrderOnlyRole(role: string): boolean {
  const r = String(role || "").toLowerCase().trim()
  return POS_ORDER_ONLY_ROLES.some((x) => r === x || r.includes(x))
}

/** 결산만 역할인지 */
export function isPosSettlementOnlyRole(role: string): boolean {
  const r = String(role || "").toLowerCase().trim()
  return POS_SETTLEMENT_ONLY_ROLES.some((x) => r === x || r.includes(x))
}

/** POS 주문 접수 가능 */
export function canAccessPosOrder(role: string): boolean {
  return (
    isPosOrderOnlyRole(role) ||
    isPosSettlementOnlyRole(role) ||
    isManagerRole(role) ||
    isOfficeRole(role)
  )
}

/** POS 결산 가능 */
export function canAccessPosSettlement(role: string): boolean {
  return isPosSettlementOnlyRole(role) || isManagerRole(role) || isOfficeRole(role)
}

/** POS 주문 내역 가능 (관리자) */
export function canAccessPosOrders(role: string): boolean {
  return isManagerRole(role) || isOfficeRole(role)
}

/** POS 테이블 배치 가능 (관리자) */
export function canAccessPosTables(role: string): boolean {
  return isManagerRole(role) || isOfficeRole(role)
}

/** POS 메뉴 관리 가능 (관리자) */
export function canAccessPosMenus(role: string): boolean {
  return isManagerRole(role) || isOfficeRole(role)
}

/** POS 직원(주문만/결산만)이 해당 경로 접근 가능한지 */
export function canPosStaffAccessPath(pathname: string, role: string): boolean {
  const p = String(pathname || "").trim()
  if (!isPosOrderOnlyRole(role) && !isPosSettlementOnlyRole(role)) return true
  if (p === "/pos") return canAccessPosOrder(role)
  if (p === "/admin/pos-settlement" || p.startsWith("/admin/pos-settlement"))
    return canAccessPosSettlement(role)
  if (p === "/admin/pos-orders" || p.startsWith("/admin/pos-orders"))
    return canAccessPosOrders(role)
  if (p === "/admin/pos-tables" || p.startsWith("/admin/pos-tables"))
    return canAccessPosTables(role)
  if (p === "/admin/pos-menus" || p.startsWith("/admin/pos-menus"))
    return canAccessPosMenus(role)
  if (p === "/admin" || p === "/admin/") return true
  return false
}
