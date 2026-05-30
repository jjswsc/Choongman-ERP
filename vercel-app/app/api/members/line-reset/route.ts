import { NextRequest, NextResponse } from 'next/server'
import { resetLineMemberList } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'office')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const result = await resetLineMemberList()
    return NextResponse.json({ success: true, ...result }, { headers })
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : 'LINE 목록 초기화에 실패했습니다.',
      },
      { headers, status: 400 }
    )
  }
}

