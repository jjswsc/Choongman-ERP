import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'
import { parseOr400, processOrderSchema } from '@/lib/api-validate'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const body = await request.json()
    const bodyForValidation = { ...body, storeName: body.storeName || body.store || '', userName: body.userName || body.user || '' }
    const validated = parseOr400(processOrderSchema, bodyForValidation, headers)
    if (validated.errorResponse) return validated.errorResponse
    const { storeName, userName, cart } = validated.parsed

    let sub = 0
    for (let i = 0; i < cart.length; i++) {
      const item = cart[i] as { price?: number; qty?: number }
      sub += Number(item.price || 0) * Number(item.qty || 0)
    }
    const vat = Math.round(sub * 0.07)
    const total = sub + vat

    await supabaseInsert('orders', {
      order_date: new Date().toISOString(),
      store_name: storeName,
      user_name: userName,
      cart_json: JSON.stringify(cart),
      subtotal: sub,
      vat,
      total,
      status: 'Pending',
    })

    return NextResponse.json({ success: true, message: '✅ 주문 완료' }, { headers })
  } catch (e) {
    console.error('processOrder:', e)
    return NextResponse.json(
      { success: false, message: '❌ 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
