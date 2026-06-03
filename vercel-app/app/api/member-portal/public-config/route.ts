import { NextResponse } from 'next/server'
import { getServerAppBrandConfig } from '@/lib/app-brand-server'
import { getSignupWelcomeCouponCode } from '@/lib/member-portal-signup-welcome-coupon'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const KEY_FACEBOOK = 'member_portal_contact_facebook_url'
const KEY_INSTAGRAM = 'member_portal_contact_instagram_url'
const KEY_LINE_OFFICIAL = 'member_portal_contact_line_official_url'
const KEY_LOGIN_BG = 'member_portal_login_background_url'
const KEY_APP_BG = 'member_portal_app_background_url'

export async function GET() {
  const brand = await getServerAppBrandConfig()
  try {
    const filter = `or=(key.eq.${KEY_FACEBOOK},key.eq.${KEY_INSTAGRAM},key.eq.${KEY_LINE_OFFICIAL},key.eq.${KEY_LOGIN_BG},key.eq.${KEY_APP_BG})`
    const rows = (await supabaseSelectFilter('system_settings', filter, {
      limit: 10,
      select: 'key,value_json',
    })) as { key?: string; value_json?: unknown }[]

    const map = new Map<string, string>()
    for (const row of rows || []) {
      const key = String(row.key || '').trim()
      const value = String(row.value_json || '').trim()
      if (!key || !value) continue
      map.set(key, value)
    }

    return NextResponse.json({
      success: true,
      facebookUrl: map.get(KEY_FACEBOOK) || brand.memberContactFacebookUrl,
      instagramUrl: map.get(KEY_INSTAGRAM) || brand.memberContactInstagramUrl,
      lineOfficialUrl: map.get(KEY_LINE_OFFICIAL) || '',
      loginBackgroundUrl: map.get(KEY_LOGIN_BG) || '',
      appBackgroundUrl: map.get(KEY_APP_BG) || '',
      signupWelcomeCouponEnabled: Boolean(await getSignupWelcomeCouponCode()),
    })
  } catch {
    return NextResponse.json({
      success: true,
      facebookUrl: brand.memberContactFacebookUrl,
      instagramUrl: brand.memberContactInstagramUrl,
      lineOfficialUrl: '',
      loginBackgroundUrl: '',
      appBackgroundUrl: '',
      signupWelcomeCouponEnabled: false,
    })
  }
}

