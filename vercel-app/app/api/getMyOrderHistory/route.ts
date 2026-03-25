import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { ORDERS_MY_HISTORY_COLS } from '@/lib/postgrest-narrow-select'
import { getDirectSettlementMap } from '@/lib/direct-settlement-server'
import { parseListPagination, slicePage, DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination-params'

export interface OrderHistoryItem {
  id: number
  orderRowId: number
  date: string
  deliveryDate: string
  /** 출고지별 배송일 */
  deliveryDatesByOutbound?: Record<string, string>
  summary: string
  total: number
  status: string
  deliveryStatus: string
  items: { name?: string; qty?: number; price?: number; receivedQty?: number; originalQty?: number; code?: string; outboundLocation?: string; index?: number; isDirectSettlement?: boolean }[]
  receivedIndices?: number[]
  userName?: string
  userNick?: string
  rejectReason?: string
  /** 강제 출고(출고 입력에서 직접 입력) 여부 - 발주 없이 본사가 직접 출고한 건 */
  isForceOutbound?: boolean
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || '').trim()
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const { page, pageSize } = parseListPagination(searchParams, null, 20)

  if (!store || !startStr || !endStr) {
    return NextResponse.json(
      { items: [], total: 0, page: 1, pageSize: DEFAULT_LIST_PAGE_SIZE },
      { headers }
    )
  }

  try {
    const startD = new Date(startStr)
    startD.setHours(0, 0, 0, 0)
    const endD = new Date(endStr)
    endD.setHours(23, 59, 59, 999)

    const endIso = endStr + 'T23:59:59.999Z'
    const filter =
      `store_name=eq.${encodeURIComponent(store)}` +
      `&order_date=gte.${encodeURIComponent(startStr)}` +
      `&order_date=lte.${encodeURIComponent(endIso)}`
    const rows = (await supabaseSelectFilter('orders', filter, {
      order: 'order_date.desc',
      limit: 800,
      select: ORDERS_MY_HISTORY_COLS,
    })) as {
      id: number
      order_date?: string
      delivery_date?: string
      delivery_dates_by_outbound?: string
      cart_json?: string
      total?: number
      status?: string
      delivery_status?: string
      received_indices?: string
      received_qty_json?: string
      original_order_qty_json?: string
      user_name?: string
      reject_reason?: string
    }[]

    const itemMap: Record<string, string> = {}
    const priceMap: Record<string, number> = {}
    try {
      const itemRows = (await supabaseSelect('items', {
        select: 'code,outbound_location,price',
        limit: 5000,
      })) as { code?: string; outbound_location?: string; price?: number }[]
      for (const it of itemRows || []) {
        const c = String(it.code || '').trim()
        if (c) {
          itemMap[c] = String(it.outbound_location || '').trim() || '(미지정)'
          priceMap[c] = Number(it.price) || 0
        }
      }
    } catch {}

    const nameToNick: Record<string, string> = {}
    if (store) {
      try {
        const empFilter = `store=eq.${encodeURIComponent(store)}`
        const emps = (await supabaseSelectFilter('employees', empFilter, { select: 'name,nick', limit: 500 })) as { name?: string; nick?: string }[]
        for (const e of emps || []) {
          const n = String(e.name || '').trim()
          if (n) nameToNick[n] = String(e.nick || e.name || '').trim() || n
        }
      } catch {}
    }
    const list: OrderHistoryItem[] = (rows || []).map((o) => {
      let cart: { code?: string; name?: string; qty?: number; price?: number }[] = []
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
      let originalOrderQtyMap: Record<string, number> = {}
      try {
        if (o.original_order_qty_json) originalOrderQtyMap = JSON.parse(o.original_order_qty_json) || {}
      } catch {}
      const isFullReceived = o.delivery_status === '배송완료' || o.delivery_status === '배송 완료'
      const items = cart.map((it, idx) => {
        const origFromMap = originalOrderQtyMap[String(idx)]
        const recQty = receivedQtyMap[String(idx)] ?? receivedQtyMap[idx]
        const isReceived = receivedIndices.includes(idx) || isFullReceived
        const effectiveQty = isReceived && typeof recQty === 'number' ? recQty : Number(it.qty || 0)
        const code = String(it.code || '').trim()
        const outboundLocation = code ? (itemMap[code] || '(미지정)') : '(미지정)'
        return {
          ...it,
          code,
          index: idx,
          qty: Number(it.qty || 0),
          receivedQty: isReceived ? effectiveQty : undefined,
          originalQty: isReceived && origFromMap != null ? origFromMap : undefined,
          outboundLocation,
        }
      })
      const summary =
        cart.length > 0
          ? (cart[0].name || '') + (cart.length > 1 ? ` 외 ${cart.length - 1}건` : '')
          : 'Items'
      const orderDate = o.order_date ? new Date(o.order_date) : new Date()
      let deliveryDatesByOutbound: Record<string, string> | undefined
      try {
        const raw = o.delivery_dates_by_outbound
        if (raw && typeof raw === 'string') {
          const parsed = JSON.parse(raw) as Record<string, string>
          if (parsed && typeof parsed === 'object') deliveryDatesByOutbound = parsed
        }
      } catch {}
      return {
        id: o.id,
        orderRowId: o.id,
        date: orderDate.toISOString().slice(0, 10),
        deliveryDate: String(o.delivery_date || '').trim(),
        deliveryDatesByOutbound,
        summary,
        total: Number(o.total) || 0,
        status: o.status || 'Pending',
        deliveryStatus: (() => {
          const ds = o.delivery_status === '일부 배송 완료' ? '일부배송완료' : (o.delivery_status || '').trim()
          if (ds === '배송완료' || ds === '배송 완료' || ds === '일부배송완료') return ds
          if (o.received_indices) {
            const recIdx = Array.isArray(receivedIndices) ? receivedIndices : []
            return recIdx.length >= cart.length ? '배송완료' : '일부배송완료'
          }
          return o.status === 'Approved' ? '배송중' : ''
        })(),
        items,
        receivedIndices,
        userName: String(o.user_name || '').trim() || undefined,
        userNick: nameToNick[String(o.user_name || '').trim()] || undefined,
        rejectReason: String(o.reject_reason || '').trim() || undefined,
      }
    })

    // 강제 출고(ForcePush) 병합: 출고 입력에서 직접 입력한 건 - stock_logs
    try {
      const fpFilter =
        `location=eq.${encodeURIComponent(store)}` +
        `&log_type=eq.ForcePush`
      const forcePushRows = (await supabaseSelectFilter('stock_logs', fpFilter, {
        order: 'log_date.desc',
        limit: 400,
        select: 'log_date,item_code,item_name,qty,delivery_status',
      })) as {
        log_date?: string
        item_code?: string
        item_name?: string
        qty?: number
        delivery_status?: string
      }[]

      const groups = new Map<string, typeof forcePushRows>()
      for (const row of forcePushRows || []) {
        const rowDate = new Date(row.log_date || '')
        if (isNaN(rowDate.getTime()) || rowDate < startD || rowDate > endD) continue
        const key = rowDate.toISOString() + '\t' + (row.delivery_status || '')
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(row)
      }

      for (const [, batch] of groups) {
        const first = batch[0]
        const rowDate = new Date(first.log_date || '')
        const items = batch.map((r, idx) => {
          const code = String(r.item_code || '').trim()
          const qty = Math.abs(Number(r.qty) || 0)
          const price = priceMap[code] ?? 0
          return {
            name: String(r.item_name || '').trim(),
            code,
            qty,
            price,
            receivedQty: qty,
            outboundLocation: code ? (itemMap[code] || '(미지정)') : '(미지정)',
            index: idx,
          }
        })
        const total = items.reduce((s, i) => s + (i.price ?? 0) * (i.qty ?? 0), 0)
        const summary =
          items.length > 0
            ? (items[0].name || '') + (items.length > 1 ? ` 외 ${items.length - 1}건` : '')
            : '강제출고'
        const deliveryDate =
          first.delivery_status && /^\d{4}-\d{2}-\d{2}/.test(String(first.delivery_status))
            ? String(first.delivery_status).slice(0, 10)
            : rowDate.toISOString().slice(0, 10)

        list.push({
          id: -Math.abs(rowDate.getTime()),
          orderRowId: 0,
          date: rowDate.toISOString().slice(0, 10),
          deliveryDate,
          summary,
          total,
          status: 'Approved',
          deliveryStatus: '배송완료',
          items,
          receivedIndices: items.map((_, i) => i),
          isForceOutbound: true,
        })
      }
    } catch (fpErr) {
      console.error('getMyOrderHistory ForcePush merge:', fpErr)
    }

    list.sort((a, b) => {
      const da = new Date(a.date + 'T' + (a.deliveryDate || '00:00:00'))
      const db = new Date(b.date + 'T' + (b.deliveryDate || '00:00:00'))
      return db.getTime() - da.getTime()
    })

    const total = list.length
    const items = slicePage(list, page, pageSize)
    return NextResponse.json({ items, total, page, pageSize }, { headers })
  } catch (e) {
    console.error('getMyOrderHistory:', e)
    return NextResponse.json(
      { items: [], total: 0, page, pageSize },
      { headers }
    )
  }
}
