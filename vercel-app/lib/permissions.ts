/**
 * 권한 관리 유틸리티
 *
 * 역할 구분:
 * - Director급: director, secretary, ceo, hr → 전체 권한, Office 검색 가능
 * - Secretary: secretary → Director급과 동일 권한
 * - Officer: officer → Office 제외한 전체 권한 (급여/직원 관리)
 * - Manager: manager → 매장 매니저, 자기 매장 한정
 *   (Omni/omnifoodtech만: ERP에서는 Officer와 동일. SaaS 본사 콘솔은 제외)
 * - Franchisee: franchisee → 매장 소유자, 기본은 매니저와 동일(자기 매장). 시스템 설정+extra_stores로 복수 매장 허용 시 JWT·ERP 매장 전환
 *
 * store=Office → Officer로 인식 (employees.store가 본사/Office/오피스/본점이면)
 */

import { getAppBrandConfigFromEnv, normalizeBrandKey, type AppBrandKey } from '@/lib/app-brand'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

export type PermissionBrandKey = AppBrandKey | string | null | undefined

function resolvePermissionBrandKey(brandKey?: PermissionBrandKey): AppBrandKey {
  const raw = brandKey == null ? "" : String(brandKey).trim()
  if (raw) return normalizeBrandKey(raw)
  return getAppBrandConfigFromEnv().key
}

/** employees.store가 본사/Office인지 (→ Officer 권한 적용) */
export function isOfficeStore(store: string): boolean {
  const x = String(store || "").trim()
  return (
    x === "본사" ||
    x === "HQ" ||
    x === "Office" ||
    x === "오피스" ||
    x === "본점" ||
    x.toLowerCase() === "hq" ||
    x.toLowerCase().includes("office")
  )
}

export const OFFICE_STORES = ["본사", "HQ", "Office", "오피스", "본점", "CM Office"]

const DIRECTOR_ROLES = ["director", "secretary", "ceo", "hr"]
const OFFICE_ROLES = ["director", "ceo", "hr", "officer", "secretary"]
const SECRETARY_ROLE = "secretary"
const MANAGER_ROLE = "manager"
const FRANCHISEE_ROLE = "franchisee"

/** Director급인지 (전체 권한 + Office 검색) */
export function isDirectorRole(role: string): boolean {
  const r = String(role || "").toLowerCase().trim()
  return DIRECTOR_ROLES.some((x) => r.includes(x))
}

/** JWT·직원 role이 Director/Officer/Secretary 등 실제 본사 역할인지 (Omni Manager 승격 제외) */
export function isNativeOfficeRole(role: string): boolean {
  const r = String(role || "").toLowerCase().trim()
  return OFFICE_ROLES.some((x) => r.includes(x))
}

/**
 * Omni SaaS 고객사 Manager → ERP Officer와 동일.
 * 충만 프랜차이즈 Manager·가맹점주에는 적용하지 않는다.
 */
export function isOmniManagerOfficeEquivalent(role: string, brandKey?: PermissionBrandKey): boolean {
  if (resolvePermissionBrandKey(brandKey) !== "omnifoodtech") return false
  return roleTextMatchesManager(role)
}

/** 본사 권한인지 (Director + Officer + Secretary). Omni Manager는 Officer로 취급 */
export function isOfficeRole(role: string, brandKey?: PermissionBrandKey): boolean {
  return isNativeOfficeRole(role) || isOmniManagerOfficeEquivalent(role, brandKey)
}

/** Secretary(본사 실무) 역할인지 */
export function isSecretaryRole(role: string): boolean {
  const r = String(role || "").toLowerCase().trim()
  return r.includes(SECRETARY_ROLE)
}

/** 직원 등록 폼의 role 값이 Officer(로그인 권한)인지 */
export function isEmployeeAuthRoleOfficer(formRole: string): boolean {
  return String(formRole || "").trim().toLowerCase() === "officer"
}

/** 직원 등록 폼의 role 값이 Director(로그인 권한)인지 */
export function isEmployeeAuthRoleDirector(formRole: string): boolean {
  return String(formRole || "").trim().toLowerCase() === "director"
}

