import {
  DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES,
  MEMBER_PORTAL_HOME_PRIVILEGES_KEY,
  parseMemberPortalHomePrivileges,
  type MemberPortalHomePrivilegeItem,
} from '@/lib/member-portal-home-privileges-config'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function loadMemberPortalHomePrivilegesConfig(): Promise<MemberPortalHomePrivilegeItem[]> {
  try {
    const rows = (await supabaseSelectFilter('system_settings', `key=eq.${MEMBER_PORTAL_HOME_PRIVILEGES_KEY}`, {
      limit: 1,
      select: 'value_json',
    })) as { value_json?: unknown }[]
    const raw = rows?.[0]?.value_json
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
