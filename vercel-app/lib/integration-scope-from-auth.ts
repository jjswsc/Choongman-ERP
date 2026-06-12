import { deriveTenantIdFromCompany } from '@/lib/tenant-context'
import type { JwtPayload } from '@/lib/jwt-auth'
import type { IntegrationScope } from '@/lib/tenant-integration-types'

export function integrationScopeFromAuth(
  auth: Pick<JwtPayload, 'tenantId' | 'company' | 'store'> | null | undefined,
  storeCodeOverride?: string
): IntegrationScope {
  const tenantId =
    String(auth?.tenantId || '').trim() ||
    deriveTenantIdFromCompany(auth?.company) ||
    undefined
  const storeCode = String(storeCodeOverride || auth?.store || '').trim() || undefined
  return { tenantId, storeCode }
}
