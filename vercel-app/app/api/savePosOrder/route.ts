import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'

/** 주문 번호 생성 (POS-YYYYMMDD-HHMMSS-랜덤) */
function generateOrderNo(storeCode: string): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '')
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${storeCode || 'ST'}-${dateStr}-${timeStr}-${rnd}`
}

/** POS 주문 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const storeCode = String(body.storeCode ?? '').trim()
    const orderType = String(body.orderType ?? 'dine_in')
    const tableName = String(body.tableName ?? '')
    const memo = String(body.memo ?? '').trim()
    const items = Array.isArray(body.items) ? body.items : []

    if (items.length === 0) {
      return NextResponse.json({ success: false, message: '주문 항목이 없습니다.' }, { headers })
    }

    let subtotal = 0
    for (const it of items) {
      const price = Number(it.price ?? 0)
      const qty = Number(it.qty ?? 1)
      subtotal += price * qty
    }
    const vat = 0
    const total = subtotal + vat

    const orderNo = generateOrderNo(storeCode)
    const row = {
      order_no: orderNo,
      store_code: storeCode,
      order_type: orderType,
      table_name: tableName,
      memo,
      items_json: JSON.stringify(items),
      subtotal,
      vat,
      total,
      status: 'pending',
    }
    const inserted = await supabaseInsert('pos_orders', row) as { id?: number }[]
    const created = Array.isArray(inserted) ? inserted[0] : inserted

    return NextResponse.json({
      success: true,
      orderId: created?.id,
      orderNo,
    }, { headers })
  } catch (e) {
    console.error('savePosOrder:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
