import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

export interface WarehouseOutboundRow {
  store: string
  code: string
  name: string
  spec: string
  qty: number
  deliveryDate: string
  source: 'Order' | 'Force'
}

export interface GetOutboundByWarehouseResult {
  byWarehouse: Record<string, WarehouseOutboundRow[]>
  warehouseOrder: string[]
  period: { start: string; end: string }
  filterBy: 'order' | 'delivery'
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const filterBy = String(searchParams.get('filterBy') || 'delivery').trim()

  if (!startStr || !endStr) {
    return NextResponse.json(
      { byWarehouse: {}, warehouseOrder: [], period: { start: startStr, end: endStr }, filterBy: filterBy === 'order' ? 'order' : 'delivery' } satisfies GetOutboundByWarehouseResult,
      { headers }
    )
  }

  const filterByOrder = filterBy !== 'delivery'
  const endIso = endStr + 'T23:59:59.999Z'

  try {
    const itemRows = (await supabaseSelect('items', {
      select: 'code,name,spec,outbound_location',
      limit: 5000,
    })) as { code?: string; name?: string; spec?: string; outbound_location?: string }[]

    const itemMap: Record<string, { name: string; spec: string; outbound_location: string }> = {}
    for (const it of itemRows || []) {
      const code = String(it.code || '').trim()
      if (code) {
        itemMap[code] = {
          name: String(it.name || '').trim(),
          spec: String(it.spec || '').trim() || '-',
          outbound_location: String(it.outbound_location || '').trim(),
        }
      }
    }

    const byWarehouse: Record<string, WarehouseOutboundRow[]> = {}

    function addRow(
      warehouse: string,
      store: string,
      code: string,
      name: string,
      spec: string,
      qty: number,
      deliveryDate: string,
      source: 'Order' | 'Force'
    ) {
      const wh = warehouse || '(미지정)'
      if (!byWarehouse[wh]) byWarehouse[wh] = []
      byWarehouse[wh].push({ store, code, name, spec, qty, deliveryDate: deliveryDate || '', source })
    }

    // 1. Approved orders
    let orderFilter: string
    if (filterByOrder) {
      orderFilter = `status=eq.Approved&order_date=gte.${encodeURIComponent(startStr)}&order_date=lte.${encodeURIComponent(endIso)}`
    } else {
      orderFilter = `status=eq.Approved&delivery_date=gte.${encodeURIComponent(startStr)}&delivery_date=lte.${encodeURIComponent(endIso)}`
    }

    const orderRows = (await supabaseSelectFilter('orders', orderFilter, {
      order: 'order_date.desc',
      limit: 300,
    })) as { store_name?: string; delivery_date?: string; cart_json?: string }[]

    for (const o of orderRows || []) {
      const store = String(o.store_name || '').trim()
      const deliveryDate = (o.delivery_date || '').trim().substring(0, 10)
      let cart: { code?: string; name?: string; spec?: string; qty?: number }[] = []
      try {
        if (o.cart_json) cart = JSON.parse(o.cart_json)
      } catch {}
      for (const p of cart) {
        const code = String(p.code || '').trim()
        const name = String(p.name || '').trim()
        const info = itemMap[code]
        const spec = info?.spec ?? p.spec ?? '-'
        const qty = Number(p.qty) || 0
        if (!code || qty <= 0) continue
        const wh = info?.outbound_location || '(미지정)'
        addRow(wh, store, code, name, spec, qty, deliveryDate, 'Order')
      }
    }

    // 2. ForceOutbound stock_logs
    const allLogs = (await supabaseSelectFilter(
      'stock_logs',
      'location=eq.본사&log_type=eq.ForceOutbound',
      { order: 'log_date.desc', limit: 500 }
    )) as {
      log_date?: string
      vendor_target?: string
      item_code?: string
      item_name?: string
      qty?: number
      delivery_status?: string
    }[]

    const startDate = new Date(startStr)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(endStr)
    endDate.setHours(23, 59, 59, 999)

    for (const row of allLogs || []) {
      let dateToCheck: Date
      if (filterByOrder) {
        dateToCheck = new Date(row.log_date || '')
      } else {
        const dStr =
          row.delivery_status && String(row.delivery_status).match(/^\d{4}-\d{2}-\d{2}/)
            ? String(row.delivery_status).substring(0, 10)
            : ''
        if (!dStr) continue
        dateToCheck = new Date(dStr)
        dateToCheck.setHours(12, 0, 0, 0)
      }
      if (dateToCheck < startDate || dateToCheck > endDate) continue

      const code = String(row.item_code || '').trim()
      const name = String(row.item_name || '').trim()
      const store = String(row.vendor_target || '').trim()
      const qty = Math.abs(Number(row.qty) || 0)
      const deliveryDate =
        row.delivery_status && String(row.delivery_status).match(/^\d{4}-\d{2}-\d{2}/)
          ? String(row.delivery_status).substring(0, 10)
          : ''
      if (!code || qty <= 0) continue

      const info = itemMap[code] || { name: name, spec: '-', outbound_location: '' }
      const wh = info.outbound_location || '(미지정)'
      addRow(wh, store, code, info.name || name, info.spec, qty, deliveryDate, 'Force')
    }

    // warehouse order from warehouse_locations
    const warehouseOrder: string[] = []
    try {
      const whRows = (await supabaseSelect('warehouse_locations', {
        order: 'sort_order.asc',
        limit: 50,
      })) as { name?: string }[]
      for (const w of whRows || []) {
        const wn = String(w.name || '').trim()
        if (wn && byWarehouse[wn]) warehouseOrder.push(wn)
      }
    } catch {}
    for (const k of Object.keys(byWarehouse)) {
      if (!warehouseOrder.includes(k)) warehouseOrder.push(k)
    }
    if (!warehouseOrder.includes('(미지정)') && byWarehouse['(미지정)']) {
      warehouseOrder.push('(미지정)')
    }

    const result: GetOutboundByWarehouseResult = {
      byWarehouse,
      warehouseOrder,
      period: { start: startStr, end: endStr },
      filterBy: filterByOrder ? 'order' : 'delivery',
    }
    return NextResponse.json(result, { headers })
  } catch (err) {
    console.error('getOutboundByWarehouse:', err)
    return NextResponse.json(
      { byWarehouse: {}, warehouseOrder: [], period: { start: startStr, end: endStr }, filterBy: filterByOrder ? 'order' : 'delivery' },
      { headers }
    )
  }
}
