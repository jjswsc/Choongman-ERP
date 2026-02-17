import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelectFilter,
  supabaseUpdate,
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
    const isPartialReceive = Boolean(body.isPartialReceive)
    const inspectedIndices: number[] = Array.isArray(body.inspectedIndices) ? body.inspectedIndices : []
    const receivedQtysRaw = body.receivedQtys && typeof body.receivedQtys === 'object' ? body.receivedQtys : null

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
    if (o.delivery_status === '일부배송완료') {
      return NextResponse.json(
        { success: false, message: '❌ 이미 일부 수령 완료된 주문입니다.' },
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

    if (isPartialReceive && inspectedIndices.length === 0) {
      return NextResponse.json(
        { success: false, message: '❌ 수령할 품목을 최소 1개 이상 선택해 주세요.' },
        { headers }
      )
    }

    const store = String(o.store_name || '')
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    const deliveryStatus = isPartialReceive ? '일부배송완료' : '배송완료'

    const getQtyForIdx = (idx: number): number => {
      if (receivedQtysRaw) {
        const v = receivedQtysRaw[String(idx)] ?? receivedQtysRaw[idx]
        if (typeof v === 'number' && v >= 0) return Math.floor(v)
      }
      return Number(cart[idx]?.qty || 0)
    }

    const itemsToInbound = isPartialReceive && inspectedIndices.length > 0
      ? inspectedIndices.map((idx) => {
          const item = cart[idx]
          if (!item) return null
          const qty = getQtyForIdx(idx)
          return { ...item, qty }
        }).filter(Boolean) as { code?: string; name?: string; spec?: string; qty: number }[]
      : cart.map((item, idx) => ({ ...item, qty: getQtyForIdx(idx) }))

    const hasQtyAdjustments = cart.some((c, i) => {
      const orig = Number(c.qty || 0)
      const received = getQtyForIdx(i)
      return received !== orig
    })

    // 매장: 체크된 품목만 Inbound (매장 재고 증가)
    const inboundRows = itemsToInbound.map((item) => ({
      location: store,
      item_code: item.code,
      item_name: item.name || '',
      spec: item.spec || '-',
      qty: Number(item.qty) || 0,
      log_date: today,
      vendor_target: 'From HQ',
      log_type: 'Inbound',
    }))

    // 본사: 체크된 품목만 Outbound (본사 재고 차감)
    const hqOutboundRows = itemsToInbound.map((item) => ({
      location: '본사',
      item_code: item.code,
      item_name: item.name || '',
      spec: item.spec || '-',
      qty: -(Number(item.qty) || 0),
      log_date: today,
      vendor_target: store,
      log_type: 'Outbound',
      order_id: orderId,
    }))

    if (inboundRows.length) {
      await supabaseInsertMany('stock_logs', inboundRows)
    }
    if (hqOutboundRows.length) {
      await supabaseInsertMany('stock_logs', hqOutboundRows)
    }

    const patch: Record<string, unknown> = { delivery_status: deliveryStatus }
    if (isPartialReceive && inspectedIndices.length > 0) {
      patch.received_indices = JSON.stringify(inspectedIndices.sort((a, b) => a - b))
    } else if (!isPartialReceive) {
      patch.received_indices = JSON.stringify(cart.map((_, i) => i))
    }
    if (imageUrl) patch.image_url = imageUrl
    if (hasQtyAdjustments && receivedQtysRaw) {
      const qtyMap: Record<string, number> = {}
      const indices = isPartialReceive && inspectedIndices.length > 0 ? inspectedIndices : cart.map((_, i) => i)
      indices.forEach((idx) => {
        qtyMap[String(idx)] = getQtyForIdx(idx)
      })
      patch.received_qty_json = JSON.stringify(qtyMap)
    }
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