/** Supervisor(슈퍼바이저) — 출퇴근 QR 단말 등록 등 제한된 본사 권한 */
export function isSupervisorRole(role: string): boolean {
  const r = String(role || "").trim().toLowerCase()
  return r === "supervisor" || /supervisor|슈퍼바이저/i.test(String(role || ""))
}

/** 직원 등록 폼의 role 값이 Officer / Director(로그인 권한 등급)인지 */
export function isEmployeeAuthRoleOfficerOrDirector(formRole: string): boolean {
  return isEmployeeAuthRoleOfficer(formRole) || isEmployeeAuthRoleDirector(formRole)
}

/** Officer 역할을 새로 지정·변경할 수 있는지 — Director급만(Secretary 포함) */
export function canAssignEmployeeOfficerRole(actorRole: string): boolean {
  return isDirectorRole(actorRole)
}

/** Director 역할을 새로 지정·변경할 수 있는지 — Director급만(Secretary 포함) */
export function canAssignEmployeeDirectorRole(actorRole: string): boolean {
  return isDirectorRole(actorRole)
}

/** @deprecated Officer·Director 모두 — Director급만. Officer만은 `canAssignEmployeeOfficerRole` 사용 */
export function canAssignEmployeeOfficerDirectorRoles(actorRole: string): boolean {
  return canAssignEmployeeDirectorRole(actorRole)
}

/** 직원 role 변경 시 Director 지정·해제가 필요한지 */
export function employeeRoleChangeTouchesDirector(prevRole: string, nextRole: string): boolean {
  const norm = (s: string) => String(s || "").trim().toLowerCase()
  const p = norm(prevRole)
  const n = norm(nextRole)
  if (p === n) return false
  return isEmployeeAuthRoleDirector(p) || isEmployeeAuthRoleDirector(n)
}

/** 직원 role 변경 시 Officer 지정·해제가 필요한지 */
export function employeeRoleChangeTouchesOfficer(prevRole: string, nextRole: string): boolean {
  const norm = (s: string) => String(s || "").trim().toLowerCase()
  const p = norm(prevRole)
  const n = norm(nextRole)
  if (p === n) return false
  return isEmployeeAuthRoleOfficer(p) || isEmployeeAuthRoleOfficer(n)
}

const EMPLOYEE_FORM_ROLES = ["Staff", "Manager", "Franchisee", "Officer", "Director"] as const

/** 직원 폼·DB role 문자열을 폼 옵션 표기(Staff, …)로 통일 */
export function canonicalEmployeeFormRole(r: string): string {
  const lo = String(r || "").trim().toLowerCase()
  const hit = EMPLOYEE_FORM_ROLES.find((x) => x.toLowerCase() === lo)
  return hit || (String(r || "").trim() || "Staff")
}

/**
 * employees.role 컬럼만으로 로그인 권한 등급 결정.
 * Staff 등 미지정이면 null → loginCheck에서 role+job 합산 폴백(예: Staff + job Officer).
 * 권한이 Franchisee인데 직무가 Director여도 director로 올라가지 않게 한다.
 */
