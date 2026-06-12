import { NextRequest, NextResponse } from 'next/server'
import {
  loadMemberPortalPickupSettingsForAdmin,
  saveMemberPortalPickupSettings,
} from '@/lib/member-portal-pickup-settings'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const settings = await loadMemberPortalPickupSettingsForAdmin()
    return NextResponse.json({ success: true, ...settings })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'load_failed' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const body = (await req.json()) as {
      globalMinLeadMinutes?: number
      storeMinLeadMinutes?: Record<string, number>
      lineNotifyEnabled?: boolean
    }
    await saveMemberPortalPickupSettings({
      globalMinLeadMinutes: Number(body.globalMinLeadMinutes ?? 30),
      storeMinLeadMinutes: body.storeMinLeadMinutes,
      lineNotifyEnabled: body.lineNotifyEnabled !== false,
    })
    const settings = await loadMemberPortalPickupSettingsForAdmin()
    return NextResponse.json({ success: true, ...settings })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'save_failed' },
      { status: 500 }
    )
  }
}
