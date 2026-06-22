import { NextRequest, NextResponse } from 'next/server'
import { getMemberPortalOrderDetail } from '@/lib/member-portal-order-detail-server'
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
  if (!orderId) {
    return NextResponse.json({ success: false, message: 'invalid_order' }, { status: 400 })
  }

  try {
    const detail = await getMemberPortalOrderDetail(member, orderId)
    if (!detail) {
      return NextResponse.json({ success: false, message: 'order_forbidden' }, { status: 403 })
    }
    return NextResponse.json({ success: true, order: detail })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'order_detail_failed' },
      { status: 500 }
    )
  }
}
