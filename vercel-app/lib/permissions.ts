/**
 * 권한 관리 유틸리티
 *
 * 역할 구분:
 * - Director급: director, ceo, hr → 전체 권한, Office 검색 가능
 * - Officer: officer → Office 제외한 전체 권한 (급여/직원 관리)
 * - Manager: manager → 매장 매니저, 자기 매장 한정
 * - Franchisee: franchisee → 매장 소유자, 기본은 매니저와 동일(자기 매장). 시스템 설정+extra_stores로 복수 매장 허용 시 JWT·ERP 매장 전환
 *
 * store=Office → Officer로 인식 (employees.store가 본사/Office/오피스/본점이면)
 */

/** employees.store가 본사/Office인지 (→ Officer 권한 적용) */
export function isOfficeStore(store: string): boolean {
  const x = String(store || "").trim()
  return (
    x === "본사" ||
    x === "Office" ||
    x === "오피스" ||
    x === "본점" ||
    x.toLowerCase().includes("office")
  )
}

export const OFFICE_STORES = ["본사", "Office", "오피스", "본점", "CM Office"]

const DIRECTOR_ROLES = ["director", "ceo", "hr"]
const OFFICE_ROLES = ["director", "ceo", "hr", "officer"]
const MANAGER_ROLE = "manager"
const FRANCHISEE_ROLE = "franchisee"

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

/** 가맹점주인지 */
export function isFranchiseeRole(role: string): boolean {
  const r = String(role || "").toLowerCase().trim()
  return r.includes(FRANCHISEE_ROLE)
}

/** 매장 관리자급인지 (매니저 또는 가맹점주) */
export function isManagerOrFranchiseeRole(role: string): boolean {
  return isManagerRole(role) || isFranchiseeRole(role)
}

/** 회계 권한인지 (미수금·미지급금에서 매장별 선택 관리 가능) */
export function isAccountingRole(role: string): boolean {
  const r = String(role || "").toLowerCase().trim()
  return r.includes("accounting") || r.includes("회계")
}

/** 미수금·미지급금에서 전체 매장 선택 가능 (본사 + 회계직원) */
export function canManageReceivablePayableAllStores(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role)
}

/** 주문 미수금을 출고(본사 정산) 규칙에 맞게 재동기화 (직접정산·지두방 반영) */
export function canSyncOrderReceivable(role: string): boolean {
  if (canManageReceivablePayableAllStores(role)) return true
  const r = String(role || "").toLowerCase().trim()
  return r.includes("logistic") || r.includes("물류")
}

/** Order 미수금 일괄 재동기화 (본사·회계만) */
export function canBulkReconcileOrderReceivables(role: string): boolean {
  return canManageReceivablePayableAllStores(role)
}

/** 미수금 목록에서 주문 건 수금 확인(receive_checked) 수정 가능 */
export function canUpdateReceivableReceiveCheck(
  role: string,
  userStore: string,
  rowStoreName: string
): boolean {
  if (canManageReceivablePayableAllStores(role)) return true
  const r = String(role || "").toLowerCase().trim()
  const restricted =
    (r.includes(MANAGER_ROLE) || r.includes(FRANCHISEE_ROLE)) &&
    !canManageReceivablePayableAllStores(role)
  if (!restricted) return false
  const us = String(userStore || "").trim()
  const sn = String(rowStoreName || "").trim()
  return Boolean(us && sn && us === sn)
}

/** 관리자 페이지 접근 가능 (본사 + 매니저 + 가맹점주 + 회계직원 + POS 직원) */
export function canAccessAdmin(role: string): boolean {
  return (
    isOfficeRole(role) ||
    isManagerRole(role) ||
    isFranchiseeRole(role) ||
    isAccountingRole(role) ||
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
  "/admin/pos-cost-analysis",
]

/** 매니저·가맹점주가 해당 경로에 접근할 수 있는지 */
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
    isFranchiseeRole(role) ||
    isOfficeRole(role)
  )
}

/** POS 결산 가능 */
export function canAccessPosSettlement(role: string): boolean {
  return (
    isPosSettlementOnlyRole(role) ||
    isManagerRole(role) ||
    isFranchiseeRole(role) ||
    isOfficeRole(role)
  )
}

/**
 * POS 홈에서 관리자(/admin)로 이동하는 버튼 표시 — 본사(디렉터/오피스/CEO/HR) 및 매장 매니저만.
 * 가맹점주·POS·회계·일반 staff 등은 숨김.
 */
export function canNavigateFromPosToAdmin(role: string): boolean {
  return isOfficeRole(role) || isManagerRole(role)
}

/** POS 근태 화면에서 승인·스케줄 수정 등 편집 가능 (일반 staff / POS 전용 역할은 조회만) */
export function canEditPosAttendanceManagement(role: string): boolean {
  return (
    isOfficeRole(role) ||
    isManagerRole(role) ||
    isFranchiseeRole(role) ||
    isAccountingRole(role)
  )
}

/** POS 주문 내역 가능 (관리자) */
export function canAccessPosOrders(role: string): boolean {
  return isManagerRole(role) || isFranchiseeRole(role) || isOfficeRole(role)
}

/** POS 테이블 배치 가능 (관리자) */
export function canAccessPosTables(role: string): boolean {
  return isManagerRole(role) || isFranchiseeRole(role) || isOfficeRole(role)
}

/** POS 메뉴 관리 가능 (관리자) */
export function canAccessPosMenus(role: string): boolean {
  return isManagerRole(role) || isFranchiseeRole(role) || isOfficeRole(role)
}

/** POS 프린터 설정 가능 (관리자) */
export function canAccessPosPrinters(role: string): boolean {
  return isManagerRole(role) || isFranchiseeRole(role) || isOfficeRole(role)
}

/** POS 쿠폰 관리 가능 (관리자) */
export function canAccessPosCoupons(role: string): boolean {
  return isManagerRole(role) || isFranchiseeRole(role) || isOfficeRole(role)
}

/** 원가 분석 가능 (오피스 직원만) */
export function canAccessPosCostAnalysis(role: string): boolean {
  return isOfficeRole(role)
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
  if (p === "/admin/pos-screen-config" || p.startsWith("/admin/pos-screen-config"))
    return canAccessPosTables(role) || canAccessPosMenus(role)
  if (p === "/admin/pos-cost-analysis" || p.startsWith("/admin/pos-cost-analysis"))
    return canAccessPosCostAnalysis(role)
  if (p === "/admin/pos-printers" || p.startsWith("/admin/pos-printers"))
    return canAccessPosPrinters(role)
  if (p === "/admin/pos-coupons" || p.startsWith("/admin/pos-coupons"))
    return canAccessPosCoupons(role)
  if (p === "/admin/pos-tax-invoice-recipients" || p.startsWith("/admin/pos-tax-invoice-recipients"))
    return canAccessPosOrders(role)
  if (p === "/admin" || p === "/admin/") return true
  return false
}
