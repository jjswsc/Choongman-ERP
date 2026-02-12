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
  items: { name?: string; qty?: number; price?: number }[]
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
    }[]

    const list: OrderHistoryItem[] = (rows || []).map((o) => {
      let cart: { name?: string; qty?: number; price?: number }[] = []
      try {
        cart = JSON.parse(o.cart_json || '[]')
      } catch {}
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
        deliveryStatus: o.delivery_status || (o.status === 'Approved' ? '배송중' : ''),
        items: cart,
      }
    })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getMyOrderHistory:', e)
    return NextResponse.json([], { headers })
  }
}
