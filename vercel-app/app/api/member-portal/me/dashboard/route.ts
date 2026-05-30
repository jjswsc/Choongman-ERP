import { NextRequest, NextResponse } from 'next/server'
import { getMemberPortalDashboard } from '@/lib/member-portal-dashboard'
import { requireMemberSession } from '@/lib/member-portal-session'

export async function GET(req: NextRequest) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  try {
    const dashboard = await getMemberPortalDashboard(member!.id)
    return NextResponse.json({ success: true, ...dashboard })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '대시보드 조회 실패' },
      { status: 400 }
    )
  }
}
