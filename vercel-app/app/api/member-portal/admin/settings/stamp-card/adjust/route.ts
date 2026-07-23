import { NextRequest, NextResponse } from 'next/server'
import { adjustMemberStampBalance } from '@/lib/member-stamp-card'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

export async function POST(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const body = (await req.json()) as {
      memberId?: number | string
      memberRef?: string
      delta?: number
      note?: string
    }
    const memberRef = String(body.memberRef || body.memberId || '').trim()
    const delta = Math.trunc(Number(body.delta || 0))
    const note = String(body.note || '').trim()
    if (!memberRef || !delta) {
      return NextResponse.json(
        { success: false, message: '회원(ID/전화번호/회원번호)과 delta(±1 이상)가 필요합니다.' },
        { status: 400 }
      )
    }
    if (!note) {
      return NextResponse.json({ success: false, message: '조정 사유를 입력해 주세요.' }, { status: 400 })
    }
    const actor = String(authResult.auth?.name || authResult.auth?.employeeCode || 'admin').trim()
    const result = await adjustMemberStampBalance({ memberRef, delta, note, actor })
    return NextResponse.json({ success: true, newBalance: result.newBalance, memberId: result.memberId })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '스탬프 조정 실패' },
      { status: 400 }
    )
  }
}
