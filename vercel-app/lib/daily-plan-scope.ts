/**
 * 직급별 일정표(daily plan) 권한·목록 스코프 — 서버·테스트 공용 (server-only 금지).
 *
 * - 본사(office): 전 직원
 * - 슈퍼바이저: 매니저·직원(+본인), 다른 SV는 목록에서 제외
 * - 매니저·가맹점주(storeLead): 담당 매장 직원만 (본사·타 매장 제외)
 */
import type { JwtPayload } from '@/lib/jwt-auth'
import {
  hasOfficeStaffScope,
  isFranchiseeRole,
  isManagerRole,
  isOfficeStore,
  isSupervisorRole,
} from '@/lib/permissions'
import { storeOpsStoreInScope, storeOpsStoreNameScopePostgrestFilter } from '@/lib/store-ops-alert-utils'
import type { DailyPlanRole } from '@/lib/daily-plan-generate'

export type DailyPlanScope = {
  /** 본사·회계·오피스·슈퍼바이저 — 전 매장 */
  all: boolean
  office: boolean
  supervisor: boolean
  /** 매니저·가맹점주 — 자기 매장 직원 */
  storeLead: boolean
  stores: string[]
  actorName: string
  actorEmployeeId: number | null
  canEditTemplates: boolean
}

export type DailyPlanTargetLite = {
  role: DailyPlanRole
  store: string
  employeeId: number
}

export type DailyPlanViewLite = {
  employee_id: number
  employee_name: string
  employee_store?: string
  store_name: string
  role_scope?: string
}

function storesFromAuth(auth: JwtPayload): string[] {
  const store = String(auth.store || '').trim()
  return [
    ...new Set(
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(store ? [store] : [])
    ),
  ]
}

export function resolveDailyPlanScope(auth: JwtPayload): DailyPlanScope {
  const role = String(auth.role || '').toLowerCase()
  const store = String(auth.store || '').trim()
  /**
   * 매장 매니저·가맹점주는 담당 매장만 본다.
   * (본사 매장 소속 매니저는 isOfficeStore 로 본사 스코프 유지)
   * role에 manager·supervisor 가 섞여도 storeLead 우선.
   */
  const storeLead = isManagerRole(role) || isFranchiseeRole(role)
  const office =
    storeLead && !isOfficeStore(store) ? false : hasOfficeStaffScope(role, store)
  const supervisor = isSupervisorRole(role) && !storeLead

  let stores = storesFromAuth(auth)
  if (storeLead && !office) {
    if (isFranchiseeRole(role)) {
      stores = stores.filter((s) => !isOfficeStore(s))
    } else {
      /** 매장 매니저: 대표 매장만 (allowedStores·Office·타 매장 노출 방지) */
      stores = store && !isOfficeStore(store) ? [store] : []
    }
  }

  const eid = auth.employeeId != null ? Math.floor(Number(auth.employeeId)) : 0
  return {
    all: office || supervisor,
    office,
    supervisor,
    storeLead,
    stores,
    actorName: String(auth.name || '').trim(),
    actorEmployeeId: Number.isFinite(eid) && eid > 0 ? eid : null,
    canEditTemplates: office || supervisor,
  }
}

export function dailyPlanScopeFilter(scope: DailyPlanScope): string {
  if (scope.all) return ''
  const f = storeOpsStoreNameScopePostgrestFilter(scope.stores)
  return f || 'store_name=eq.__none__'
}

export function isOwnDailyPlan(
  scope: DailyPlanScope,
  plan: Pick<DailyPlanViewLite, 'employee_id' | 'employee_name'>
): boolean {
  if (scope.actorEmployeeId != null && Number(plan.employee_id) === scope.actorEmployeeId) return true
  return !!scope.actorName && String(plan.employee_name || '').trim() === scope.actorName
}

export function canViewDailyPlan(scope: DailyPlanScope, plan: DailyPlanViewLite): boolean {
  if (scope.all || isOwnDailyPlan(scope, plan)) return true
  if (!scope.storeLead) return false
  const empStore = String(plan.employee_store || '').trim()
  const planStore = String(plan.store_name || '').trim()
  if ((empStore && isOfficeStore(empStore)) || (planStore && isOfficeStore(planStore))) return false
  return (
    storeOpsStoreInScope(planStore, scope.stores, false) ||
    storeOpsStoreInScope(empStore, scope.stores, false)
  )
}

/** 본사 → 전 직급, 슈퍼바이저 → 매니저·직원(본인 포함), 매니저 → 자기 매장 직원(+본인) */
export function canAssignDailyPlan(scope: DailyPlanScope, target: DailyPlanTargetLite): boolean {
  if (scope.actorEmployeeId != null && target.employeeId === scope.actorEmployeeId) return true
  if (scope.office) return true
  if (scope.supervisor) return target.role !== 'supervisor'
  if (scope.storeLead) {
    if (isOfficeStore(target.store)) return false
    return target.role === 'staff' && storeOpsStoreInScope(target.store, scope.stores, false)
  }
  return false
}

/** 배정·팀 왼쪽 목록 — canAssign 과 동일 (매니저: 담당 매장 staff + 본인) */
export function canListDailyPlanCandidate(scope: DailyPlanScope, target: DailyPlanTargetLite): boolean {
  if (!target.role) return false
  return canAssignDailyPlan(scope, target)
}
