import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'

const ALLOWED_DECISIONS = ['Approved', 'Rejected', 'Hold']

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const body = await request.json()
    const orderId = Number(body.orderId ?? body.row ?? body.orderRowId)
    const decision = String(body.decision ?? '').trim()
    const deliveryDate = body.deliveryDate ? String(body.deliveryDate).trim() : ''

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json(
        { success: false, message: '잘못된 주문 번호입니다.' },
        { headers }
      )
    }
    if (!ALLOWED_DECISIONS.includes(decision)) {
      return NextResponse.json(
        { success: false, message: '유효하지 않은 결정입니다.' },
        { headers }
      )
    }

    const orders = (await supabaseSelectFilter('orders', 'id=eq.' + orderId)) as unknown[]
    if (!orders?.length) {
      return NextResponse.json({ success: false, message: '해당 주문이 없습니다.' }, { headers })
    }

    const patch: Record<string, unknown> = { status: decision }
    if (deliveryDate) patch.delivery_date = deliveryDate
    if (decision === 'Approved') patch.delivery_status = '배송중'

    await supabaseUpdate('orders', orderId, patch)
    return NextResponse.json({ success: true, message: '처리되었습니다.' }, { headers })
  } catch (e) {
    console.error('processOrderDecision:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { headers }
    )
  }
}
