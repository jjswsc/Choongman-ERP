import { NextRequest } from 'next/server'
import { getServerAppBrandConfig } from '@/lib/app-brand-server'
import { getSignupWelcomeCouponCode } from '@/lib/member-portal-signup-welcome-coupon'
import { memberPortalSettingsJsonResponse } from '@/lib/member-portal-settings-route'
import {
  KEY_THEME_FONT_SCALE,
  KEY_THEME_TEXT_PRIMARY,
  KEY_THEME_TEXT_SECONDARY,
  parseMemberPortalUiThemeFromMap,
} from '@/lib/member-portal-theme'
import { loadMemberPortalHomePrivilegesConfig } from '@/lib/member-portal-home-privileges-config-server'
import { loadMemberPortalStampFoodImageUrl } from '@/lib/member-portal-stamp-food-image-server'
import {
  loadMemberPortalPrepayConfig,
  MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS,
} from '@/lib/member-portal-prepay-config'
import { resolveMemberPortalPickupMinLeadMinutes } from '@/lib/member-portal-pickup-settings'
import { resolveMemberPortalTenantScope } from '@/lib/member-portal-tenant-scope'
import { loadTenantScopedSystemSettingsMap } from '@/lib/tenant-system-settings-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const KEY_FACEBOOK = 'member_portal_contact_facebook_url'
const KEY_INSTAGRAM = 'member_portal_contact_instagram_url'
const KEY_LINE_OFFICIAL = 'member_portal_contact_line_official_url'
const KEY_LOGIN_BG = 'member_portal_login_background_url'
const KEY_APP_BG = 'member_portal_app_background_url'

const CONFIG_KEYS = [
  KEY_FACEBOOK,
  KEY_INSTAGRAM,
  KEY_LINE_OFFICIAL,
  KEY_LOGIN_BG,
  KEY_APP_BG,
  KEY_THEME_TEXT_PRIMARY,
  KEY_THEME_TEXT_SECONDARY,
  KEY_THEME_FONT_SCALE,
] as const

export async function GET(req: NextRequest) {
  const brand = await getServerAppBrandConfig()
  const tenantScope = await resolveMemberPortalTenantScope({ request: req })
  const settingsScope = { enforce: tenantScope.enforce, tenantId: tenantScope.tenantId }
  try {
    const map = await loadTenantScopedSystemSettingsMap(CONFIG_KEYS, settingsScope)
    const prepayConfig = await loadMemberPortalPrepayConfig(settingsScope)
    const pickupMinLeadMinutes = await resolveMemberPortalPickupMinLeadMinutes()
    const theme = parseMemberPortalUiThemeFromMap(map)
    const homePrivileges = await loadMemberPortalHomePrivilegesConfig(settingsScope)
    const stampFoodImageUrl = await loadMemberPortalStampFoodImageUrl(settingsScope)

    return memberPortalSettingsJsonResponse({
      success: true,
      facebookUrl: map.get(KEY_FACEBOOK) || brand.memberContactFacebookUrl,
      instagramUrl: map.get(KEY_INSTAGRAM) || brand.memberContactInstagramUrl,
      lineOfficialUrl: map.get(KEY_LINE_OFFICIAL) || brand.memberContactLineOfficialUrl,
      loginBackgroundUrl: map.get(KEY_LOGIN_BG) || '',
      appBackgroundUrl: map.get(KEY_APP_BG) || '',
      heroFoodImageUrl: '',
      textPrimaryColor: theme.textPrimaryColor,
      textSecondaryColor: theme.textSecondaryColor,
      fontScalePct: theme.fontScalePct,
      signupWelcomeCouponEnabled: Boolean(await getSignupWelcomeCouponCode(settingsScope)),
      prepayEnabled: prepayConfig.enabled,
      prepayQrExpiryMs: MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS,
      pickupMinLeadMinutes,
      homePrivileges,
      stampFoodImageUrl,
    })
  } catch {
    const theme = parseMemberPortalUiThemeFromMap(new Map())
    const homePrivileges = await loadMemberPortalHomePrivilegesConfig(settingsScope)
    const stampFoodImageUrl = await loadMemberPortalStampFoodImageUrl(settingsScope)
    return memberPortalSettingsJsonResponse({
      success: true,
      facebookUrl: brand.memberContactFacebookUrl,
      instagramUrl: brand.memberContactInstagramUrl,
      lineOfficialUrl: brand.memberContactLineOfficialUrl,
      loginBackgroundUrl: '',
      appBackgroundUrl: '',
      heroFoodImageUrl: '',
      textPrimaryColor: theme.textPrimaryColor,
      textSecondaryColor: theme.textSecondaryColor,
      fontScalePct: theme.fontScalePct,
      signupWelcomeCouponEnabled: false,
      prepayEnabled: String(process.env.MEMBER_PORTAL_PREPAY_ENABLED || '').trim() === '1',
      prepayQrExpiryMs: MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS,
      pickupMinLeadMinutes: 30,
      homePrivileges,
      stampFoodImageUrl,
    })
  }
}
