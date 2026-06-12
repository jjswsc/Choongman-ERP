import { NextRequest, NextResponse } from 'next/server'
import { issueMemberPortalOrderQr } from '@/lib/member-portal-checkout-server'
import { requireMemberSession } from '@/lib/member-portal-session'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, context: RouteContext) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  if (!member) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { id } = await context.params
  const orderId = Number(id || 0)
  if (!orderId) {
    return NextResponse.json({ success: false, message: 'invalid_order_id' }, { status: 400 })
  }

  try {
    const result = await issueMemberPortalOrderQr({ member, orderId })
    if (!result.ok) {
      const status =
        result.message === 'order_not_found'
          ? 404
          : result.message === 'order_forbidden'
            ? 403
            : result.message === 'already_paid'
              ? 409
              : 422
      return NextResponse.json({ success: false, message: result.message }, { status })
    }
    return NextResponse.json({
      success: true,
      partnerTransactionId: result.partnerTransactionId,
      qrPayload: result.qrPayload,
      qrAmount: result.qrAmount,
      paymentExpiresAt: result.paymentExpiresAt,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'qr_failed' },
      { status: 500 }
    )
  }
}
