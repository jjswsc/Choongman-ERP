/**
 * W1 HR — Omni에서 직원 CSV 전체 삭제 후 재적재 차단/테넌트 스코프.
 */
import 'server-only'

import {
  assertSaasTenantWritable,
  resolveSaasTenantScope,
  stampSaasTenantId,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'

export async function resolveHrImportTenantScope(auth: {
  tenantId?: string
  company?: string
} | null): Promise<{ scope: SaasTenantScope; error: string | null }> {
  const scope = await resolveSaasTenantScope({ auth })
  const error = assertSaasTenantWritable(scope, {
    tableHint: 'employees',
    label: '직원',
  })
  return { scope, error }
}

export function stampEmployeeRowsForTenant(
  rows: Record<string, unknown>[],
  scope: SaasTenantScope
): Record<string, unknown>[] {
  return rows.map((r) => stampSaasTenantId(r, scope, 'employees'))
}

/** Omni enforce 시 전역 id=gte.0 삭제 금지 — tenant 필터만 허용 */
export function employeesDeleteFilterForImport(scope: SaasTenantScope): string | null {
  if (!scope.enforce) return 'id=gte.0'
  if (!scope.tenantId) return null
  return `tenant_id=eq.${encodeURIComponent(scope.tenantId)}`
}
