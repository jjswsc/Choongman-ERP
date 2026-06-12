import { NextRequest, NextResponse } from 'next/server'
import { pollMemberPortalOrderPayment } from '@/lib/member-portal-checkout-server'
import { requireMemberSession } from '@/lib/member-portal-session'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, context: RouteContext) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  if (!member) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { id } = await context.params
  const orderId = Number(id || 0)
  const partnerTransactionId = String(req.nextUrl.searchParams.get('partnerTransactionId') || '').trim()
  if (!orderId || !partnerTransactionId) {
    return NextResponse.json({ success: false, message: 'invalid_request' }, { status: 400 })
  }

  try {
    const result = await pollMemberPortalOrderPayment({
      member,
      orderId,
      partnerTransactionId,
    })
    return NextResponse.json({
      success: true,
      status: result.status,
      paid: result.paid,
      message: result.message,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'status_failed' },
      { status: 500 }
    )
  }
}
