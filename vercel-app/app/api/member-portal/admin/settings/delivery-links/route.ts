import { NextRequest, NextResponse } from 'next/server'
import {
  membersTenantToSettingsScope,
  resolveMemberPortalAdminTenantScope,
} from '@/lib/member-portal-admin-tenant-scope'
import {
  loadTenantScopedSystemSettingsMap,
  upsertTenantScopedSystemSettings,
} from '@/lib/tenant-system-settings-server'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

const KEY_GRAB = 'member_portal_delivery_grab_url'
const KEY_LINEMAN = 'member_portal_delivery_lineman_url'
const KEY_SHOPEE = 'member_portal_delivery_shopee_url'

const DELIVERY_KEYS = [KEY_GRAB, KEY_LINEMAN, KEY_SHOPEE] as const

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
    const map = await loadTenantScopedSystemSettingsMap(DELIVERY_KEYS, settingsScope)
    return NextResponse.json({
      success: true,
      grabUrl: map.get(KEY_GRAB) || '',
      linemanUrl: map.get(KEY_LINEMAN) || '',
      shopeeUrl: map.get(KEY_SHOPEE) || '',
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
    const body = (await req.json()) as { grabUrl?: string; linemanUrl?: string; shopeeUrl?: string }
    await upsertTenantScopedSystemSettings(
      [
        { baseKey: KEY_GRAB, value_json: asHttpUrl(body.grabUrl) },
        { baseKey: KEY_LINEMAN, value_json: asHttpUrl(body.linemanUrl) },
        { baseKey: KEY_SHOPEE, value_json: asHttpUrl(body.shopeeUrl) },
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
