import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('startDate') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('endDate') || '').trim()

  let s = startStr
  let e = endStr
  if (!s || !e) {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    s = first.toISOString().slice(0, 10)
    e = last.toISOString().slice(0, 10)
  }

  try {
    const endIso = e + 'T23:59:59.999Z'
    const filter =
      `order_date=gte.${encodeURIComponent(s)}&order_date=lte.${encodeURIComponent(endIso)}`
    const rows = (await supabaseSelectFilter('orders', filter, {
      order: 'order_date.desc',
      limit: 300,
    })) as {
      id: number
      order_date?: string
      store_name?: string
      cart_json?: string
      total?: number
      status?: string
      delivery_status?: string
      delivery_date?: string
    }[]

    const list = (rows || []).map((o) => {
      let items: { code?: string; name?: string; spec?: string; qty?: number; price?: number }[] = []
      try {
        items = JSON.parse(o.cart_json || '[]')
      } catch {}
      const summary =
        items.length > 0
          ? (items[0].name || '') + (items.length > 1 ? ` 외 ${items.length - 1}건` : '')
          : '내용 없음'
      const dateVal = o.order_date
      const dateStr = dateVal ? String(dateVal).substring(0, 16).replace('T', ' ') : ''
      return {
        row: o.id,
        orderId: o.id,
        date: dateStr,
        store: o.store_name || '',
        total: Number(o.total) || 0,
        status: o.status || 'Pending',
        deliveryStatus: o.delivery_status || (o.status === 'Approved' ? '배송중' : ''),
        deliveryDate: String(o.delivery_date || '').trim(),
        items,
        summary,
      }
    })

    return NextResponse.json({ list }, { headers })
  } catch (err) {
    console.error('getAdminOrders:', err)
    return NextResponse.json({ list: [] }, { headers })
  }
}
