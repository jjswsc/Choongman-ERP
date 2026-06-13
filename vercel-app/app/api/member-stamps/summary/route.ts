import { NextRequest, NextResponse } from 'next/server'
import { getMemberStampSummaryForPos } from '@/lib/member-stamp-card'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'any')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const memberId = Number(req.nextUrl.searchParams.get('memberId') || 0)
    if (!memberId) {
      return NextResponse.json({ success: false, message: 'memberId가 필요합니다.' }, { headers, status: 400 })
    }
    const summary = await getMemberStampSummaryForPos(memberId)
    return NextResponse.json({ success: true, summary }, { headers })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '조회 실패' },
      { headers, status: 400 }
    )
  }
}
