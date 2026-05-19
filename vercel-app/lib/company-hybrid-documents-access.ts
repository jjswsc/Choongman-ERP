import { isFranchiseeRole, isManagerOrFranchiseeRole, isOfficeRole } from '@/lib/permissions'
import { franchiseeQueryStoreAllowed, normalizedAllowedStoresFromJwt } from '@/lib/franchisee-multi-store'
import type { JwtPayload } from '@/lib/jwt-auth'
import { storeMatches } from '@/lib/admin-employee-store-access'
import {
  isCompanyHybridDocCategoryGlobalStore,
  isCompanyHybridDocsListAllStoresParam,
  type CompanyHybridDocVisibility,
} from '@/lib/company-hybrid-documents'

/**
 * 전 매장 문서 목록·열람(조회 로그) 허용 여부.
 * TODO: 문서별·역할별 ACL(예: company_hybrid_documents.view_roles JSON)로 세분화할 것.
 */
export function canListAllStoresCompanyHybridDocs(_jwt: JwtPayload): boolean {
  return true
}

/** 목록/카테고리 조회 범위 — 단일 매장 또는 전체 */
export type CompanyHybridListScope = { kind: 'all' } | { kind: 'single'; store: string }

export function resolveCompanyHybridListScope(
  jwt: JwtPayload,
  storeParam: string
): { ok: true; scope: CompanyHybridListScope } | { ok: false; message: string } {
  if (isCompanyHybridDocsListAllStoresParam(storeParam)) {
    if (!canListAllStoresCompanyHybridDocs(jwt)) {
      return { ok: false, message: '전체 문서 조회 권한이 없습니다.' }
    }
    return { ok: true, scope: { kind: 'all' } }
  }
  const eff = effectiveStoreParamForCompanyDocs(jwt, storeParam)
  if (!eff.ok) return eff
  return { ok: true, scope: { kind: 'single', store: eff.store } }
}

/** 회사 하이브리드 문서 API: 대상 store 행에 접근 가능한지 */
export function canAccessStoreForCompanyHybridDocs(jwt: JwtPayload, targetStore: string): boolean {
  const s = String(targetStore || '').trim()
  if (!s) return false
  if (isCompanyHybridDocCategoryGlobalStore(s)) {
    return (
      isOfficeRole(jwt.role || '') ||
      isManagerOrFranchiseeRole(jwt.role || '') ||
      isFranchiseeRole(jwt.role || '')
    )
  }
  if (isOfficeRole(jwt.role || '')) return true
  if (isFranchiseeRole(jwt.role || '')) {
    return franchiseeQueryStoreAllowed(jwt, s)
  }
  return storeMatches(String(jwt.store || ''), s)
}

/** 문서 visibility 기반 열람 가능 여부 */
export function canViewCompanyHybridDocument(
  jwt: JwtPayload,
  targetStore: string,
  visibility: CompanyHybridDocVisibility
): boolean {
  if (visibility === 'office') {
    return isOfficeRole(jwt.role || '')
  }
  if (visibility === 'store_admin') {
    if (isOfficeRole(jwt.role || '')) return true
    return isManagerOrFranchiseeRole(jwt.role || '') && canAccessStoreForCompanyHybridDocs(jwt, targetStore)
  }
  return canAccessStoreForCompanyHybridDocs(jwt, targetStore)
}

/**
 * 목록/저장용 — 조회·쓰기에 사용할 단일 store (쿼리/바디 store와 JWT 정합)
 */
export function effectiveStoreParamForCompanyDocs(
  jwt: JwtPayload,
  bodyOrQueryStore: string
): { ok: true; store: string } | { ok: false; message: string } {
  const input = String(bodyOrQueryStore || '').trim()
  if (!input) {
    if (isFranchiseeRole(jwt.role || '') && normalizedAllowedStoresFromJwt(jwt).length) {
      return { ok: true, store: normalizedAllowedStoresFromJwt(jwt)[0] }
    }
    if (!isOfficeRole(jwt.role || '')) {
      return { ok: true, store: String(jwt.store || '').trim() }
    }
    return { ok: false, message: '매장(store)을 지정하세요.' }
  }
  if (!canAccessStoreForCompanyHybridDocs(jwt, input)) {
    return { ok: false, message: '이 매장에 대한 권한이 없습니다.' }
  }
  return { ok: true, store: input }
}
