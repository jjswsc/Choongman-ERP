/**
 * Omni SaaS: 품목·거래처·재고를 JWT/매장 tenant_id 로 격리.
 * 충만 레거시 DB: 필터 생략.
 */
import { isLegacyChoongmanErpSupabase } from '@/lib/erp-legacy-supabase'
import { isMissingTenantIdColumnError } from '@/lib/missing-tenant-id-column-error'
import { deriveTenantIdFromCompany, normalizeTenantId } from '@/lib/tenant-context'
import { appendTenantFilter, buildTenantFilter } from '@/lib/supabase-server'
import { resolveTenantIdForStoreCode } from '@/lib/tenant-integration-resolve'

export type InventoryTenantScope = {
  enforce: boolean
  tenantId: string
}

let inventoryTenantIdColumnMissing = false

export function markInventoryTenantIdColumnMissing(): void {
  inventoryTenantIdColumnMissing = true
}

export function isMissingInventoryTenantIdColumnError(err: unknown): boolean {
  return isMissingTenantIdColumnError(err)
}

export async function resolveInventoryTenantScope(params: {
  auth?: { tenantId?: string; company?: string } | null
  storeCode?: string | null
}): Promise<InventoryTenantScope> {
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

export function isInventoryTenantQueryBlocked(scope: InventoryTenantScope): boolean {
  return scope.enforce && (!scope.tenantId || inventoryTenantIdColumnMissing)
}

export function appendInventoryTenantFilter(baseFilter: string, scope: InventoryTenantScope): string {
  if (!scope.enforce || !scope.tenantId || inventoryTenantIdColumnMissing) return baseFilter
  return appendTenantFilter(baseFilter, { tenantId: scope.tenantId })
}

export function buildInventoryTenantFilter(scope: InventoryTenantScope): string {
  if (!scope.enforce || !scope.tenantId || inventoryTenantIdColumnMissing) return ''
  return buildTenantFilter({ tenantId: scope.tenantId })
}

export function stampInventoryTenantId<T extends Record<string, unknown>>(
  row: T,
  scope: InventoryTenantScope
): T {
  if (!scope.enforce || !scope.tenantId || inventoryTenantIdColumnMissing) return row
  if (row.tenant_id != null && String(row.tenant_id).trim() !== '') return row
  return { ...row, tenant_id: scope.tenantId }
}

export function assertInventoryTenantWritable(scope: InventoryTenantScope): string | null {
  if (!scope.enforce) return null
  if (!scope.tenantId) {
    return '회사(테넌트) 정보가 없어 저장할 수 없습니다. 다시 로그인해 주세요.'
  }
  if (inventoryTenantIdColumnMissing) {
    return 'inventory tenant_id 스키마가 없습니다. Omni DB에 sql/inventory_tenant_id.sql 을 실행해 주세요.'
  }
  return null
}

export const LEGACY_INVENTORY_TENANT_SCOPE: InventoryTenantScope = { enforce: false, tenantId: '' }
