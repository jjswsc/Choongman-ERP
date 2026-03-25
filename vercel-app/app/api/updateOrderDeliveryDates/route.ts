/**
 * 승인된 주문의 출고지별 배송일 수정 API
 * 오피스 직원만 호출 가능
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const body = await request.json()
    const orderId = Number(body.orderId ?? body.order_row_id)
    const deliveryDatesByOutbound = body.deliveryDatesByOutbound && typeof body.deliveryDatesByOutbound === 'object'
      ? body.deliveryDatesByOutbound as Record<string, string>
      : null
    const userRole = String(body.userRole ?? '').toLowerCase()
    const isOffice = ['director', 'ceo', 'hr', 'officer'].some((r) => userRole.includes(r))

    if (!isOffice) {
      return NextResponse.json(
        { success: false, message: '오피스 직원만 배송일을 수정할 수 있습니다.' },
        { headers }
      )
    }

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json(
        { success: false, message: '잘못된 주문 번호입니다.' },
        { headers }
      )
    }
    if (!deliveryDatesByOutbound || Object.keys(deliveryDatesByOutbound).length === 0) {
      return NextResponse.json(
        { success: false, message: '배송일 정보가 없습니다.' },
        { headers }
      )
    }

    const orders = (await supabaseSelectFilter('orders', 'id=eq.' + orderId, {
      limit: 1,
      select: 'status',
    })) as unknown[]
    if (!orders?.length) {
      return NextResponse.json({ success: false, message: '해당 주문이 없습니다.' }, { headers })
    }

    const status = String((orders[0] as { status?: string }).status ?? '').trim()
    if (status !== 'Approved') {
      return NextResponse.json(
        { success: false, message: '승인된 주문만 배송일을 수정할 수 있습니다.' },
        { headers }
      )
    }

    const firstDate = Object.values(deliveryDatesByOutbound).find((v) => v && String(v).trim())
    const patch: Record<string, unknown> = {
      delivery_dates_by_outbound: JSON.stringify(deliveryDatesByOutbound),
    }
    if (firstDate) patch.delivery_date = String(firstDate).trim()

    await supabaseUpdate('orders', orderId, patch)
    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('updateOrderDeliveryDates:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}
