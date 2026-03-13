import { NextRequest, NextResponse } from 'next/server'
import { linkLineIdentity } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const memberId = Number(context.params.id || 0)
    if (!memberId) {
      return NextResponse.json({ success: false, message: '유효한 회원 ID가 필요합니다.' }, { headers })
    }
    const body = (await req.json()) as {
      lineUserId?: string
      displayName?: string
      pictureUrl?: string
    }
    const lineUserId = String(body.lineUserId || '').trim()
    if (!lineUserId) {
      return NextResponse.json({ success: false, message: 'lineUserId가 필요합니다.' }, { headers })
    }
    await linkLineIdentity({
      memberId,
      lineUserId,
      displayName: String(body.displayName || '').trim(),
      pictureUrl: String(body.pictureUrl || '').trim(),
    })
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('POST /api/members/[id]/link-line:', e)
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '연결 실패' }, { headers })
  }
}
