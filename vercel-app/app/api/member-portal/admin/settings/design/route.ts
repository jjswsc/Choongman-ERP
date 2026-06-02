import { NextRequest, NextResponse } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

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
      map.set(key, String(row.value_json || '').trim())
    }

    return NextResponse.json({
      success: true,
      loginBackgroundUrl: map.get(KEY_LOGIN_BG) || '',
      appBackgroundUrl: map.get(KEY_APP_BG) || '',
    })
  } catch (e) {
    return NextResponse.json(
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
    await supabaseUpsert(
      'system_settings',
      [
        {
          key: KEY_LOGIN_BG,
          value_json: asHttpUrl(body.loginBackgroundUrl),
          updated_at: getBangkokDateTimeString(),
        },
        {
          key: KEY_APP_BG,
          value_json: asHttpUrl(body.appBackgroundUrl),
          updated_at: getBangkokDateTimeString(),
        },
      ],
      'key'
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '디자인 설정 저장에 실패했습니다.' },
      { status: 500 }
    )
  }
}

