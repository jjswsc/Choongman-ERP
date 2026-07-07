import { stockLogBangkokDateRangeFilter } from '@/lib/bangkok-date'
import { getBangkokDateRangeUtc } from '@/lib/bangkok-time'
import { isOutboundLogDateInBangkokYmdRange } from '@/lib/hq-outbound-income-total'
import { formatDateBangkok } from '@/lib/outbound-order-line-match'
import { ORDERS_MY_HISTORY_COLS } from '@/lib/postgrest-narrow-select'
import { supabaseRpc, supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

const HISTORY_ROW_LIMIT = 50000

export interface OrderHistoryItem {
  id: number
  orderRowId: number
  date: string
  deliveryDate: string
  deliveryDatesByOutbound?: Record<string, string>
  summary: string
  total: number
  status: string
  deliveryStatus: string
  items: {
    name?: string
    qty?: number
    price?: number
    receivedQty?: number
    originalQty?: number
    code?: string
    outboundLocation?: string
    index?: number
    isDirectSettlement?: boolean
  }[]
  receivedIndices?: number[]
  userName?: string
  userNick?: string
  rejectReason?: string
  isForceOutbound?: boolean
}

type OrderRow = {
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
}

type ForcePushRow = {
  log_date?: string
  item_code?: string
  item_name?: string
  qty?: number
  delivery_status?: string
}

type OrderHistoryRpcOrderRow = {
  id?: number | string
  order_date?: string
  delivery_date?: string
  delivery_dates_by_outbound?: string
  cart_json?: string
  total?: number | string
  status?: string
  delivery_status?: string
  received_indices?: string
  received_qty_json?: string
  original_order_qty_json?: string
  user_name?: string
  reject_reason?: string
}

type ForcePushRpcRow = {
  log_date?: string
  item_code?: string
  item_name?: string
  qty?: number | string
  delivery_status?: string
}

function bangkokUtcRange(startStr: string, endStr: string): {
  lo: string
  hi: string
  dayStartUtcIso: string
  nextDayStartUtcIso: string
} {
  const { lo, hi } = stockLogBangkokDateRangeFilter(startStr, endStr)
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(lo, hi)
  return { lo, hi, dayStartUtcIso, nextDayStartUtcIso }
}

function mapRpcOrderRow(row: OrderHistoryRpcOrderRow): OrderRow {
  return {
    id: Number(row.id) || 0,
    order_date: row.order_date,
    delivery_date: row.delivery_date,
    delivery_dates_by_outbound: row.delivery_dates_by_outbound,
    cart_json: row.cart_json,
    total: Number(row.total) || 0,
    status: row.status,
    delivery_status: row.delivery_status,
    received_indices: row.received_indices,
    received_qty_json: row.received_qty_json,
    original_order_qty_json: row.original_order_qty_json,
    user_name: row.user_name,
    reject_reason: row.reject_reason,
  }
}

function mapRpcForcePushRow(row: ForcePushRpcRow): ForcePushRow {
  return {
    log_date: row.log_date,
    item_code: row.item_code,
    item_name: row.item_name,
    qty: Number(row.qty) || 0,
    delivery_status: row.delivery_status,
  }
}

async function loadItemMaps(): Promise<{
  itemMap: Record<string, string>
  priceMap: Record<string, number>
}> {
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
  } catch {
    /* optional */
  }
  return { itemMap, priceMap }
}

async function loadNameToNick(store: string): Promise<Record<string, string>> {
  const nameToNick: Record<string, string> = {}
  if (!store) return nameToNick
  try {
    const empFilter = `store=eq.${encodeURIComponent(store)}`
    const emps = (await supabaseSelectFilter('employees', empFilter, {
      select: 'name,nick',
      limit: 500,
    })) as { name?: string; nick?: string }[]
    for (const e of emps || []) {
      const n = String(e.name || '').trim()
      if (n) nameToNick[n] = String(e.nick || e.name || '').trim() || n
    }
  } catch {
    /* optional */
  }
  return nameToNick
}

function mapOrderRowToHistoryItem(
  o: OrderRow,
  itemMap: Record<string, string>,
  nameToNick: Record<string, string>
): OrderHistoryItem {
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
      ? (cart[0].name || '') + (cart.length > 1 ? ` +${cart.length - 1} more` : '')
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
    date: formatDateBangkok(orderDate),
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
}

