import { NextRequest, NextResponse } from 'next/server'
import { writeSystemSettingString } from '@/lib/system-settings-value'
import {
  membersTenantToSettingsScope,
  resolveMemberPortalAdminTenantScope,
} from '@/lib/member-portal-admin-tenant-scope'
import {
  loadTenantScopedSystemSettingsMap,
  upsertTenantScopedSystemSettings,
} from '@/lib/tenant-system-settings-server'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

const KEY_FACEBOOK = 'member_portal_contact_facebook_url'
const KEY_INSTAGRAM = 'member_portal_contact_instagram_url'
const KEY_LINE_OFFICIAL = 'member_portal_contact_line_official_url'

const CONTACT_KEYS = [KEY_FACEBOOK, KEY_INSTAGRAM, KEY_LINE_OFFICIAL] as const

function asHttpUrl(raw: unknown): string {
  const v = String(raw || '').trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  return `https://${v}`
}

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveMemberPortalAdminTenantScope(authResult.auth!)
  const settingsScope = membersTenantToSettingsScope(tenantScope)
  try {
    const map = await loadTenantScopedSystemSettingsMap(CONTACT_KEYS, settingsScope)
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
  const tenantScope = await resolveMemberPortalAdminTenantScope(authResult.auth!)
  const settingsScope = membersTenantToSettingsScope(tenantScope)
  try {
    const body = (await req.json()) as {
      facebookUrl?: string
      instagramUrl?: string
      lineOfficialUrl?: string
    }
    await upsertTenantScopedSystemSettings(
      [
        { baseKey: KEY_FACEBOOK, value_json: writeSystemSettingString(asHttpUrl(body.facebookUrl)) },
        { baseKey: KEY_INSTAGRAM, value_json: writeSystemSettingString(asHttpUrl(body.instagramUrl)) },
        { baseKey: KEY_LINE_OFFICIAL, value_json: writeSystemSettingString(asHttpUrl(body.lineOfficialUrl)) },
      ],
      settingsScope
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '설정을 저장하지 못했습니다.' },
      { status: 500 }
    )
  }
}
