import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate, supabaseUpdateByFilter } from '@/lib/supabase-server'

const ALLOWED_STATUS = ['배송중', '배송완료', '일부배송완료']

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const body = await request.json()
    const orderId = Number(body.orderId ?? body.row ?? body.orderRowId)
    const deliveryStatus = String(body.deliveryStatus ?? body.delivery_status ?? '').trim()

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json(
        { success: false, message: '❌ 잘못된 주문 번호입니다.' },
        { headers }
      )
    }
    if (!ALLOWED_STATUS.includes(deliveryStatus)) {
      return NextResponse.json(
        { success: false, message: '❌ 유효하지 않은 배송 상태입니다.' },
        { headers }
      )
    }

    const orders = (await supabaseSelectFilter('orders', 'id=eq.' + orderId)) as unknown[]
    if (!orders?.length) {
      return NextResponse.json({ success: false, message: '❌ 해당 주문이 없습니다.' }, { headers })
    }

    await supabaseUpdate('orders', orderId, { delivery_status: deliveryStatus })

    try {
      await supabaseUpdateByFilter('stock_logs', 'order_id=eq.' + orderId, {
        delivery_status: deliveryStatus,
      })
    } catch {
      // stock_logs may not have order_id or delivery_status
    }

    return NextResponse.json({ success: true, message: '변경되었습니다.' }, { headers })
  } catch (e) {
    console.error('updateOrderDeliveryStatus:', e)
    return NextResponse.json(
      { success: false, message: '❌ 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
