/**
 * Omni SaaS: CRM members 를 JWT/매장 tenant_id 로 격리.
 * 충만 레거시 DB: 필터 생략.
 */
import { isLegacyChoongmanErpSupabase } from '@/lib/erp-legacy-supabase'
import { deriveTenantIdFromCompany, normalizeTenantId } from '@/lib/tenant-context'
import { appendTenantFilter, buildTenantFilter } from '@/lib/supabase-server'
import { resolveTenantIdForStoreCode } from '@/lib/tenant-integration-resolve'

export type MembersTenantScope = {
  enforce: boolean
  tenantId: string
}

let membersTenantIdColumnMissing = false

export function isMembersTenantIdColumnMissing(): boolean {
  return membersTenantIdColumnMissing
}

export function markMembersTenantIdColumnMissing(): void {
  membersTenantIdColumnMissing = true
}

export function isMissingMembersTenantIdColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '')
  return /42703|PGRST204|tenant_id.*does not exist|column.*tenant_id/i.test(msg)
}

export async function resolveMembersTenantScope(params: {
  auth?: { tenantId?: string; company?: string } | null
  storeCode?: string | null
}): Promise<MembersTenantScope> {
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

export function isMembersTenantQueryBlocked(scope: MembersTenantScope): boolean {
  return scope.enforce && (!scope.tenantId || membersTenantIdColumnMissing)
}

export function appendMembersTenantFilter(baseFilter: string, scope: MembersTenantScope): string {
  if (!scope.enforce || !scope.tenantId || membersTenantIdColumnMissing) return baseFilter
  return appendTenantFilter(baseFilter, { tenantId: scope.tenantId })
}

export function buildMembersTenantFilter(scope: MembersTenantScope): string {
  if (!scope.enforce || !scope.tenantId || membersTenantIdColumnMissing) return ''
  return buildTenantFilter({ tenantId: scope.tenantId })
}

export function stampMembersTenantId<T extends Record<string, unknown>>(
  row: T,
  scope: MembersTenantScope
): T {
  if (!scope.enforce || !scope.tenantId || membersTenantIdColumnMissing) return row
  if (row.tenant_id != null && String(row.tenant_id).trim() !== '') return row
  return { ...row, tenant_id: scope.tenantId }
}

export function assertMembersTenantWritable(scope: MembersTenantScope): string | null {
  if (!scope.enforce) return null
  if (!scope.tenantId) {
    return '회사(테넌트) 정보가 없어 회원을 저장할 수 없습니다. 다시 로그인해 주세요.'
  }
  if (membersTenantIdColumnMissing) {
    return '회원 tenant_id 스키마가 없습니다. Omni DB에 sql/members_tenant_id.sql 을 실행해 주세요.'
  }
  return null
}

export function rowBelongsToMembersTenant(
  row: { tenant_id?: string | null } | null | undefined,
  scope: MembersTenantScope
): boolean {
  if (!scope.enforce) return true
  if (!scope.tenantId) return false
  if (membersTenantIdColumnMissing) return false
  return normalizeTenantId(row?.tenant_id) === scope.tenantId
}

export const LEGACY_MEMBERS_TENANT_SCOPE: MembersTenantScope = { enforce: false, tenantId: '' }
