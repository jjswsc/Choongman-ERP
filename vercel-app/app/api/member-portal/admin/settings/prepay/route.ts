import { NextRequest, NextResponse } from 'next/server'
import {
  loadMemberPortalPrepaySettingsForAdmin,
  saveMemberPortalPrepaySettings,
} from '@/lib/member-portal-prepay-config'
import {
  membersTenantToSettingsScope,
  resolveMemberPortalAdminTenantScope,
} from '@/lib/member-portal-admin-tenant-scope'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

function parseStoreCodesInput(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean)
  }
  const text = String(raw ?? '').trim()
  if (!text) return []
  return text
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveMemberPortalAdminTenantScope(authResult.auth!)
  const settingsScope = membersTenantToSettingsScope(tenantScope)
  try {
    const settings = await loadMemberPortalPrepaySettingsForAdmin(settingsScope)
    return NextResponse.json({ success: true, ...settings })
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
      enabled?: boolean
      storeCodes?: unknown
      storeCodesText?: string
      allPublicStores?: boolean
    }
    const storeCodes = body.storeCodes != null ? parseStoreCodesInput(body.storeCodes) : parseStoreCodesInput(body.storeCodesText)
    await saveMemberPortalPrepaySettings(
      {
        enabled: body.enabled !== false,
        storeCodes,
        allPublicStores: Boolean(body.allPublicStores),
      },
      settingsScope
    )
    const settings = await loadMemberPortalPrepaySettingsForAdmin(settingsScope)
    return NextResponse.json({ success: true, ...settings })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'save_failed'
    const status = msg === 'prepay_env_override' ? 409 : 500
    return NextResponse.json({ success: false, message: msg }, { status })
  }
}
