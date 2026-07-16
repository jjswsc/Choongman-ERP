import { issueMemberCoupon } from '@/lib/members-server'
import { resolveMemberPortalTenantScope } from '@/lib/member-portal-tenant-scope'
import { loadTenantScopedSystemSettingJson } from '@/lib/tenant-system-settings-server'
import type { TenantSettingsScope } from '@/lib/tenant-system-settings'

export const MEMBER_PORTAL_SIGNUP_WELCOME_COUPON_KEY = 'member_portal_signup_welcome_coupon_code'

const LEGACY_SCOPE: TenantSettingsScope = { enforce: false, tenantId: '' }

function toText(v: unknown): string {
  return String(v || '').trim()
}

export async function getSignupWelcomeCouponCode(
  scope: TenantSettingsScope = LEGACY_SCOPE
): Promise<string> {
  try {
    const raw = await loadTenantScopedSystemSettingJson(MEMBER_PORTAL_SIGNUP_WELCOME_COUPON_KEY, scope)
    return toText(raw).toUpperCase()
  } catch {
    return ''
  }
}

export async function issueSignupWelcomeCouponIfEligible(params: {
  memberId: number
  created: boolean
  consentMarketing: boolean
}): Promise<boolean> {
  if (!params.created || !params.consentMarketing) return false
  const memberId = Number(params.memberId || 0)
  if (!memberId) return false
  const tenantScope = await resolveMemberPortalTenantScope({ memberId })
  const settingsScope: TenantSettingsScope = tenantScope.enforce
    ? { enforce: true, tenantId: tenantScope.tenantId }
    : LEGACY_SCOPE
  const couponCode = await getSignupWelcomeCouponCode(settingsScope)
  if (!couponCode) return false
  try {
    await issueMemberCoupon({ memberId, couponCode, tenantScope })
    return true
  } catch {
    return false
  }
}
