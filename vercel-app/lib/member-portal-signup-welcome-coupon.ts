import { issueMemberCoupon } from '@/lib/members-server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export const MEMBER_PORTAL_SIGNUP_WELCOME_COUPON_KEY = 'member_portal_signup_welcome_coupon_code'

function toText(v: unknown): string {
  return String(v || '').trim()
}

export async function getSignupWelcomeCouponCode(): Promise<string> {
  try {
    const rows = (await supabaseSelectFilter('system_settings', `key=eq.${MEMBER_PORTAL_SIGNUP_WELCOME_COUPON_KEY}`, {
      limit: 1,
      select: 'value_json',
    })) as { value_json?: unknown }[]
    return toText(rows?.[0]?.value_json).toUpperCase()
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
  const couponCode = await getSignupWelcomeCouponCode()
  if (!couponCode) return false
  try {
    await issueMemberCoupon({ memberId, couponCode })
    return true
  } catch {
    return false
  }
}
