import { NextRequest, NextResponse } from 'next/server'
import { MEMBER_PORTAL_SIGNUP_WELCOME_COUPON_KEY } from '@/lib/member-portal-signup-welcome-coupon'
import {
  membersTenantToSettingsScope,
  resolveMemberPortalAdminTenantScope,
} from '@/lib/member-portal-admin-tenant-scope'
import {
  loadTenantScopedSystemSettingJson,
  upsertTenantScopedSystemSettings,
} from '@/lib/tenant-system-settings-server'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

function normalizeCouponCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
}

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveMemberPortalAdminTenantScope(authResult.auth!)
  const settingsScope = membersTenantToSettingsScope(tenantScope)
  try {
    const raw = await loadTenantScopedSystemSettingJson(MEMBER_PORTAL_SIGNUP_WELCOME_COUPON_KEY, settingsScope)
    return NextResponse.json({
      success: true,
      welcomeCouponCode: String(raw || '').trim(),
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
    const body = (await req.json()) as { welcomeCouponCode?: string }
    const welcomeCouponCode = normalizeCouponCode(body.welcomeCouponCode)
    await upsertTenantScopedSystemSettings(
      [{ baseKey: MEMBER_PORTAL_SIGNUP_WELCOME_COUPON_KEY, value_json: welcomeCouponCode }],
      settingsScope
    )
    return NextResponse.json({ success: true, welcomeCouponCode })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '설정을 저장하지 못했습니다.' },
      { status: 500 }
    )
  }
}