export function resolveAuthRoleFromEmployeeRoleColumn(roleRaw: string): string | null {
  const canonical = canonicalEmployeeFormRole(roleRaw)
  const lo = canonical.toLowerCase()
  if (lo === "director") return "director"
  if (lo === "officer") return "officer"
  if (lo === "manager") return "manager"
  if (lo === "franchisee") return "franchisee"
  if (lo !== "staff") return null

  const r = String(roleRaw || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
  if (r.includes("director") || r.includes("ceo") || r.includes("대표")) return "director"
  if (r === "hr" || r.includes("인사") || /\bhr\b/.test(r)) return "hr"
  if (r.includes("secretary") || r.includes("비서")) return "secretary"
  if (r.includes("supervisor") || r.includes("슈퍼바이저")) return "supervisor"
  if (r.includes("officer") || r.includes("총괄") || r.includes("오피스")) return "officer"
  if (r.includes("manager") || r.includes("점장") || r.includes("매니저")) return "manager"
  if (r.includes("franchisee") || r.includes("가맹") || r.includes("점주")) return "franchisee"
  if (r.includes("accounting") || r.includes("회계")) return "accounting"
  return null
}

/** JWT·직원 role에 한글/현지 표기가 섞여도 매장 관리자로 인식 */
function roleTextMatchesManager(role: string): boolean {
  const raw = String(role || "").trim()
  const lo = raw.toLowerCase()
  if (lo.includes(MANAGER_ROLE)) return true
  return /매니저|점장|지점장|店長|store\s*manager/i.test(raw)
}

/** JWT·직원 role에 한글/현지 표기가 섞여도 가맹점주로 인식 */
function roleTextMatchesFranchisee(role: string): boolean {
  const raw = String(role || "").trim()
  const lo = raw.toLowerCase()
  if (lo.includes(FRANCHISEE_ROLE)) return true
  return /가맹|프랜차이즈|점주|franchise/i.test(raw)
}

/** 매장 매니저인지. Omni에서는 Officer로 승격되므로 false */
export function isManagerRole(role: string, brandKey?: PermissionBrandKey): boolean {
  if (isOmniManagerOfficeEquivalent(role, brandKey)) return false
  return roleTextMatchesManager(role)
}

/** 가맹점주인지 */
export function isFranchiseeRole(role: string): boolean {
  return roleTextMatchesFranchisee(role)
}

/** 모바일 「매출 통합(/store-sales)」 — 로그인한 모든 직원 허용 */
export function canViewMobileStoreSales(role: string): boolean {
  void role
  return true
}

/** 매장 관리자급인지 (매니저 또는 가맹점주). Omni Manager는 Officer이므로 false */
export function isManagerOrFranchiseeRole(role: string, brandKey?: PermissionBrandKey): boolean {
  return isManagerRole(role, brandKey) || isFranchiseeRole(role)
}

/** 회계 권한인지 (미수금·미지급금에서 매장별 선택 관리 가능) */
export function isAccountingRole(role: string): boolean {
  const r = String(role || "").toLowerCase().trim()
  return r.includes("accounting") || r.includes("회계")
}

/**
 * 본사(오피스) 직원 권한 — role(디렉터·오피서·회계 등) 또는 store 소속(Office/본사/CM Office).
 * 오피스 소속 슈퍼바이저·기타 직무도 전 매장·본사 데이터 접근에 동일 적용.
 */
export function hasOfficeStaffScope(role: string, store?: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role) || isOfficeStore(String(store || ""))
}

/** 미수금·미지급금에서 전체 매장 선택 가능 (본사 + 회계직원) */
export function canManageReceivablePayableAllStores(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role)
}

/** 통장 계좌 삭제·감사 로그 조회 (본사 + 회계직원) */
export function canDeleteBankAccount(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role)
}

export function canViewBankAccountAuditLogs(role: string): boolean {
  return canDeleteBankAccount(role)
}

/** 매출 관리·전체 매출에서 API 전체 매장 목록·다중 매장 필터 (본사·회계·본사 소속) */
export function canSelectAllStoresForPosSalesManagement(role: string, store: string): boolean {
  return hasOfficeStaffScope(role, store)
}

/** 물류(창고/배송) 담당 역할인지 — 미수금 동기화·품목 발주 일시중지 등 */
export function isLogisticsStaffRole(role: string): boolean {
  const r = String(role || "").toLowerCase().trim()
  return r.includes("logistic") || r.includes("물류")
}

/** 물류 전용 운영 대시보드(미승인 주문·입출고) — logistic 역할이면 본사 Office 소속이어도 운영 화면 */
export function prefersLogisticsOperationsDashboard(role: string): boolean {
  return isLogisticsStaffRole(role)
}

/** 품목 `order_disabled`(매장 발주 일시중지) 토글 — 본사(Office) 또는 물류 */
export function canToggleItemOrderDisabled(role: string): boolean {
  return isOfficeRole(role) || isLogisticsStaffRole(role)
}

