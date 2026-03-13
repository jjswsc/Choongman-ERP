import { NextRequest, NextResponse } from 'next/server'
import { unlinkLineIdentity } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const params = await context.params
    const memberId = Number(params.id || 0)
    if (!memberId) {
      return NextResponse.json({ success: false, message: '유효한 회원 ID가 필요합니다.' }, { headers })
    }
    const body = (await req.json()) as { lineUserId?: string }
    await unlinkLineIdentity({
      memberId,
      lineUserId: String(body.lineUserId || '').trim(),
    })
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('POST /api/members/[id]/unlink-line:', e)
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '해제 실패' }, { headers })
  }
}
