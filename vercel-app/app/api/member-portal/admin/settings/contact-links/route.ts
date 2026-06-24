import { NextRequest, NextResponse } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { readSystemSettingString, writeSystemSettingString } from '@/lib/system-settings-value'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

const KEY_FACEBOOK = 'member_portal_contact_facebook_url'
const KEY_INSTAGRAM = 'member_portal_contact_instagram_url'
const KEY_LINE_OFFICIAL = 'member_portal_contact_line_official_url'

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
    const filter = `or=(key.eq.${KEY_FACEBOOK},key.eq.${KEY_INSTAGRAM},key.eq.${KEY_LINE_OFFICIAL})`
    const rows = (await supabaseSelectFilter('system_settings', filter, {
      limit: 10,
      select: 'key,value_json',
    })) as { key?: string; value_json?: unknown }[]

    const map = new Map<string, string>()
    for (const row of rows || []) {
      const key = String(row.key || '').trim()
      const value = readSystemSettingString(row.value_json)
      if (!key) continue
      map.set(key, value)
    }

    return NextResponse.json({
      success: true,
      facebookUrl: map.get(KEY_FACEBOOK) || '',
      instagramUrl: map.get(KEY_INSTAGRAM) || '',
      lineOfficialUrl: map.get(KEY_LINE_OFFICIAL) || '',
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '설정을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const body = (await req.json()) as {
      facebookUrl?: string
      instagramUrl?: string
      lineOfficialUrl?: string
    }
    const rows: Record<string, unknown>[] = [
      {
        key: KEY_FACEBOOK,
        value_json: writeSystemSettingString(asHttpUrl(body.facebookUrl)),
        updated_at: getBangkokDateTimeString(),
      },
      {
        key: KEY_INSTAGRAM,
        value_json: writeSystemSettingString(asHttpUrl(body.instagramUrl)),
        updated_at: getBangkokDateTimeString(),
      },
      {
        key: KEY_LINE_OFFICIAL,
        value_json: writeSystemSettingString(asHttpUrl(body.lineOfficialUrl)),
        updated_at: getBangkokDateTimeString(),
      },
    ]
    await supabaseUpsert('system_settings', rows, 'key')
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '설정을 저장하지 못했습니다.' },
      { status: 500 }
    )
  }
}

