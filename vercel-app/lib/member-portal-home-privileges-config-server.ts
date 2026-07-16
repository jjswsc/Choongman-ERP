import {
  DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES,
  MEMBER_PORTAL_HOME_PRIVILEGES_KEY,
  parseMemberPortalHomePrivileges,
  type MemberPortalHomePrivilegeItem,
} from '@/lib/member-portal-home-privileges-config'
import { loadTenantScopedSystemSettingJson } from '@/lib/tenant-system-settings-server'
import type { TenantSettingsScope } from '@/lib/tenant-system-settings'

const LEGACY_SCOPE: TenantSettingsScope = { enforce: false, tenantId: '' }

export async function loadMemberPortalHomePrivilegesConfig(
  scope: TenantSettingsScope = LEGACY_SCOPE
): Promise<MemberPortalHomePrivilegeItem[]> {
  try {
    const raw = await loadTenantScopedSystemSettingJson(MEMBER_PORTAL_HOME_PRIVILEGES_KEY, scope)
    if (!raw) return DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES
    if (typeof raw === 'string') {
      try {
        return parseMemberPortalHomePrivileges(JSON.parse(raw))
      } catch {
        return DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES
      }
    }
    return parseMemberPortalHomePrivileges(raw)
  } catch {
    return DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES
  }
}
