import { NextRequest, NextResponse } from 'next/server'
import { posApiCorsHeaders, requirePosOrderWriteAuth } from '@/lib/pos-api-write-auth'
import {
  AttachMemberAfterPayError,
  attachMemberAndEarnPointsAfterPay,
} from '@/lib/pos-attach-member-after-pay-server'

/**
 * 결제 완료 주문에 회원을 나중에 연결하고 포인트를 소급 적립한다.
 * 이미 결제된 주문의 member_id / point_earned 만 갱신하며, 결제 영수증 자동인쇄를 유발하지 않는다.
 * 인증은 requireAuth(Bearer + cm_token 쿠키) — 영수증 관리 화면의 세션 스토리지 만료 시에도 쿠키로 통과.
 */
export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers })
    }
    const orderId = Number(body?.id ?? body?.orderId ?? 0)
    const memberId = Number(body?.memberId ?? 0)
    if (!orderId || Number.isNaN(orderId)) {
      return NextResponse.json({ success: false, message: 'id_required' }, { status: 400, headers })
    }
    if (!memberId || Number.isNaN(memberId)) {
      return NextResponse.json({ success: false, message: 'member_required' }, { status: 400, headers })
    }

    const authGate = await requirePosOrderWriteAuth(req, orderId, headers)
    if (!authGate.ok) return authGate.response

    const result = await attachMemberAndEarnPointsAfterPay({
      orderId,
      memberId,
      caller: authGate.auth,
    })
    return NextResponse.json({ success: true, ...result }, { headers })
  } catch (e) {
    if (e instanceof AttachMemberAfterPayError) {
      return NextResponse.json(
        { success: false, message: e.code },
        { status: e.httpStatus, headers }
      )
    }
    console.error('attachPosOrderMember:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { success: false, message: msg.slice(0, 500) },
      { status: 500, headers }
    )
  }
}
