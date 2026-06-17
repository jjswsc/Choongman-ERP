import { NextRequest } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import {
  MEMBER_PORTAL_SETTINGS_ROUTE_DYNAMIC,
  MEMBER_PORTAL_SETTINGS_ROUTE_REVALIDATE,
  memberPortalSettingsJsonResponse,
} from '@/lib/member-portal-settings-route'
import { readSystemSettingString, writeSystemSettingString } from '@/lib/system-settings-value'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

export const dynamic = MEMBER_PORTAL_SETTINGS_ROUTE_DYNAMIC
export const revalidate = MEMBER_PORTAL_SETTINGS_ROUTE_REVALIDATE

const KEY_LOGIN_BG = 'member_portal_login_background_url'
const KEY_APP_BG = 'member_portal_app_background_url'

function asHttpUrl(raw: unknown): string {
  const v = String(raw || '').trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  return `https://${v}`
}

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const filter = `or=(key.eq.${KEY_LOGIN_BG},key.eq.${KEY_APP_BG})`
    const rows = (await supabaseSelectFilter('system_settings', filter, {
      limit: 10,
      select: 'key,value_json',
    })) as { key?: string; value_json?: unknown }[]

    const map = new Map<string, string>()
    for (const row of rows || []) {
      const key = String(row.key || '').trim()
      if (!key) continue
      map.set(key, readSystemSettingString(row.value_json))
    }

    return memberPortalSettingsJsonResponse({
      success: true,
      loginBackgroundUrl: map.get(KEY_LOGIN_BG) || '',
      appBackgroundUrl: map.get(KEY_APP_BG) || '',
    })
  } catch (e) {
    return memberPortalSettingsJsonResponse(
      { success: false, message: e instanceof Error ? e.message : '디자인 설정을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const body = (await req.json()) as { loginBackgroundUrl?: string; appBackgroundUrl?: string }
    const loginBackgroundUrl = writeSystemSettingString(asHttpUrl(body.loginBackgroundUrl))
    const appBackgroundUrl = writeSystemSettingString(asHttpUrl(body.appBackgroundUrl))
    await supabaseUpsert(
      'system_settings',
      [
        {
          key: KEY_LOGIN_BG,
          value_json: loginBackgroundUrl,
          updated_at: getBangkokDateTimeString(),
        },
        {
          key: KEY_APP_BG,
          value_json: appBackgroundUrl,
          updated_at: getBangkokDateTimeString(),
        },
      ],
      'key'
    )
    return memberPortalSettingsJsonResponse({
      success: true,
      loginBackgroundUrl,
      appBackgroundUrl,
    })
  } catch (e) {
    return memberPortalSettingsJsonResponse(
      { success: false, message: e instanceof Error ? e.message : '디자인 설정 저장에 실패했습니다.' },
      { status: 500 }
    )
  }
}

