import { NextRequest, NextResponse } from 'next/server'
import { adjustMemberPoints } from '@/lib/members-server'
import { adjustMemberStampBalance } from '@/lib/member-stamp-card'
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
      /** 소급 적립 시 방문 스탬프 1개도 같이 */
      addStamp?: boolean
    }
    const memberId = Number(body.memberId || 0)
    const points = Number(body.points || 0)
    const note = String(body.note || '').trim()
    await adjustMemberPoints({
      memberId,
      points,
      note,
      amount: Number(body.amount || 0),
      tenantScope,
    })
    if (body.addStamp !== true || points <= 0) {
      return NextResponse.json({ success: true }, { headers })
    }
    try {
      const stamp = await adjustMemberStampBalance({
        memberId,
        delta: 1,
        note: note || 'retro_visit',
        actor: String(authRes.auth?.name || authRes.auth?.employeeCode || 'admin').trim(),
      })
      return NextResponse.json({ success: true, stampBalance: stamp.newBalance }, { headers })
    } catch (stampErr) {
      console.error('POST /api/member-points/adjust stamp:', stampErr)
      return NextResponse.json(
        {
          success: true,
          stampError: stampErr instanceof Error ? stampErr.message : 'stamp_adjust_failed',
        },
        { headers }
      )
    }
  } catch (e) {
    console.error('POST /api/member-points/adjust:', e)
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '포인트 조정 실패' }, { headers })
  }
}