function mergeForcePushIntoList(
  list: OrderHistoryItem[],
  forcePushRows: ForcePushRow[],
  lo: string,
  hi: string,
  itemMap: Record<string, string>,
  priceMap: Record<string, number>
): void {
  const groups = new Map<string, ForcePushRow[]>()
  for (const row of forcePushRows || []) {
    if (!isOutboundLogDateInBangkokYmdRange(row.log_date, lo, hi)) continue
    const rowDate = new Date(row.log_date || '')
    if (isNaN(rowDate.getTime())) continue
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
        ? (items[0].name || '') + (items.length > 1 ? ` +${items.length - 1} more` : '')
        : '강제출고'
    const deliveryDate =
      first.delivery_status && /^\d{4}-\d{2}-\d{2}/.test(String(first.delivery_status))
        ? String(first.delivery_status).slice(0, 10)
        : formatDateBangkok(rowDate)

    list.push({
      id: -Math.abs(rowDate.getTime()),
      orderRowId: 0,
      date: formatDateBangkok(rowDate),
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
}

function sortOrderHistoryList(list: OrderHistoryItem[]): void {
  list.sort((a, b) => {
    const da = new Date(a.date + 'T' + (a.deliveryDate || '00:00:00'))
    const db = new Date(b.date + 'T' + (b.deliveryDate || '00:00:00'))
    return db.getTime() - da.getTime()
  })
}

async function fetchOrderRowsRpc(
  store: string,
  dayStartUtcIso: string,
  nextDayStartUtcIso: string
): Promise<OrderRow[] | null> {
  const rows = (await supabaseRpc<OrderHistoryRpcOrderRow[]>('get_my_order_history_orders', {
    p_store: store,
    p_start: dayStartUtcIso,
    p_end_exclusive: nextDayStartUtcIso,
    p_limit: HISTORY_ROW_LIMIT,
    p_offset: 0,
  })) as OrderHistoryRpcOrderRow[] | null
  if (!Array.isArray(rows)) return null
  return rows.map(mapRpcOrderRow).filter((r) => r.id > 0)
}

async function fetchForcePushRowsRpc(
  store: string,
  dayStartUtcIso: string,
  nextDayStartUtcIso: string
): Promise<ForcePushRow[] | null> {
  const rows = (await supabaseRpc<ForcePushRpcRow[]>('get_my_order_history_force_push', {
    p_store: store,
    p_start: dayStartUtcIso,
    p_end_exclusive: nextDayStartUtcIso,
    p_limit: HISTORY_ROW_LIMIT,
    p_offset: 0,
  })) as ForcePushRpcRow[] | null
  if (!Array.isArray(rows)) return null
  return rows.map(mapRpcForcePushRow)
}

async function fetchOrderRowsFallback(
  store: string,
  dayStartUtcIso: string,
  nextDayStartUtcIso: string
): Promise<OrderRow[]> {
  const filter =
    `store_name=eq.${encodeURIComponent(store)}` +
    `&order_date=gte.${encodeURIComponent(dayStartUtcIso)}` +
    `&order_date=lt.${encodeURIComponent(nextDayStartUtcIso)}`
  return (await supabaseSelectFilter('orders', filter, {
    order: 'order_date.desc',
    limit: HISTORY_ROW_LIMIT,
    select: ORDERS_MY_HISTORY_COLS,
  })) as OrderRow[]
}

async function fetchForcePushRowsFallback(
  store: string,
  startStr: string,
  endStr: string
): Promise<ForcePushRow[]> {
  const { gtePart, ltPart } = stockLogBangkokDateRangeFilter(startStr, endStr)
  const fpFilter = [
    `location=eq.${encodeURIComponent(store)}`,
    'log_type=eq.ForcePush',
    gtePart,
    ltPart,
  ].join('&')
  return (await supabaseSelectFilter('stock_logs', fpFilter, {
    order: 'log_date.desc',
    limit: HISTORY_ROW_LIMIT,
    select: 'log_date,item_code,item_name,qty,delivery_status',
  })) as ForcePushRow[]
}

/** 기간 내 주문+ForcePush 병합 목록 (페이지네이션 전) */
export async function fetchMyOrderHistoryList(params: {
  store: string
  startStr: string
  endStr: string
}): Promise<OrderHistoryItem[]> {
  const store = String(params.store || '').trim()
  const startStr = String(params.startStr || '').trim()
  const endStr = String(params.endStr || '').trim()
  if (!store || !startStr || !endStr) return []

  const { lo, hi, dayStartUtcIso, nextDayStartUtcIso } = bangkokUtcRange(startStr, endStr)
  const [{ itemMap, priceMap }, nameToNick] = await Promise.all([
    loadItemMaps(),
    loadNameToNick(store),
  ])

  let orderRows: OrderRow[] | null = null
  let forcePushRows: ForcePushRow[] | null = null

  try {
    ;[orderRows, forcePushRows] = await Promise.all([
      fetchOrderRowsRpc(store, dayStartUtcIso, nextDayStartUtcIso),
      fetchForcePushRowsRpc(store, dayStartUtcIso, nextDayStartUtcIso),
    ])
  } catch {
    orderRows = null
    forcePushRows = null
  }

  if (orderRows == null || forcePushRows == null) {
    ;[orderRows, forcePushRows] = await Promise.all([
      fetchOrderRowsFallback(store, dayStartUtcIso, nextDayStartUtcIso),
      fetchForcePushRowsFallback(store, startStr, endStr),
    ])
  }

  const list = (orderRows || []).map((o) => mapOrderRowToHistoryItem(o, itemMap, nameToNick))
  try {
    mergeForcePushIntoList(list, forcePushRows || [], lo, hi, itemMap, priceMap)
  } catch (fpErr) {
    console.error('fetchMyOrderHistoryList ForcePush merge:', fpErr)
  }
  sortOrderHistoryList(list)
  return list
}
