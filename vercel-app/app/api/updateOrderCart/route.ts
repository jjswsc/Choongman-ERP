import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { sanitizeCartLineRemarks } from '@/lib/outbound-order-line-match'

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
    const receivedIndices = Array.isArray(body.receivedIndices) ? body.receivedIndices as number[] : null

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

    const orders = (await supabaseSelectFilter('orders', 'id=eq.' + orderId, {
      limit: 1,
      select: 'status,cart_json,store_name,delivery_date,order_date',
    })) as unknown[]
    if (!orders?.length) {
      return NextResponse.json({ success: false, message: '❌ 해당 주문이 없습니다.' }, { headers })
    }

    const o = orders[0] as { status?: string; cart_json?: string; store_name?: string; delivery_date?: string; order_date?: string }
    if (o.status !== 'Approved') {
      return NextResponse.json(
        { success: false, message: '❌ 승인된 주문만 수정할 수 있습니다.' },
        { headers }
      )
    }

    let validCart: { code: string; name: string; price: number; qty: number; spec: string; line_remarks?: string }[]
    if (receivedIndices && receivedIndices.length > 0) {
      let origCart: { code?: string; name?: string; price?: number; qty?: number; spec?: string; line_remarks?: string; lineRemarks?: string }[] = []
      try {
        origCart = JSON.parse(o.cart_json || '[]')
      } catch {}
      const merged = [...origCart]
      updatedCart.forEach((item: { code?: string; name?: string; price?: number; qty?: number; spec?: string; line_remarks?: string; lineRemarks?: string }, i: number) => {
        const idx = receivedIndices[i]
        if (idx !== undefined && idx >= 0 && idx < merged.length) {
          const lineRemarks = sanitizeCartLineRemarks(
            item.line_remarks ?? item.lineRemarks ?? merged[idx].line_remarks ?? merged[idx].lineRemarks
          )
          merged[idx] = {
            code: String(item.code ?? merged[idx].code ?? ''),
            name: String(item.name ?? merged[idx].name ?? ''),
            price: Number(item.price ?? merged[idx].price ?? 0),
            qty: Number(item.qty ?? merged[idx].qty ?? 0),
            spec: String(item.spec ?? merged[idx].spec ?? '-'),
            ...(lineRemarks ? { line_remarks: lineRemarks } : {}),
          }
        }
      })
      validCart = merged.map((i) => {
        const lr = sanitizeCartLineRemarks(i.line_remarks ?? i.lineRemarks)
        return {
          code: String(i.code ?? ''),
          name: String(i.name ?? ''),
          price: Number(i.price ?? 0),
          qty: Number(i.qty ?? 0),
          spec: String(i.spec ?? '-'),
          ...(lr ? { line_remarks: lr } : {}),
        }
      })
    } else {
      validCart = updatedCart
        .filter((i: { code?: string; name?: string; price?: number; qty?: number }) => i && (i.code || i.name))
        .map((i: { code?: string; name?: string; price?: number; qty?: number; spec?: string; line_remarks?: string; lineRemarks?: string }) => {
          const lr = sanitizeCartLineRemarks(i.line_remarks ?? i.lineRemarks)
          return {
            code: String(i.code ?? ''),
            name: String(i.name ?? ''),
            price: Number(i.price ?? 0),
            qty: Number(i.qty ?? 0),
            spec: String(i.spec ?? '-'),
            ...(lr ? { line_remarks: lr } : {}),
          }
        })
    }
    let subtotal = 0
    validCart.forEach((i) => { subtotal += i.price * i.qty })

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
