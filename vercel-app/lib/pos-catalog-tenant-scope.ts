/**
 * Omni SaaS: POS 메뉴·옵션·프로모 카탈로그를 JWT/매장 tenant_id 로 격리.
 * 충만 레거시 DB: 필터 생략(단일 회사 DB).
 */
import { isLegacyChoongmanErpSupabase } from '@/lib/erp-legacy-supabase'
import { deriveTenantIdFromCompany, normalizeTenantId } from '@/lib/tenant-context'
import { appendTenantFilter, buildTenantFilter } from '@/lib/supabase-server'
import { resolveTenantIdForStoreCode } from '@/lib/tenant-integration-resolve'

export type PosCatalogTenantScope = {
  /** true 이면 조회·저장에 tenant_id 를 강제한다 (Omni). */
  enforce: boolean
  tenantId: string
}

const POS_MENU_CATEGORIES_KEY = 'pos_menu_categories'

let posMenusTenantIdColumnMissing = false

export function isPosMenusTenantIdColumnMissing(): boolean {
  return posMenusTenantIdColumnMissing
}

export function markPosMenusTenantIdColumnMissing(): void {
  posMenusTenantIdColumnMissing = true
}

export function isMissingTenantIdColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '')
  return /42703|PGRST204|tenant_id.*does not exist|column.*tenant_id/i.test(msg)
}

/**
 * Omni + tenant 알 수 있음 → enforce.
 * Omni + tenant 없음 → enforce + 빈 tenantId (조회 0건·쓰기 거부 — 타사 유출 방지).
 * 충만 레거시 → enforce false.
 */
export async function resolvePosCatalogTenantScope(params: {
  auth?: { tenantId?: string; company?: string } | null
  storeCode?: string | null
}): Promise<PosCatalogTenantScope> {
  if (isLegacyChoongmanErpSupabase()) {
    return { enforce: false, tenantId: '' }
  }

  let tenantId =
    normalizeTenantId(params.auth?.tenantId) ||
    deriveTenantIdFromCompany(params.auth?.company) ||
    ''

  if (!tenantId) {
    const storeCode = String(params.storeCode || '').trim()
    if (storeCode) {
      tenantId = normalizeTenantId((await resolveTenantIdForStoreCode(storeCode)) || '') || ''
    }
  }

  return { enforce: true, tenantId }
}

/**
 * Omni 인데 tenant 없거나 tenant_id 컬럼 미배포 → 절대 전량 조회하지 말고 빈 결과/거부.
 * (컬럼 없을 때 필터를 빼면 타사 메뉴가 다시 노출됨)
 */
export function isPosCatalogTenantQueryBlocked(scope: PosCatalogTenantScope): boolean {
  return scope.enforce && (!scope.tenantId || posMenusTenantIdColumnMissing)
}

export function appendPosCatalogTenantFilter(
  baseFilter: string,
  scope: PosCatalogTenantScope
): string {
  if (!scope.enforce || !scope.tenantId || posMenusTenantIdColumnMissing) return baseFilter
  return appendTenantFilter(baseFilter, { tenantId: scope.tenantId })
}

export function buildPosCatalogTenantFilter(scope: PosCatalogTenantScope): string {
  if (!scope.enforce || !scope.tenantId || posMenusTenantIdColumnMissing) return ''
  return buildTenantFilter({ tenantId: scope.tenantId })
}

/** insert/update 행에 tenant_id stamp. enforce 아니면 그대로. */
export function stampPosCatalogTenantId<T extends Record<string, unknown>>(
  row: T,
  scope: PosCatalogTenantScope
): T {
  if (!scope.enforce || !scope.tenantId || posMenusTenantIdColumnMissing) return row
  if (row.tenant_id != null && String(row.tenant_id).trim() !== '') return row
  return { ...row, tenant_id: scope.tenantId }
}

export function assertPosCatalogTenantWritable(scope: PosCatalogTenantScope): string | null {
  if (!scope.enforce) return null
  if (!scope.tenantId) {
    return '회사(테넌트) 정보가 없어 메뉴를 저장할 수 없습니다. 다시 로그인해 주세요.'
  }
  if (posMenusTenantIdColumnMissing) {
    return '메뉴 tenant_id 스키마가 없습니다. Omni DB에 sql/pos_catalog_tenant_id.sql 을 실행해 주세요.'
  }
  return null
}

/** 행이 요청 테넌트 소유인지 (enforce 시에만 검사). */
export function rowBelongsToPosCatalogTenant(
  row: { tenant_id?: string | null } | null | undefined,
  scope: PosCatalogTenantScope
): boolean {
  if (!scope.enforce) return true
  if (!scope.tenantId) return false
  if (posMenusTenantIdColumnMissing) return false
  return normalizeTenantId(row?.tenant_id) === scope.tenantId
}

export function posMenuCategoriesSettingsKey(scope: PosCatalogTenantScope): string {
  if (!scope.enforce || !scope.tenantId) return POS_MENU_CATEGORIES_KEY
  return `${POS_MENU_CATEGORIES_KEY}:${scope.tenantId}`
}

export { POS_MENU_CATEGORIES_KEY }
