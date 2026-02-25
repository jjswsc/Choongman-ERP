import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

export interface OutboundHistoryItem {
  date: string
  target: string
  type: 'Force' | 'Outbound'
  name: string
  code: string
  spec: string
  qty: number
  amount: number
  orderRowId?: string
  deliveryStatus?: string
  deliveryDate?: string
  orderDate?: string
  invoiceNo?: string
  receiveImageUrl?: string
  receivedIndices?: number[]
  totalOrderItems?: number
  /** 원본 주문 수량 (수령 시 조정된 경우 표시용) */
  originalOrderQty?: number
  /** 품목별 출고지(창고) - items.outbound_location */
  outboundLocation?: string
  /** 미수령 품목 여부 (부분 배송 시 누락 품목 표시용) */
  isUnreceived?: boolean
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const vendorFilter = String(searchParams.get('vendorFilter') || searchParams.get('vendor') || 'All').trim()
  const typeFilter = String(searchParams.get('typeFilter') || searchParams.get('type') || 'All').trim()

  if (!startStr || !endStr) {
    return NextResponse.json([], { headers })
  }

  try {
    const items = (await supabaseSelect('items', { order: 'id.asc', select: 'code,spec,price,outbound_location' })) as { code?: string; spec?: string; price?: number; outbound_location?: string }[]
    const itemMap: Record<string, { spec: string; price: number; outboundLocation: string }> = {}
    for (const it of items || []) {
      const c = String(it.code || '').trim()
      itemMap[c] = {
        spec: String(it.spec || '').trim() || '-',
        price: Number(it.price) || 0,
        outboundLocation: String(it.outbound_location || '').trim() || '(미지정)',
      }
    }

    const allLogs = (await supabaseSelect('stock_logs', { order: 'log_date.desc', limit: 500 })) as {
      log_type?: string
      log_date?: string
      vendor_target?: string
      item_code?: string
      item_name?: string
      qty?: number
      order_id?: number
      delivery_status?: string
    }[]

    const startDate = new Date(startStr)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(endStr)
    endDate.setHours(23, 59, 59, 999)

    const list: OutboundHistoryItem[] = []
    for (const row of allLogs || []) {
      const type = String(row.log_type || '')
      if (type !== 'Outbound' && type !== 'ForceOutbound') continue

      const rowDate = new Date(row.log_date || '')
      if (isNaN(rowDate.getTime()) || rowDate < startDate || rowDate > endDate) continue

      const target = String(row.vendor_target || '')
      if (vendorFilter && vendorFilter !== 'All' && vendorFilter !== '전체 매출처' && target !== vendorFilter) continue

      const typeCode = type === 'ForceOutbound' ? 'Force' : 'Outbound'
      const filterOk =
        !typeFilter ||
        typeFilter === 'All' ||
        typeCode === typeFilter ||
        (typeFilter === 'Order' && typeCode === 'Outbound')
      if (!filterOk) continue

      const code = String(row.item_code || '').trim()
      const info = itemMap[code] || { spec: '-', price: 0, outboundLocation: '(미지정)' }
      const orderRowId = typeCode === 'Outbound' && row.order_id ? String(row.order_id) : ''
      const deliveryStatus =
        row.delivery_status && String(row.delivery_status).trim()
          ? String(row.delivery_status).trim()
          : typeCode === 'Outbound'
            ? '배송중'
            : ''
      const dateStr = rowDate.toISOString().slice(0, 10)
      const deliveryDateStr =
        typeCode === 'Force'
          ? rowDate.toISOString().slice(0, 16).replace('T', ' ')
          : ''

      const deliveryDateForItem =
        typeCode === 'Force' && row.delivery_status && String(row.delivery_status).match(/^\d{4}-\d{2}-\d{2}/)
          ? String(row.delivery_status).substring(0, 10)
          : typeCode === 'Force'
            ? deliveryDateStr || undefined
            : undefined
      list.push({
        date: dateStr,
        target,
        type: typeCode,
        name: String(row.item_name || '').trim(),
        code,
        spec: info.spec,
        qty: Math.abs(Number(row.qty) || 0),
        amount: info.price * Math.abs(Number(row.qty) || 0),
        orderRowId: orderRowId || undefined,
        deliveryStatus: deliveryStatus || undefined,
        deliveryDate: deliveryDateForItem || undefined,
        outboundLocation: info.outboundLocation,
      })
      if (list.length >= 500) break
    }

    const keyToInv: Record<string, string> = {}
    for (const r of list) {
      const key = r.date + '\t' + r.target + '\t' + r.type + (r.orderRowId ? '\t' + r.orderRowId : '')
      if (keyToInv[key] === undefined) {
        const datePart = r.date.replace(/\D/g, '').slice(0, 8)
        const seq = Object.keys(keyToInv).filter((k) => k.startsWith(r.date)).length + 1
        keyToInv[key] = `IV${datePart}-${String(seq).padStart(2, '0')}`
      }
      r.invoiceNo = keyToInv[key]
    }

    const orderRowIds = list
      .map((r) => r.orderRowId)
      .filter((id): id is string => !!id)
      .filter((id, i, arr) => arr.indexOf(id) === i)

    if (orderRowIds.length > 0) {
      const orderMap: Record<string, {
        store_name?: string
        delivery_status?: string
        image_url?: string
        delivery_date?: string
        delivery_dates_by_outbound?: Record<string, string>
        order_date?: string
        received_indices?: number[]
        received_qty_json?: Record<string, number>
        original_order_qty_json?: Record<string, number>
        cart?: { code?: string; name?: string; spec?: string; qty?: number; price?: number }[]
      }> = {}

      for (const oid of orderRowIds) {
        const ords = (await supabaseSelectFilter('orders', `id=eq.${oid}`)) as {
          delivery_status?: string
          image_url?: string
          delivery_date?: string
          delivery_dates_by_outbound?: string
          order_date?: string
          received_indices?: string | number[]
          received_qty_json?: string
          original_order_qty_json?: string
          cart_json?: string
        }[]
        if (ords && ords.length > 0) {
          const o = ords[0]
          let recIdx: number[] = []
          try {
            if (o.received_indices) {
              recIdx = Array.isArray(o.received_indices)
                ? o.received_indices
                : JSON.parse(String(o.received_indices))
            }
          } catch {}
          let recQtyMap: Record<string, number> = {}
          try {
            if (o.received_qty_json) recQtyMap = JSON.parse(String(o.received_qty_json)) || {}
          } catch {}
          let origQtyMap: Record<string, number> = {}
          try {
            if (o.original_order_qty_json) origQtyMap = JSON.parse(String(o.original_order_qty_json)) || {}
          } catch {}
          let cart: { code?: string; name?: string; qty?: number }[] = []
          try {
            if (o.cart_json) cart = JSON.parse(o.cart_json) || []
          } catch {}
          let deliveryDatesByOutbound: Record<string, string> | undefined
          try {
            const raw = (o as { delivery_dates_by_outbound?: string }).delivery_dates_by_outbound
            if (raw && typeof raw === 'string') {
              const parsed = JSON.parse(raw) as Record<string, string>
              if (parsed && typeof parsed === 'object') deliveryDatesByOutbound = parsed
            }
          } catch {}
          orderMap[String(oid)] = {
            store_name: (o as { store_name?: string }).store_name,
            delivery_status: o.delivery_status,
            image_url: o.image_url,
            delivery_date: o.delivery_date,
            delivery_dates_by_outbound: deliveryDatesByOutbound,
            order_date: o.order_date,
            received_indices: recIdx,
            received_qty_json: Object.keys(recQtyMap).length > 0 ? recQtyMap : undefined,
            original_order_qty_json: Object.keys(origQtyMap).length > 0 ? origQtyMap : undefined,
            cart,
          }
        }
      }

      for (const r of list) {
        const key = r.orderRowId
        if (!key || !orderMap[key]) continue
        const o = orderMap[key]
        if (o.order_date) r.orderDate = o.order_date.slice(0, 10)
        if (o.delivery_status === '배송완료' || o.delivery_status === '일부배송완료' || o.delivery_status === '일부 배송 완료') {
          r.deliveryStatus = o.delivery_status === '일부 배송 완료' ? '일부배송완료' : o.delivery_status
        }
        if (o.image_url && (o.image_url.indexOf('http') === 0 || o.image_url.indexOf('data:image') === 0)) {
          r.receiveImageUrl = o.image_url
        }
        const outboundLoc = r.outboundLocation || '(미지정)'
        const perOutbound = o.delivery_dates_by_outbound?.[outboundLoc]
        if (perOutbound) r.deliveryDate = perOutbound.slice(0, 16)
        else if (o.delivery_date) r.deliveryDate = o.delivery_date.slice(0, 16)
        if (o.received_indices && o.received_indices.length > 0) {
          r.receivedIndices = o.received_indices
          r.totalOrderItems = (o.cart && o.cart.length) ? o.cart.length : o.received_indices.length
        }
      }

      const filteredList: OutboundHistoryItem[] = []
      const usedByOrder: Record<string, boolean> = {}
      for (const r of list) {
        const key = r.orderRowId
        if (!key || !orderMap[key]) {
          filteredList.push(r)
          continue
        }
        const o = orderMap[key]
        if (!o.received_indices || o.received_indices.length === 0) {
          filteredList.push(r)
          continue
        }
        const cart = o.cart || []
        const code = String(r.code || '').trim()
        const name = String(r.name || '').trim()
        let matchIdx = -1
        for (let ci = 0; ci < cart.length; ci++) {
          const c = cart[ci]
          if (String(c.code || '').trim() === code && String(c.name || '').trim() === name) {
            if (o.received_indices!.indexOf(ci) !== -1) {
              matchIdx = ci
              break
            }
          }
        }
        if (matchIdx === -1) continue
        const uk = key + '_' + matchIdx
        if (usedByOrder[uk]) continue
        usedByOrder[uk] = true
        const cartItem = cart[matchIdx]
        const originalQty = o.original_order_qty_json?.[String(matchIdx)] ?? Number(cartItem?.qty ?? 0)
        if (originalQty > 0 && originalQty !== r.qty) {
          r.originalOrderQty = originalQty
        }
        filteredList.push(r)
      }

      // 부분 배송 주문: 미수령 품목도 출고 목록에 추가 (어떤 품목이 누락되었는지 확인 가능하도록)
      const sampleByOrder: Record<string, OutboundHistoryItem> = {}
      for (const r of filteredList) {
        if (r.orderRowId && !sampleByOrder[r.orderRowId]) sampleByOrder[r.orderRowId] = r
      }
      for (const oid of orderRowIds) {
        const o = orderMap[oid]
        if (!o?.received_indices?.length || !o.cart?.length) continue
        const recIdxSet = new Set(o.received_indices)
        const target = String(o.store_name || '').trim()
        if (!target) continue
        const sample = sampleByOrder[oid]
        const baseDate = sample?.date || (o.order_date?.slice(0, 10) ?? '')
        const baseInvoiceNo = sample?.invoiceNo ?? ''
        for (let ci = 0; ci < o.cart.length; ci++) {
          if (recIdxSet.has(ci)) continue
          const c = o.cart[ci]
          if (!c || !c.name) continue
          const code = String(c.code || '').trim()
          const info = itemMap[code] || { spec: '-', price: 0, outboundLocation: '(미지정)' }
          const qty = Number(c.qty || 0)
          const amount = info.price * qty
          filteredList.push({
            date: baseDate,
            target,
            type: 'Outbound',
            name: String(c.name || '').trim(),
            code,
            spec: String(c.spec || info.spec || '').trim() || '-',
            qty,
            amount,
            orderRowId: oid,
            deliveryStatus: '미수령',
            deliveryDate: o.delivery_date?.slice(0, 16),
            orderDate: o.order_date?.slice(0, 10),
            invoiceNo: baseInvoiceNo,
            receiveImageUrl: o.image_url,
            outboundLocation: info.outboundLocation,
            originalOrderQty: qty,
            isUnreceived: true,
          })
        }
      }

      return NextResponse.json(filteredList, { headers })
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getCombinedOutboundHistory:', e)
    return NextResponse.json([], { headers })
  }
}
