import { NextRequest, NextResponse } from 'next/server'
import {
  getMemberPointLineNotifyReadiness,
  sendMemberPointLineTestNotify,
} from '@/lib/member-point-line-notify'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse

  const memberId = Math.trunc(Number(req.nextUrl.searchParams.get('memberId') || 0))
  if (!memberId) {
    return NextResponse.json({ success: false, message: 'memberId required' }, { status: 400, headers })
  }

  const readiness = await getMemberPointLineNotifyReadiness(memberId)
  return NextResponse.json({ success: true, readiness }, { headers })
}

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse

  const body = (await req.json().catch(() => ({}))) as { memberId?: number }
  const memberId = Math.trunc(Number(body.memberId || 0))
  if (!memberId) {
    return NextResponse.json({ success: false, message: 'memberId required' }, { status: 400, headers })
  }

  const readiness = await getMemberPointLineNotifyReadiness(memberId)
  const result = await sendMemberPointLineTestNotify(memberId)
  return NextResponse.json(
    {
      success: result.ok,
      readiness,
      result,
      message: result.ok ? 'test_sent' : result.message || 'test_failed',
    },
    { headers }
  )
}
