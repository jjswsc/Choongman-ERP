import { NextRequest, NextResponse } from 'next/server'
import { unlinkLineIdentity } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(
  req: NextRequest,
  context: { params: { id: string } }
) {
  // #region agent log
  fetch('http://127.0.0.1:7383/ingest/f85ce2e6-3f30-4dec-a500-2fe4222a00ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'12c78c'},body:JSON.stringify({sessionId:'12c78c',runId:'build-debug-1',hypothesisId:'H2',location:'app/api/members/[id]/unlink-line/route.ts:5',message:'unlink-line handler loaded',data:{hasContext:Boolean(context)},timestamp:Date.now()})}).catch(()=>{})
  // #endregion
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const memberId = Number(context.params.id || 0)
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
