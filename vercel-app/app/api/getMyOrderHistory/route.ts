import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export interface OrderHistoryItem {
  id: number
  orderRowId: number
  date: string
  deliveryDate: string
  summary: string
  total: number
  status: string
  deliveryStatus: string
  items: { name?: string; qty?: number; price?: number; receivedQty?: number }[]
  receivedIndices?: number[]
  userName?: string
  rejectReason?: string
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || '').trim()
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()

  if (!store || !startStr || !endStr) {
    return NextResponse.json([], { headers })
  }

  try {
    const endIso = endStr + 'T23:59:59.999Z'
    const filter =
      `store_name=eq.${encodeURIComponent(store)}` +
      `&order_date=gte.${encodeURIComponent(startStr)}` +
      `&order_date=lte.${encodeURIComponent(endIso)}`
    const rows = (await supabaseSelectFilter('orders', filter, {
      order: 'order_date.desc',
      limit: 300,
    })) as {
      id: number
      order_date?: string
      delivery_date?: string
      cart_json?: string
      total?: number
      status?: string
      delivery_status?: string
      received_indices?: string
      received_qty_json?: string
      user_name?: string
      reject_reason?: string
    }[]

    const list: OrderHistoryItem[] = (rows || []).map((o) => {
      let cart: { name?: string; qty?: number; price?: number }[] = []
      try {
        cart = JSON.parse(o.cart_json || '[]')
      } catch {}
      let receivedIndices: number[] = []
      try {
        if (o.received_indices) receivedIndices = JSON.parse(o.received_indices)
      } catch {}
      let receivedQtyMap: Record<string, number> = {}
      try {
        if (o.received_qty_json) receivedQtyMap = JSON.parse(o.received_qty_json) || {}
      } catch {}
      const isFullReceived = o.delivery_status === '배송완료' || o.delivery_status === '배송 완료'
      const items = cart.map((it, idx) => {
        const origQty = Number(it.qty || 0)
        const recQty = receivedQtyMap[String(idx)] ?? receivedQtyMap[idx]
        const isReceived = receivedIndices.includes(idx) || isFullReceived
        const effectiveQty = isReceived && typeof recQty === 'number' ? recQty : origQty
        return { ...it, qty: origQty, receivedQty: isReceived ? effectiveQty : undefined }
      })
      const summary =
        cart.length > 0
          ? (cart[0].name || '') + (cart.length > 1 ? ` 외 ${cart.length - 1}건` : '')
          : 'Items'
      const orderDate = o.order_date ? new Date(o.order_date) : new Date()
      return {
        id: o.id,
        orderRowId: o.id,
        date: orderDate.toISOString().slice(0, 10),
        deliveryDate: String(o.delivery_date || '').trim(),
        summary,
        total: Number(o.total) || 0,
        status: o.status || 'Pending',
        deliveryStatus: (o.received_indices ? '일부배송완료' : null) ?? (o.delivery_status === '일부 배송 완료' ? '일부배송완료' : o.delivery_status) ?? (o.status === 'Approved' ? '배송중' : ''),
        items,
        receivedIndices,
        userName: String(o.user_name || '').trim() || undefined,
        rejectReason: String(o.reject_reason || '').trim() || undefined,
      }
    })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getMyOrderHistory:', e)
    return NextResponse.json([], { headers })
  }
}
