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
    const orderId = Number(body.orderId ?? body.row ?? body.orderRowId)
    const updatedCart = Array.isArray(body.updatedCart) ? body.updatedCart : null
    const deliveryStatus = body.deliveryStatus ? String(body.deliveryStatus).trim() : undefined

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json(
        { success: false, message: '❌ 잘못된 주문 번호입니다.' },
        { headers }
      )
    }
    if (!updatedCart || updatedCart.length === 0) {
      return NextResponse.json(
        { success: false, message: '❌ 품목이 비어있을 수 없습니다.' },
        { headers }
      )
    }

    const orders = (await supabaseSelectFilter('orders', 'id=eq.' + orderId)) as unknown[]
    if (!orders?.length) {
      return NextResponse.json({ success: false, message: '❌ 해당 주문이 없습니다.' }, { headers })
    }

    const o = orders[0] as { status?: string }
    if (o.status !== 'Approved') {
      return NextResponse.json(
        { success: false, message: '❌ 승인된 주문만 수정할 수 있습니다.' },
        { headers }
      )
    }

    let subtotal = 0
    const validCart = updatedCart
      .filter((i: { code?: string; name?: string; price?: number; qty?: number }) => i && (i.code || i.name))
      .map((i: { code?: string; name?: string; price?: number; qty?: number; spec?: string }) => {
        const qty = Number(i.qty) || 0
        const price = Number(i.price) || 0
        subtotal += price * qty
        return {
          code: String(i.code ?? ''),
          name: String(i.name ?? ''),
          price,
          qty,
          spec: String(i.spec ?? '-'),
        }
      })

    if (validCart.length === 0) {
      return NextResponse.json(
        { success: false, message: '❌ 유효한 품목이 없습니다.' },
        { headers }
      )
    }

    const vat = Math.round(subtotal * 0.07)
    const total = subtotal + vat

    const patch: Record<string, unknown> = {
      cart_json: JSON.stringify(validCart),
      subtotal,
      vat,
      total,
    }
    if (deliveryStatus) {
      patch.delivery_status = deliveryStatus
    }

    await supabaseUpdate('orders', orderId, patch)
    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('updateOrderCart:', e)
    return NextResponse.json(
      { success: false, message: '❌ 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
