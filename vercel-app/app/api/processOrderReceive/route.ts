import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelectFilter,
  supabaseUpdate,
  supabaseUpdateByFilter,
  supabaseInsertMany,
} from '@/lib/supabase-server'

const TZ = 'Asia/Bangkok'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const body = await request.json()
    const orderId = Number(body.orderRowId ?? body.row ?? body.orderId)
    const imageUrl = body.imageUrl ? String(body.imageUrl).trim() : ''

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json(
        { success: false, message: '❌ 잘못된 주문 번호입니다.' },
        { headers }
      )
    }

    const orders = (await supabaseSelectFilter('orders', 'id=eq.' + orderId)) as unknown[]
    if (!orders?.length) {
      return NextResponse.json({ success: false, message: '❌ 해당 주문이 없습니다.' }, { headers })
    }

    const o = orders[0] as {
      status?: string
      delivery_status?: string
      cart_json?: string
      store_name?: string
    }
    if (o.status !== 'Approved') {
      return NextResponse.json(
        { success: false, message: '❌ 승인된 주문만 수령 처리할 수 있습니다.' },
        { headers }
      )
    }
    if (o.delivery_status === '배송완료') {
      return NextResponse.json(
        { success: false, message: '❌ 이미 수령 완료된 주문입니다.' },
        { headers }
      )
    }

    let cart: { code?: string; name?: string; spec?: string; qty?: number }[] = []
    try {
      cart = JSON.parse((o.cart_json as string) || '[]')
    } catch {}
    if (!cart.length) {
      return NextResponse.json({ success: false, message: '❌ 주문 품목이 없습니다.' }, { headers })
    }

    const store = String(o.store_name || '')
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    const inboundRows = cart.map((item) => ({
      location: store,
      item_code: item.code,
      item_name: item.name || '',
      spec: item.spec || '-',
      qty: Number(item.qty) || 0,
      log_date: today,
      vendor_target: 'From HQ',
      log_type: 'Inbound',
    }))

    if (inboundRows.length) {
      await supabaseInsertMany('stock_logs', inboundRows)
    }
    try {
      await supabaseUpdateByFilter('stock_logs', 'order_id=eq.' + orderId, {
        delivery_status: '배송완료',
      })
    } catch {}

    const patch: Record<string, unknown> = { delivery_status: '배송완료' }
    if (imageUrl) patch.image_url = imageUrl
    await supabaseUpdate('orders', orderId, patch)

    return NextResponse.json({ success: true, message: '완료되었습니다.' }, { headers })
  } catch (e) {
    console.error('processOrderReceive:', e)
    return NextResponse.json(
      { success: false, message: '❌ 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