/** 주문 미수금을 출고(본사 정산) 규칙에 맞게 재동기화 (직접정산·지두방 반영) */
export function canSyncOrderReceivable(role: string): boolean {
  if (canManageReceivablePayableAllStores(role)) return true
  return isLogisticsStaffRole(role)
}

/** Order 미수금 일괄 재동기화 (본사·회계만) */
export function canBulkReconcileOrderReceivables(role: string): boolean {
  return canManageReceivablePayableAllStores(role)
}

/** 매장 수령 시 생성된 store_purchase 분개 조회·삭제 (출고 IV 삭제 선행 작업) */
export function canDeleteStorePurchaseJournal(role: string): boolean {
  return canManageReceivablePayableAllStores(role)
}

/** 출고(주문/강제) 소프트 삭제 */
export function canDeleteOutbound(role: string): boolean {
  return isOfficeRole(role)
}

/** 미수금 화면에서 수동 수령·기초이월(receivable_transactions Receive/Opening) 수정·삭제 */
export function canMutateManualReceivableBalance(
  role: string,
  userStore: string,
  rowStoreName: string
): boolean {
  if (canManageReceivablePayableAllStores(role)) return true
  const r = String(role || "").toLowerCase().trim()
  const storeScoped =
    (r.includes(MANAGER_ROLE) || r.includes(FRANCHISEE_ROLE)) &&
    !canManageReceivablePayableAllStores(role)
  if (!storeScoped) return false
  const us = String(userStore || "").trim()
  const sn = String(rowStoreName || "").trim()
  return Boolean(us && sn && storesMatchForGradeLookup(us, sn))
}

/** 미지급금 화면에서 수동 지급·기초이월(payable_transactions Payment/Opening) 수정·삭제 — 본사·회계만 */
export function canMutateManualPayableBalance(role: string): boolean {
  return canManageReceivablePayableAllStores(role)
}

/** 미수금 목록에서 주문·강제출고 건 수금 확인(receive_checked) 수정 가능 */
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

/** 관리자 페이지 접근 가능 (본사 + 슈퍼바이저 + 매니저 + 가맹점주 + 회계직원 + 물류 + POS 직원) */
export function canAccessAdmin(role: string): boolean {
  return (
    isOfficeRole(role) ||
    isSupervisorRole(role) ||
    isManagerRole(role) ||
    isFranchiseeRole(role) ||
    isAccountingRole(role) ||
    isLogisticsStaffRole(role) ||
    isPosOrderOnlyRole(role) ||
    isPosSettlementOnlyRole(role)
  )
}

/** SaaS 관리자 역할(본사·회계). Omni 매장 Manager 승격은 제외. 대리점은 saas_partner_users 연동으로 별도 허용 — {@link canAccessSaasControlPlane} */
export function canAccessSaasAdmin(role: string): boolean {
  return isNativeOfficeRole(role) || isAccountingRole(role)
}

/** AI 센터 접근 가능 (관리자 계열 + 회계, POS 전용 역할 제외) */
export function canAccessAiCenter(role: string): boolean {
  return (
    isOfficeRole(role) ||
    isManagerRole(role) ||
    isFranchiseeRole(role) ||
    isAccountingRole(role)
  )
}

/** AI 제안 실행 승인 가능 (매장 관리자 이상 + 본사/회계) */
export function canApproveAiActions(role: string): boolean {
  return isOfficeRole(role) || isManagerRole(role) || isAccountingRole(role)
}

/** 설정 페이지 접근 가능 (Director, Officer, Omni Manager=Officer) */
export function canAccessSettings(role: string, brandKey?: PermissionBrandKey): boolean {
  return isOfficeRole(role, brandKey)
}

/** 해당 경로에 매니저 접근 불가 여부 */
const MANAGER_DENIED_PATHS = [
  "/admin/items",
  "/admin/vendors",
  "/admin/settings",
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
    isOfficeRole(role) ||
    isSupervisorRole(role)
  )
}

