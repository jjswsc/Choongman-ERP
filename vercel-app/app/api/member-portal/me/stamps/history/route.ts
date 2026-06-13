import { NextRequest, NextResponse } from 'next/server'
import { listMemberStampHistory } from '@/lib/member-stamp-card'
import { requireMemberSession } from '@/lib/member-portal-session'

export async function GET(req: NextRequest) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  try {
    const limit = Math.max(1, Math.min(Number(req.nextUrl.searchParams.get('limit') || 20), 50))
    const rows = await listMemberStampHistory(member!.id, limit)
    return NextResponse.json({ success: true, rows })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '이력 조회 실패' },
      { status: 400 }
    )
  }
}
