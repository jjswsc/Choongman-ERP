import { NextRequest, NextResponse } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import {
  MEMBER_PORTAL_HOME_PRIVILEGES_KEY,
  normalizeMemberPortalHomePrivilegesInput,
} from '@/lib/member-portal-home-privileges-config'
import { loadMemberPortalHomePrivilegesConfig } from '@/lib/member-portal-home-privileges-config-server'
import { supabaseUpsert } from '@/lib/supabase-server'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const items = await loadMemberPortalHomePrivilegesConfig()
    return NextResponse.json({ success: true, items })
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
    const body = (await req.json()) as { items?: unknown }
    const items = normalizeMemberPortalHomePrivilegesInput(body.items)
    await supabaseUpsert(
      'system_settings',
      [
        {
          key: MEMBER_PORTAL_HOME_PRIVILEGES_KEY,
          value_json: items,
          updated_at: getBangkokDateTimeString(),
        },
      ],
      'key'
    )
    return NextResponse.json({ success: true, items })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '설정을 저장하지 못했습니다.' },
      { status: 500 }
    )
  }
}
