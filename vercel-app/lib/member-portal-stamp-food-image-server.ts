import {
  DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL,
  MEMBER_PORTAL_STAMP_FOOD_IMAGE_KEY,
  normalizeMemberPortalStampFoodImageUrl,
} from '@/lib/member-portal-stamp-food-image'
import { readSystemSettingString } from '@/lib/system-settings-value'
import { loadTenantScopedSystemSettingJson } from '@/lib/tenant-system-settings-server'
import type { TenantSettingsScope } from '@/lib/tenant-system-settings'

const LEGACY_SCOPE: TenantSettingsScope = { enforce: false, tenantId: '' }

export async function loadMemberPortalStampFoodImageUrl(
  scope: TenantSettingsScope = LEGACY_SCOPE
): Promise<string> {
  try {
    const raw = await loadTenantScopedSystemSettingJson(MEMBER_PORTAL_STAMP_FOOD_IMAGE_KEY, scope)
    if (raw == null || raw === '') return DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL
    return normalizeMemberPortalStampFoodImageUrl(readSystemSettingString(raw))
  } catch {
    return DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL
  }
}