/** POS 결산 가능 */
export function canAccessPosSettlement(role: string): boolean {
  return (
    isPosOrderOnlyRole(role) ||
    isPosSettlementOnlyRole(role) ||
    isManagerRole(role) ||
    isFranchiseeRole(role) ||
    isOfficeRole(role)
  )
}

/**
 * 결산 화면에서 주문·LinkPOS로 채워진 QR/배달앱/기타(AUTO) 상세 금액을 수동으로 바꿀 수 있는지.
 * 매장 직원이 숫자만 맞추는 식의 조작을 막기 위해 기본은 본사(Office)·회계만 허용.
 * 카드 브랜드별 입력(EDC 대사)은 별도 정책으로 계속 매장에서 편집 가능.
 */
export function canOverridePosSettlementAutoPaymentBreakdown(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role)
}

/**
 * POS 홈에서 관리자(/admin)로 이동하는 버튼 표시 — 본사(디렉터/오피스/CEO/HR) 및 매장 매니저만.
 * 가맹점주·POS·회계·일반 staff 등은 숨김.
 */
export function canNavigateFromPosToAdmin(role: string): boolean {
  return isOfficeRole(role) || isSupervisorRole(role) || isManagerRole(role)
}

/** POS 근태 화면에서 승인·스케줄 수정 등 편집 가능 (일반 staff / POS 전용 역할은 조회만) */
export function canEditPosAttendanceManagement(role: string, store?: string): boolean {
  return hasOfficeStaffScope(role, store) || isManagerRole(role) || isFranchiseeRole(role)
}

/** 출퇴근 QR 키오스크 단말 등록·해제 — Director·Supervisor·매장 Manager */
export function canRegisterAttendanceQrDevice(role: string): boolean {
  return isEmployeeAuthRoleDirector(role) || isSupervisorRole(role) || isManagerRole(role)
}

/** 출퇴근 QR 단말 목록 조회·revoke (프린터 설정 화면) */
export function canManageAttendanceQrDevices(role: string): boolean {
  return canRegisterAttendanceQrDevice(role)
}

/** POS 설정 → 단말 (메인/주문 지정·접속 기기) — 본사·슈퍼바이저·매장 관리자 */
export function canAccessPosTerminalSettings(role: string): boolean {
  return (
    isOfficeRole(role) ||
    isSupervisorRole(role) ||
    isManagerRole(role) ||
    isFranchiseeRole(role)
  )
}

/**
 * POS 단말 대수(메인/주문 슬롯)·현장 역할 잠금 ON/OFF
 * — 본사·SV·매장 매니저·가맹점주 (`/admin/pos-screen-config` → 단말 과 동일)
 */
export function canEditPosDeviceRoleLimits(role: string): boolean {
  return canAccessPosTerminalSettings(role)
}

/** 매장 매니저·가맹점주는 자기 매장만, 본사·순회 SV는 매장 선택 후 변경 가능 */
export function canEditPosDeviceRoleLimitsForStore(
  role: string,
  authStore: string,
  targetStoreCode: string
): boolean {
  if (!canEditPosDeviceRoleLimits(role)) return false
  const target = String(targetStoreCode || "").trim()
  if (!target) return false
  if (canPickPosTerminalStore(role, authStore)) return true
  return storesMatchForGradeLookup(String(authStore || "").trim(), target)
}

/** 단말 설정 화면에서 매장 선택 (순회 SV·본사·오피스 소속) */
export function canPickPosTerminalStore(role: string, authStore?: string): boolean {
  if (hasOfficeStaffScope(role, authStore) || isSupervisorRole(role)) return true
  return canPickAttendanceQrStoreFilter(role, authStore)
}

/** 본사 화면에서 매장별 QR 단말 목록·등록 시 매장 선택 */
export function canPickAttendanceQrStoreFilter(role: string, authStore?: string): boolean {
  if (!canRegisterAttendanceQrDevice(role)) return false
  return isOfficeStore(String(authStore || ""))
}

