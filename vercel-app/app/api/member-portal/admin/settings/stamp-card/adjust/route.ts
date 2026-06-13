import { NextRequest, NextResponse } from 'next/server'
import { adjustMemberStampBalance } from '@/lib/member-stamp-card'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

export async function POST(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const body = (await req.json()) as { memberId?: number; delta?: number; note?: string }
    const memberId = Number(body.memberId || 0)
    const delta = Math.trunc(Number(body.delta || 0))
    const note = String(body.note || '').trim()
    if (!memberId || !delta) {
      return NextResponse.json({ success: false, message: 'memberId와 delta(±1 이상)가 필요합니다.' }, { status: 400 })
    }
    if (!note) {
      return NextResponse.json({ success: false, message: '조정 사유를 입력해 주세요.' }, { status: 400 })
    }
    const actor = String(authResult.auth?.name || authResult.auth?.employeeCode || 'admin').trim()
    const result = await adjustMemberStampBalance({ memberId, delta, note, actor })
    return NextResponse.json({ success: true, newBalance: result.newBalance })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '스탬프 조정 실패' },
      { status: 400 }
    )
  }
}
