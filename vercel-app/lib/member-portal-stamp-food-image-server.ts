import {
  DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL,
  MEMBER_PORTAL_STAMP_FOOD_IMAGE_KEY,
  normalizeMemberPortalStampFoodImageUrl,
} from '@/lib/member-portal-stamp-food-image'
import { readSystemSettingString } from '@/lib/system-settings-value'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function loadMemberPortalStampFoodImageUrl(): Promise<string> {
  try {
    const rows = (await supabaseSelectFilter('system_settings', `key=eq.${MEMBER_PORTAL_STAMP_FOOD_IMAGE_KEY}`, {
      limit: 1,
      select: 'value_json',
    })) as { value_json?: unknown }[]
    const raw = rows?.[0]?.value_json
    if (raw == null || raw === '') return DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL
    return normalizeMemberPortalStampFoodImageUrl(readSystemSettingString(raw))
  } catch {
    return DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL
  }
}
