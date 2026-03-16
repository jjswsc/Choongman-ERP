import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { getDirectSettlementMap } from '@/lib/direct-settlement-server'

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
  /** @deprecated use receiveImageUrls[0] - 첫 번째 수령 사진 (썸네일용) */
  receiveImageUrl?: string
  /** 수령 사진 URL 배열 (다중 지원) */
  receiveImageUrls?: string[]
  receivedIndices?: number[]
  totalOrderItems?: number
  /** 원본 주문 수량 (수령 시 조정된 경우 표시용) - 하위 호환 */
  originalOrderQty?: number
  /** 수량 변경 이력 [원본, 승인후?, 수령후] - 3단계 표기용 */
  qtyStages?: number[]
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

    // DB에서 출고(Outbound/ForceOutbound)만 필터 + 기간 필터 → 다른 로그(Inbound/Usage 등) 500건에 묻혀 조회 누락 방지
    const dateRange = `log_date=gte.${startStr}&log_date=lte.${endStr}T23:59:59.999`
    const vendorPart =
      vendorFilter && vendorFilter !== 'All' && vendorFilter !== '전체 매출처'
        ? `&vendor_target=eq.${encodeURIComponent(vendorFilter)}`
        : ''
    const baseFilter = dateRange + vendorPart

    const [outboundLogs, forceLogs] = await Promise.all([
      supabaseSelectFilter('stock_logs', `log_type=eq.Outbound&${baseFilter}`, {
        order: 'log_date.desc',
        limit: 500,
      }),
      supabaseSelectFilter('stock_logs', `log_type=eq.ForceOutbound&${baseFilter}`, {
        order: 'log_date.desc',
        limit: 500,
      }),
    ])

    const allLogs = [
      ...((outboundLogs || []) as { log_type?: string; log_date?: string; vendor_target?: string; item_code?: string; item_name?: string; qty?: number; order_id?: number; delivery_status?: string }[]),
      ...((forceLogs || []) as { log_type?: string; log_date?: string; vendor_target?: string; item_code?: string; item_name?: string; qty?: number; order_id?: number; delivery_status?: string }[]),
    ].sort((a, b) => new Date(b.log_date || 0).getTime() - new Date(a.log_date || 0).getTime())

    const startDate = new Date(startStr)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(endStr)
    endDate.setHours(23, 59, 59, 999)

    const list: OutboundHistoryItem[] = []

    // 승인된 주문 중 아직 수령 전인 건도 목록에 포함 (주문 직후 인보이스 인쇄 가능)
    const typeFilterOkForOrder =
      !typeFilter || typeFilter === 'All' || typeFilter === 'Order'
    if (typeFilterOkForOrder) {
      const orderDateFilter = `status=eq.Approved&order_date=gte.${startStr}&order_date=lte.${endStr}T23:59:59.999`
      const deliveryDateFilter = `status=eq.Approved&delivery_date=gte.${startStr}&delivery_date=lte.${endStr}`
      const [ordersByOrderDate, ordersByDeliveryDate] = await Promise.all([
        supabaseSelectFilter('orders', orderDateFilter, { limit: 200 }),
        supabaseSelectFilter('orders', deliveryDateFilter, { limit: 200 }),
      ])
      const seenOrderIds = new Set<number>()
      const approvedOrders = [
        ...(ordersByOrderDate || []),
        ...(ordersByDeliveryDate || []),
      ] as {
        id?: number
        store_name?: string
        order_date?: string
        delivery_date?: string
        cart_json?: string
        received_indices?: string | number[] | null
      }[]
      for (const o of approvedOrders) {
        const oid = o.id
        if (!oid || seenOrderIds.has(oid)) continue
        const recIdx = o.received_indices
        const hasReceived =
          recIdx != null &&
          (Array.isArray(recIdx) ? recIdx.length > 0 : (() => {
            try {
              const parsed = typeof recIdx === 'string' ? JSON.parse(recIdx) : recIdx
              return Array.isArray(parsed) && parsed.length > 0
            } catch {
              return false
            }
          })())
        if (hasReceived) continue
        seenOrderIds.add(oid)

        const target = String(o.store_name || '').trim()
        if (vendorFilter && vendorFilter !== 'All' && vendorFilter !== '전체 매출처' && target !== vendorFilter) continue

        let cart: { code?: string; name?: string; spec?: string; qty?: number; price?: number }[] = []
        try {
          if (o.cart_json) cart = JSON.parse(o.cart_json) || []
        } catch {}
        const orderDateStr = (o.order_date || '').slice(0, 10)
        const deliveryDateStr = (o.delivery_date || '').slice(0, 16)
        for (const p of cart) {
          const code = String(p.code || '').trim()
          const name = String(p.name || '').trim()
          if (!code || !name) continue
          const qty = Math.abs(Number(p.qty) || 0)
          if (qty <= 0) continue
          const info = itemMap[code] || { spec: '-', price: 0, outboundLocation: '(미지정)' }
          const price = Number(p.price) ?? info.price
          const amount = price * qty
          list.push({
            date: orderDateStr,
            target,
            type: 'Outbound',
            name,
            code,
            spec: String(p.spec || info.spec || '').trim() || '-',
            qty,
            amount,
            orderRowId: String(oid),
            deliveryStatus: '배송중',
            deliveryDate: deliveryDateStr || undefined,
            orderDate: orderDateStr || undefined,
            outboundLocation: info.outboundLocation,
          })
        }
      }
    }

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

    list.sort((a, b) => {
      const da = a.orderDate || a.date
      const db = b.orderDate || b.date
      if (da !== db) return db.localeCompare(da)
      const ta = (a.target || '').localeCompare(b.target || '')
      if (ta !== 0) return ta
      return (b.orderRowId || '').localeCompare(a.orderRowId || '')
    })

    // 인보이스 번호: IV{yyyymmdd}-{orderId} (미수금 탭과 동일, 물류·회계 혼동 방지)
    for (const r of list) {
      if (r.orderRowId) {
        const datePart = r.date.replace(/\D/g, '').slice(0, 8)
        r.invoiceNo = `IV${datePart}-${r.orderRowId}`
      }
    }

    const orderRowIds = list
      .map((r) => r.orderRowId)
      .filter((id): id is string => !!id)
      .filter((id, i, arr) => arr.indexOf(id) === i)

    if (orderRowIds.length > 0) {
      const orderMap: Record<string, {
        store_name?: string
        delivery_status?: string
        delivery_date?: string
        delivery_dates_by_outbound?: Record<string, string>
        order_date?: string
        received_indices?: number[]
        received_qty_json?: Record<string, number>
        original_order_qty_json?: Record<string, number>
        approved_original_qty_json?: Record<string, number>
        cart?: { code?: string; name?: string; spec?: string; qty?: number; price?: number }[]
      }> = {}

      // image_url 제외하여 대용량 수령 사진 전송 방지, 일괄 조회로 N+1 해소
      const idsFilter = `id=in.(${orderRowIds.join(',')})`
      const selectCols = 'id,store_name,delivery_status,delivery_date,delivery_dates_by_outbound,order_date,received_indices,received_qty_json,original_order_qty_json,approved_original_qty_json,cart_json'
      const ordsAll = (await supabaseSelectFilter('orders', idsFilter, {
        select: selectCols,
        limit: orderRowIds.length + 10,
      })) as {
        id?: number
        delivery_status?: string
        delivery_date?: string
        delivery_dates_by_outbound?: string
        order_date?: string
        received_indices?: string | number[]
        received_qty_json?: string
        original_order_qty_json?: string
        approved_original_qty_json?: string
        cart_json?: string
      }[]

      for (const o of ordsAll || []) {
        const oid = String(o.id ?? '')
        if (!oid) continue
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
        let approvedOrigQtyMap: Record<string, number> = {}
        try {
          if (o.approved_original_qty_json) approvedOrigQtyMap = JSON.parse(String(o.approved_original_qty_json)) || {}
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
        orderMap[oid] = {
          store_name: (o as { store_name?: string }).store_name,
          delivery_status: o.delivery_status,
          delivery_date: o.delivery_date,
          delivery_dates_by_outbound: deliveryDatesByOutbound,
          order_date: o.order_date,
          received_indices: recIdx,
          received_qty_json: Object.keys(recQtyMap).length > 0 ? recQtyMap : undefined,
          original_order_qty_json: Object.keys(origQtyMap).length > 0 ? origQtyMap : undefined,
          approved_original_qty_json: Object.keys(approvedOrigQtyMap).length > 0 ? approvedOrigQtyMap : undefined,
          cart,
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
        // receiveImageUrls는 클릭 시 getOrderReceivePhoto에서 별도 로드
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
        const finalQty = r.qty
        const recQty = o.received_qty_json?.[String(matchIdx)] ?? finalQty
        const origAtReceive = o.original_order_qty_json?.[String(matchIdx)]
        const approvedOrig = o.approved_original_qty_json?.[String(matchIdx)]
        const cartQty = Number(cartItem?.qty ?? 0)
        const qtyStages: number[] = []
        if (approvedOrig != null && approvedOrig !== cartQty) {
          qtyStages.push(approvedOrig)
        }
        const midQty = origAtReceive ?? cartQty
        if (qtyStages.length > 0) {
          if (midQty !== approvedOrig && midQty !== finalQty) qtyStages.push(midQty)
        } else if (origAtReceive != null && origAtReceive !== finalQty) {
          qtyStages.push(origAtReceive)
        }
        if (qtyStages.length > 0 && finalQty !== (qtyStages[qtyStages.length - 1] ?? 0)) {
          qtyStages.push(finalQty)
        }
        if (qtyStages.length >= 2) {
          r.qtyStages = qtyStages
          if (qtyStages.length === 2) r.originalOrderQty = qtyStages[0]
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
            outboundLocation: info.outboundLocation,
            originalOrderQty: qty,
            isUnreceived: true,
          })
        }
      }

      // 직접정산(지두방) 품목: 인보이스 금액에서 제외 (가격 0 처리)
      const codes = [...new Set(filteredList.map((r) => r.code).filter(Boolean))]
      const directMap = codes.length ? await getDirectSettlementMap(codes) : {}
      for (const r of filteredList) {
        if (r.code && directMap[r.code]) r.amount = 0
      }

      return NextResponse.json(filteredList, { headers })
    }

    // 직접정산(지두방) 품목: 인보이스 금액에서 제외 (가격 0 처리)
    const codes = [...new Set(list.map((r) => r.code).filter(Boolean))]
    const directMap = codes.length ? await getDirectSettlementMap(codes) : {}
    for (const r of list) {
      if (r.code && directMap[r.code]) r.amount = 0
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getCombinedOutboundHistory:', e)
    return NextResponse.json([], { headers })
  }
}
