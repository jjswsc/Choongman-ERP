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
    const userRole = String(body.userRole ?? '').toLowerCase()
    const updatedCart = Array.isArray(body.updatedCart) ? body.updatedCart : null

    if (userRole.includes('manager')) {
      return NextResponse.json(
        { success: false, message: '매장 매니저는 주문 승인/반려 권한이 없습니다.' },
        { headers }
      )
    }

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

    if (decision === 'Approved' && updatedCart && updatedCart.length > 0) {
      type CartItem = { code?: string; name?: string; price?: number; qty?: number; spec?: string; checked?: boolean; originalQty?: number }
      const existingOrder = orders[0] as { cart_json?: string }
      let origCart: { qty?: number }[] = []
      try { origCart = JSON.parse(existingOrder.cart_json || '[]') } catch {}
      const fullCart = updatedCart
        .filter((i: CartItem) => i && (i.code || i.name))
        .map((i: CartItem, idx: number) => {
          const qty = Math.max(0, Math.floor(Number(i.qty ?? 0) || 0))
          const origQty = Number(origCart[idx]?.qty ?? i.originalQty ?? i.qty ?? 0)
          return {
            code: String(i.code ?? ''),
            name: String(i.name ?? ''),
            price: Number(i.price ?? 0),
            qty,
            spec: String(i.spec ?? ''),
            _origQty: origQty,
          }
        })
      const approvedIndices: number[] = []
      updatedCart.forEach((i: CartItem, idx: number) => {
        if (i && (i.code || i.name) && i.checked && (Number(i.qty ?? 0) || 0) > 0) {
          approvedIndices.push(idx)
        }
      })
      const isPartialApproval = approvedIndices.length > 0 && approvedIndices.length < fullCart.length
      if (fullCart.length > 0) {
        let subtotal = 0
        approvedIndices.forEach((idx) => {
          const it = fullCart[idx]
          if (it) subtotal += it.price * it.qty
        })
        const vat = Math.round(subtotal * 0.07)
        type FullCartItem = { code: string; name: string; price: number; qty: number; spec: string }
        const cartForStorage = fullCart.map((it: FullCartItem) => ({
          code: it.code,
          name: it.name,
          price: it.price,
          qty: it.qty,
          spec: it.spec,
        }))
        patch.cart_json = JSON.stringify(cartForStorage)
        patch.subtotal = subtotal
        patch.vat = vat
        patch.total = subtotal + vat
        if (isPartialApproval) {
          patch.delivery_status = '일부배송완료'
          patch.approved_indices = JSON.stringify(approvedIndices.sort((a, b) => a - b))
        }
        const originalQtyMap: Record<string, number> = {}
        fullCart.forEach((it: { _origQty?: number; qty?: number }, idx: number) => {
          if (it._origQty !== undefined && it._origQty !== it.qty) {
            originalQtyMap[String(idx)] = it._origQty
          }
        })
        if (Object.keys(originalQtyMap).length > 0) {
          patch.approved_original_qty_json = JSON.stringify(originalQtyMap)
        }
      }
    }

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
