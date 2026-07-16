import { NextRequest, NextResponse } from 'next/server'
import { adjustMemberPoints } from '@/lib/members-server'
import { resolveMembersTenantScope } from '@/lib/members-tenant-scope'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const tenantScope = await resolveMembersTenantScope({ auth: authRes.auth })
    const body = (await req.json()) as {
      memberId?: number
      points?: number
      note?: string
      amount?: number
    }
    await adjustMemberPoints({
      memberId: Number(body.memberId || 0),
      points: Number(body.points || 0),
      note: String(body.note || '').trim(),
      amount: Number(body.amount || 0),
      tenantScope,
    })
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('POST /api/member-points/adjust:', e)
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '포인트 조정 실패' }, { headers })
  }
}
