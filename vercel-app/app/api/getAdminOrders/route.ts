import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('startDate') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('endDate') || '').trim()
  let storeFilter = String(searchParams.get('store') || searchParams.get('storeFilter') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()
  const isHQ = ['office', '본사', '오피스'].includes(userStore.toLowerCase().trim())
  if (userStore && !isHQ) storeFilter = userStore
  const deliveryStatusFilter = String(searchParams.get('deliveryStatus') || '').trim()
  const statusFilter = String(searchParams.get('status') || searchParams.get('statusFilter') || '').trim()

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

    const itemsRows = (await supabaseSelect('items', { order: 'id.asc', limit: 5000, select: 'code,category,spec,vendor,outbound_location' })) as {
      code?: string
      category?: string
      spec?: string
      vendor?: string
      outbound_location?: string
    }[] | null
    const itemSpecMap: Record<string, string> = {}
    const itemCategoryMap: Record<string, string> = {}
    const itemVendorMap: Record<string, string> = {}
    const itemOutboundMap: Record<string, string> = {}
    for (const row of itemsRows || []) {
      const code = String(row.code || '').trim()
      if (code) {
        itemSpecMap[code] = String(row.spec || '').trim()
        itemCategoryMap[code] = String(row.category || '').trim()
        itemVendorMap[code] = String(row.vendor || '').trim()
        itemOutboundMap[code] = String(row.outbound_location || '').trim()
      }
    }

    let filter =
      `order_date=gte.${encodeURIComponent(s)}&order_date=lte.${encodeURIComponent(endIso)}`
    if (storeFilter && storeFilter !== 'All' && storeFilter !== '전체') {
      filter += `&store_name=eq.${encodeURIComponent(storeFilter)}`
    }
    const baseFilter = `order_date=gte.${encodeURIComponent(s)}&order_date=lte.${encodeURIComponent(endIso)}`
    const [rows, storeRows, empRows] = await Promise.all([
      supabaseSelectFilter('orders', filter, { order: 'order_date.desc', limit: 300 }),
      supabaseSelectFilter('orders', baseFilter, { order: 'order_date.desc', limit: 500 }),
      supabaseSelect('employees', { order: 'id.asc', limit: 500, select: 'store,name,nick' }),
    ])

    const nameToNick: Record<string, string> = {}
    const nameToNickByUser: Record<string, string> = {}
    const empList = (empRows || []) as { store?: string; name?: string; nick?: string }[]
    for (const e of empList) {
      const storeKey = String(e.store || '').trim()
      const n = String(e.name || '').trim()
      const nickStr = String(e.nick || '').trim()
      const displayVal = nickStr || n
      if (storeKey && n) nameToNick[storeKey + '|' + n] = displayVal
      if (storeKey && nickStr) nameToNick[storeKey + '|' + nickStr] = displayVal
      if (n) nameToNickByUser[n] = displayVal
    }

    const rowsTyped = rows as {
      id: number
      order_date?: string
      store_name?: string
      user_name?: string
      cart_json?: string
      total?: number
      status?: string
      delivery_status?: string
      delivery_date?: string
      received_indices?: string
      approved_indices?: string
      approved_original_qty_json?: string
      reject_reason?: string
    }[]

    const list = (rowsTyped || []).map((o) => {
      let items: { code?: string; name?: string; spec?: string; qty?: number; price?: number }[] = []
      try {
        items = JSON.parse(o.cart_json || '[]')
      } catch {}
      items = items.map((it) => ({
        ...it,
        spec: it.spec || itemSpecMap[it.code || ''] || '',
        category: (it as { category?: string }).category || itemCategoryMap[it.code || ''] || '',
        vendor: (it as { vendor?: string }).vendor || itemVendorMap[it.code || ''] || '',
        outboundLocation: itemOutboundMap[it.code || ''] || '',
      }))
      let receivedIndices: number[] = []
      try {
        if (o.received_indices) receivedIndices = JSON.parse(o.received_indices)
      } catch {}
      let approvedOriginalQtyMap: Record<string, number> = {}
      try {
        if (o.approved_original_qty_json) approvedOriginalQtyMap = JSON.parse(o.approved_original_qty_json) || {}
      } catch {}
      const itemsWithOriginal = items.map((it, idx) => ({
        ...it,
        originalQty: approvedOriginalQtyMap[String(idx)] ?? it.qty,
      }))
      const summary =
        items.length > 0
          ? (items[0].name || '') + (items.length > 1 ? ` 외 ${items.length - 1}건` : '')
          : '내용 없음'
      const dateVal = o.order_date
      const dateStr = dateVal ? String(dateVal).substring(0, 16).replace('T', ' ') : ''
      const storeKey = String(o.store_name || '').trim()
      const userName = String(o.user_name || '').trim()
      const userNick = (storeKey && userName)
        ? (nameToNick[storeKey + '|' + userName] ?? nameToNickByUser[userName] ?? userName)
        : userName || undefined
      return {
        row: o.id,
        orderId: o.id,
        date: dateStr,
        store: o.store_name || '',
        userName: userName || undefined,
        userNick: userNick || undefined,
        total: Number(o.total) || 0,
        status: o.status || 'Pending',
        deliveryStatus: (o.received_indices ? '일부배송완료' : null) ?? o.delivery_status ?? (o.status === 'Approved' ? '배송중' : ''),
        deliveryDate: String(o.delivery_date || '').trim(),
        items: itemsWithOriginal,
        summary,
        receivedIndices,
        rejectReason: String(o.reject_reason || '').trim() || undefined,
      }
    })

    let filteredList = list
    if (deliveryStatusFilter && deliveryStatusFilter !== 'All' && deliveryStatusFilter !== '전체') {
      const norm = (s: string) => (s || '').replace(/\s/g, '')
      filteredList = filteredList.filter((o) => norm(o.deliveryStatus || '') === norm(deliveryStatusFilter))
    }
    if (statusFilter && statusFilter !== 'all' && statusFilter !== 'All' && statusFilter !== '전체') {
      const statusMap: Record<string, string> = {
        pending: 'Pending',
        approved: 'Approved',
        rejected: 'Rejected',
        hold: 'Hold',
      }
      const target = statusMap[statusFilter.toLowerCase()] || statusFilter
      filteredList = filteredList.filter((o) => (o.status || '') === target)
    }

    const storesForDropdown = [...new Set((storeRows || []).map((r: { store_name?: string }) => r.store_name || '').filter(Boolean))].sort()
    return NextResponse.json({ list: filteredList, stores: storesForDropdown }, { headers })
  } catch (err) {
    console.error('getAdminOrders:', err)
    return NextResponse.json({ list: [] }, { headers })
  }
}
