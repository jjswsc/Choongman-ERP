import { NextRequest } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { memberPortalSettingsJsonResponse } from '@/lib/member-portal-settings-route'
import {
  DEFAULT_MEMBER_PORTAL_UI_THEME,
  KEY_THEME_FONT_SCALE,
  KEY_THEME_TEXT_PRIMARY,
  KEY_THEME_TEXT_SECONDARY,
  normalizeMemberPortalFontScalePct,
  normalizeMemberPortalHexColor,
  parseMemberPortalUiThemeFromMap,
  type MemberPortalUiTheme,
} from '@/lib/member-portal-theme'
import { readSystemSettingString, writeSystemSettingString } from '@/lib/system-settings-value'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const KEY_LOGIN_BG = 'member_portal_login_background_url'
const KEY_APP_BG = 'member_portal_app_background_url'

const DESIGN_KEYS = [
  KEY_LOGIN_BG,
  KEY_APP_BG,
  KEY_THEME_TEXT_PRIMARY,
  KEY_THEME_TEXT_SECONDARY,
  KEY_THEME_FONT_SCALE,
] as const

function themeFromBody(body: Record<string, unknown>): MemberPortalUiTheme {
  return {
    textPrimaryColor: normalizeMemberPortalHexColor(
      body.textPrimaryColor,
      DEFAULT_MEMBER_PORTAL_UI_THEME.textPrimaryColor
    ),
    textSecondaryColor: normalizeMemberPortalHexColor(
      body.textSecondaryColor,
      DEFAULT_MEMBER_PORTAL_UI_THEME.textSecondaryColor
    ),
    fontScalePct: normalizeMemberPortalFontScalePct(body.fontScalePct),
  }
}

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
    const filter = `or=(${DESIGN_KEYS.map((k) => `key.eq.${k}`).join(',')})`
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
    const theme = parseMemberPortalUiThemeFromMap(map)

    return memberPortalSettingsJsonResponse({
      success: true,
      loginBackgroundUrl: map.get(KEY_LOGIN_BG) || '',
      appBackgroundUrl: map.get(KEY_APP_BG) || '',
      textPrimaryColor: theme.textPrimaryColor,
      textSecondaryColor: theme.textSecondaryColor,
      fontScalePct: theme.fontScalePct,
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
    const body = (await req.json()) as {
      loginBackgroundUrl?: string
      appBackgroundUrl?: string
      textPrimaryColor?: string
      textSecondaryColor?: string
      fontScalePct?: number
    }
    const loginBackgroundUrl = writeSystemSettingString(asHttpUrl(body.loginBackgroundUrl))
    const appBackgroundUrl = writeSystemSettingString(asHttpUrl(body.appBackgroundUrl))
    const theme = themeFromBody(body)
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
        {
          key: KEY_THEME_TEXT_PRIMARY,
          value_json: theme.textPrimaryColor,
          updated_at: getBangkokDateTimeString(),
        },
        {
          key: KEY_THEME_TEXT_SECONDARY,
          value_json: theme.textSecondaryColor,
          updated_at: getBangkokDateTimeString(),
        },
        {
          key: KEY_THEME_FONT_SCALE,
          value_json: String(theme.fontScalePct),
          updated_at: getBangkokDateTimeString(),
        },
      ],
      'key'
    )
    return memberPortalSettingsJsonResponse({
      success: true,
      loginBackgroundUrl,
      appBackgroundUrl,
      textPrimaryColor: theme.textPrimaryColor,
      textSecondaryColor: theme.textSecondaryColor,
      fontScalePct: theme.fontScalePct,
    })
  } catch (e) {
    return memberPortalSettingsJsonResponse(
      { success: false, message: e instanceof Error ? e.message : '디자인 설정 저장에 실패했습니다.' },
      { status: 500 }
    )
  }
}

