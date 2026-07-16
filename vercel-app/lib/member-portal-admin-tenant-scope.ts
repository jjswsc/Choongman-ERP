import { resolveMembersTenantScope, type MembersTenantScope } from '@/lib/members-tenant-scope'
import type { JwtPayload } from '@/lib/jwt-auth'
import type { TenantSettingsScope } from '@/lib/tenant-system-settings'

export async function resolveMemberPortalAdminTenantScope(
  auth: JwtPayload
): Promise<MembersTenantScope> {
  return resolveMembersTenantScope({ auth })
}

export function membersTenantToSettingsScope(scope: MembersTenantScope): TenantSettingsScope {
  return { enforce: scope.enforce, tenantId: scope.tenantId }
}
