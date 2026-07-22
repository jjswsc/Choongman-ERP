/**
 * Omni SaaS 공통 데이터 테넌트 스코프.
 * 충만 레거시 DB: enforce=false. Omni: JWT/매장으로 tenantId 강제.
 */
import { isLegacyChoongmanErpSupabase } from '@/lib/erp-legacy-supabase'
import { deriveTenantIdFromCompany, normalizeTenantId } from '@/lib/tenant-context'
import { appendTenantFilter, buildTenantFilter } from '@/lib/supabase-server'
import { resolveTenantIdForStoreCode } from '@/lib/tenant-integration-resolve'

export type SaasTenantScope = {
  enforce: boolean
  tenantId: string
}

const missingColumns = new Set<string>()

export function markSaasTenantColumnMissing(tableHint = 'default'): void {
  missingColumns.add(tableHint)
}

export function isSaasTenantColumnMissing(tableHint = 'default'): boolean {
  return missingColumns.has(tableHint) || missingColumns.has('default')
}

export function isMissingSaasTenantColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '')
  return /42703|PGRST204|tenant_id.*does not exist|column.*tenant_id/i.test(msg)
}

export async function resolveSaasTenantScope(params: {
  auth?: { tenantId?: string; company?: string } | null
  storeCode?: string | null
}): Promise<SaasTenantScope> {
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

export function isSaasTenantQueryBlocked(
  scope: SaasTenantScope,
  tableHint = 'default'
): boolean {
  return scope.enforce && (!scope.tenantId || isSaasTenantColumnMissing(tableHint))
}

export function appendSaasTenantFilter(
  baseFilter: string,
  scope: SaasTenantScope,
  tableHint = 'default'
): string {
  if (!scope.enforce || !scope.tenantId || isSaasTenantColumnMissing(tableHint)) return baseFilter
  return appendTenantFilter(baseFilter, { tenantId: scope.tenantId })
}

export function buildSaasTenantFilter(scope: SaasTenantScope, tableHint = 'default'): string {
  if (!scope.enforce || !scope.tenantId || isSaasTenantColumnMissing(tableHint)) return ''
  return buildTenantFilter({ tenantId: scope.tenantId })
}

export function stampSaasTenantId<T extends Record<string, unknown>>(
  row: T,
  scope: SaasTenantScope,
  tableHint = 'default'
): T {
  if (!scope.enforce || !scope.tenantId || isSaasTenantColumnMissing(tableHint)) return row
  if (row.tenant_id != null && String(row.tenant_id).trim() !== '') return row
  return { ...row, tenant_id: scope.tenantId }
}

/**
 * 결산·마감 등 (tenant_id, store_code, …) unique 테이블용.
 * Omni: 실제 tenantId. 충만/미enforce: '' (SQL DEFAULT와 맞춤).
 */
export function stampSaasTenantIdForUniqueKey<T extends Record<string, unknown>>(
  row: T,
  scope: SaasTenantScope
): T & { tenant_id: string } {
  const tid = scope.enforce && scope.tenantId ? scope.tenantId : ''
  return { ...row, tenant_id: tid }
}

/** PostgREST onConflict — W0 SQL 적용 후 tenant_id 포함 */
export function saasTenantStoreConflictTarget(
  scope: SaasTenantScope,
  restColumns: string
): string {
  void scope
  return `tenant_id,${restColumns}`
}

export function assertSaasTenantWritable(
  scope: SaasTenantScope,
  opts?: { tableHint?: string; label?: string }
): string | null {
  if (!scope.enforce) return null
  const label = opts?.label || '데이터'
  if (!scope.tenantId) {
    return `회사(테넌트) 정보가 없어 ${label}를 저장할 수 없습니다. 다시 로그인해 주세요.`
  }
  if (isSaasTenantColumnMissing(opts?.tableHint || 'default')) {
    return `${label} tenant_id 스키마가 없습니다. Omni DB 마이그레이션 SQL을 실행해 주세요.`
  }
  return null
}

/**
 * JWT tenantId 와 매장 마스터 tenantId 가 둘 다 있을 때만 교차 접근을 차단.
 * 한쪽만 있으면(레거시·미매핑) 통과.
 */
export function authTenantMatchesStoreTenant(
  authTenantId: string | null | undefined,
  storeTenantId: string | null | undefined
): boolean {
  const a = normalizeTenantId(authTenantId)
  const s = normalizeTenantId(storeTenantId)
  if (!a || !s) return true
  return a === s
}

/** store_code → tenant 조회 후 JWT와 불일치면 `tenant_mismatch` */
export async function assertAuthTenantMatchesStore(
  auth: { tenantId?: string } | null | undefined,
  storeCode: string
): Promise<'ok' | 'tenant_mismatch'> {
  const authTenantId = normalizeTenantId(auth?.tenantId)
  if (!authTenantId) return 'ok'
  const store = String(storeCode || '').trim()
  if (!store) return 'ok'
  const fromStore = normalizeTenantId((await resolveTenantIdForStoreCode(store).catch(() => '')) || '')
  if (!authTenantMatchesStoreTenant(authTenantId, fromStore)) return 'tenant_mismatch'
  return 'ok'
}

export const LEGACY_SAAS_TENANT_SCOPE: SaasTenantScope = { enforce: false, tenantId: '' }