/** 업무일지 검토·승인·첨언·보류·반려·삭제 (매장 매니저·가맹점주는 조회만) */
export function canReviewWorkLog(role: string): boolean {
  return (
    isOfficeRole(role) ||
    isAccountingRole(role) ||
    isSupervisorRole(role) ||
    isDirectorRole(role)
  )
}

/** 업무 검토 탭 노출 (본사·순회 SV·회계 + 매장 매니저·가맹점주 조회) */
export function canViewWorkLogApprovalTab(role: string): boolean {
  return (
    canReviewWorkLog(role) ||
    isManagerRole(role) ||
    isFranchiseeRole(role)
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

/** POS 프린터 설정 가능 (매장 관리자·가맹점주·본사·순회 SV·오피스 소속) */
export function canAccessPosPrinters(role: string, store?: string): boolean {
  return (
    isManagerRole(role) ||
    isFranchiseeRole(role) ||
    hasOfficeStaffScope(role, store) ||
    isSupervisorRole(role)
  )
}

/**
 * POS 프린터 설정 조회 — 터미널·듀얼 모니터에서 로드용.
 * (프린터 전체 편집은 `canAccessPosPrinters`, 주문/결산 직원은 조회만)
 */
export function canReadPosPrinterSettings(role: string, store?: string): boolean {
  return canAccessPosPrinters(role, store) || canAccessPosOrder(role) || canAccessPosSettlement(role)
}

/**
 * 고객 화면·듀얼 모니터 관련 컬럼만 저장 가능한지 (POS 주문/결산 직원 포함)
 */
export function canSavePosCustomerDisplayFields(role: string): boolean {
  return canReadPosPrinterSettings(role)
}

/** POS 쿠폰 관리 가능 (관리자) */
export function canAccessPosCoupons(role: string): boolean {
  return isManagerRole(role) || isFranchiseeRole(role) || isOfficeRole(role)
}

/** 원가 분석 조회 (본사 + 매장 매니저 + 가맹점주) */
export function canAccessPosCostAnalysis(role: string): boolean {
  return isOfficeRole(role) || isManagerOrFranchiseeRole(role)
}

/** 원가 분석 BOM·설정·배합 수정 (본사 오피스만) */
export function canEditPosCostAnalysis(role: string): boolean {
  return isOfficeRole(role)
}

/**
 * 회원앱 운영(/admin/crm/member-app) 편집 — 본사·회계·매장 관리자.
 * 본사 매장(Office/오피스 등) 소속이면 role 문자열과 무관하게 편집 허용.
 */
export function canEditMemberPortalAdmin(role: string, store?: string): boolean {
  return (
    isOfficeRole(role) ||
    isAccountingRole(role) ||
    isManagerOrFranchiseeRole(role) ||
    isOfficeStore(String(store || ""))
  )
}

/** KBank QR Void (은행 무효) — 매니저·가맹점주·본사·회계. POS 캐셔만으로는 불가. */
export function canVoidKbankQrPayment(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role) || isManagerOrFranchiseeRole(role)
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
    return canAccessPosTerminalSettings(role) || canAccessPosTables(role) || canAccessPosMenus(role)
  if (p === "/admin/pos-cost-analysis" || p.startsWith("/admin/pos-cost-analysis"))
    return canAccessPosCostAnalysis(role)
  if (p === "/admin/pos-printers" || p.startsWith("/admin/pos-printers"))
    return canAccessPosPrinters(role)
  if (p === "/admin/pos-qr-table-order" || p.startsWith("/admin/pos-qr-table-order"))
    return canAccessPosPrinters(role) || canAccessPosMenus(role)
  if (p === "/admin/pos-coupons" || p.startsWith("/admin/pos-coupons"))
    return canAccessPosCoupons(role)
  if (p === "/admin/pos-tax-invoice-recipients" || p.startsWith("/admin/pos-tax-invoice-recipients"))
    return canAccessPosOrders(role)
  if (p === "/admin" || p === "/admin/") return true
  return false
}
