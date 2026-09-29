/**
 * W1 HR — 직원 CSV는 테넌트 범위 안에서 추가·수정만 한다. 전체 삭제는 하지 않는다.
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
