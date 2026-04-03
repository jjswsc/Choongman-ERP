/**
 * 미수금 금액을 출고 관리(getCombinedOutboundHistory)와 동일한 줄·직접정산·합계 규칙으로 맞춤
 */
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { STOCK_LOG_OUTBOUND_HISTORY_COLS } from '@/lib/postgrest-narrow-select'
import { getDirectSettlementMap } from '@/lib/direct-settlement-server'
import { thaiInvoiceTotalsFromRawSubtotal } from '@/lib/invoice-vat-total'
import { upsertReceivableFromOrder } from '@/lib/receivable-payable'
import { computeOrderHqReceivableTotal } from '@/lib/order-receivable-hq'
import {
  type OrderCartLine,
  formatDateBangkok,
  findReceivedCartLineIndex,
  frozenInvoiceUnitPriceFromLog,
  unitPriceFromOutboundLogSnapshot,
} from '@/lib/outbound-order-line-match'

const TZ = 'Asia/Bangkok'

type ItemInfo = { spec: string; price: number; outboundLocation: string }

type OutboundRow = {
  date: string
  target: string
  type: 'Outbound'
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
  receivedIndices?: number[]
  totalOrderItems?: number
  originalOrderQty?: number
  qtyStages?: number[]
  outboundLocation?: string
  isUnreceived?: boolean
  /** stock_logs invoice_unit_price 스냅샷(있으면 cart/마스터로 덮어쓰지 않음) */
  frozenUnitPrice?: number
}

type OrderEnrich = {
  store_name?: string
  delivery_status?: string
  delivery_date?: string
  delivery_dates_by_outbound?: Record<string, string>
  order_date?: string
  received_indices?: number[]
  received_qty_json?: Record<string, number>
  original_order_qty_json?: Record<string, number>
  approved_original_qty_json?: Record<string, number>
  cart?: OrderCartLine[]
}

function parseOrderRowToEnrich(o: {
  store_name?: string
  delivery_status?: string
  delivery_date?: string
  delivery_dates_by_outbound?: string
  order_date?: string
  received_indices?: string | number[] | null
  received_qty_json?: string
  original_order_qty_json?: string
  approved_original_qty_json?: string
  cart_json?: string
}): OrderEnrich {
  let recIdx: number[] = []
  try {
    if (o.received_indices) {
      recIdx = Array.isArray(o.received_indices)
        ? o.received_indices
        : JSON.parse(String(o.received_indices))
    }
  } catch {
    recIdx = []
  }
  let recQtyMap: Record<string, number> = {}
  try {
    if (o.received_qty_json) recQtyMap = JSON.parse(String(o.received_qty_json)) || {}
  } catch {
    recQtyMap = {}
  }
  let origQtyMap: Record<string, number> = {}
  try {
    if (o.original_order_qty_json) origQtyMap = JSON.parse(String(o.original_order_qty_json)) || {}
  } catch {
    origQtyMap = {}
  }
  let approvedOrigQtyMap: Record<string, number> = {}
  try {
    if (o.approved_original_qty_json) approvedOrigQtyMap = JSON.parse(String(o.approved_original_qty_json)) || {}
  } catch {
    approvedOrigQtyMap = {}
  }
  let cart: OrderCartLine[] = []
  try {
    if (o.cart_json) cart = JSON.parse(o.cart_json) || []
  } catch {
    cart = []
  }
  let deliveryDatesByOutbound: Record<string, string> | undefined
  try {
    const raw = o.delivery_dates_by_outbound
    if (raw && typeof raw === 'string') {
      const parsed = JSON.parse(raw) as Record<string, string>
      if (parsed && typeof parsed === 'object') deliveryDatesByOutbound = parsed
    }
  } catch {
    deliveryDatesByOutbound = undefined
  }
  return {
    store_name: o.store_name,
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

/**
 * 출고 관리 목록과 동일한 raw 합계(직접정산 0 반영 전) → 호출부에서 직접정산 제거 후 세금 반올림
 */
async function buildFilteredOutboundRowsForOrder(
  orderId: number,
  itemMap: Record<string, ItemInfo>,
  orderRow: Parameters<typeof parseOrderRowToEnrich>[0] & { id?: number }
): Promise<{ rows: OutboundRow[]; stockLogRowCount: number }> {
  const oidStr = String(orderId)
  const orderEnrich = parseOrderRowToEnrich(orderRow)
  const cart = orderEnrich.cart || []
  const storeName = String(orderRow.store_name || '').trim()

  const logs = (await supabaseSelectFilter(
    'stock_logs',
    `log_type=eq.Outbound&order_id=eq.${orderId}`,
    {
      order: 'log_date.asc',
      limit: 500,
      select: STOCK_LOG_OUTBOUND_HISTORY_COLS,
    }
  )) as {
    log_date?: string
    vendor_target?: string
    item_code?: string
    item_name?: string
    qty?: number
    delivery_status?: string
    invoice_unit_price?: number | string | null
  }[]

  const list: OutboundRow[] = []
  for (const row of logs || []) {
    const rowDate = new Date(row.log_date || '')
    if (isNaN(rowDate.getTime())) continue
    const code = String(row.item_code || '').trim()
    const info = itemMap[code] || { spec: '-', price: 0, outboundLocation: '(미지정)' }
    const qtyAbs = Math.abs(Number(row.qty) || 0)
    if (qtyAbs <= 0) continue
    const unitPrice = unitPriceFromOutboundLogSnapshot(
      row,
      cart,
      code,
      String(row.item_name || '').trim(),
      info.price
    )
    const frozen = frozenInvoiceUnitPriceFromLog(row)
    const dateStr = formatDateBangkok(rowDate)
    list.push({
      date: dateStr,
      target: String(row.vendor_target || '').trim() || storeName,
      type: 'Outbound',
      name: String(row.item_name || '').trim(),
      code,
      spec: info.spec,
      qty: qtyAbs,
      amount: unitPrice * qtyAbs,
      orderRowId: oidStr,
      deliveryStatus:
        row.delivery_status && String(row.delivery_status).trim()
          ? String(row.delivery_status).trim()
          : '배송중',
      outboundLocation: info.outboundLocation,
      frozenUnitPrice: frozen,
    })
  }

  for (const r of list) {
    const datePart = r.date.replace(/\D/g, '').slice(0, 8)
    r.invoiceNo = `IV${datePart}-${oidStr}`
  }

  const orderMap: Record<string, OrderEnrich> = { [oidStr]: orderEnrich }

  for (const r of list) {
    const key = r.orderRowId
    if (!key || !orderMap[key]) continue
    const o = orderMap[key]
    if (o.order_date) r.orderDate = o.order_date.slice(0, 10)
    if (o.delivery_status === '배송완료' || o.delivery_status === '일부배송완료' || o.delivery_status === '일부 배송 완료') {
      r.deliveryStatus = o.delivery_status === '일부 배송 완료' ? '일부배송완료' : o.delivery_status
    }
    const outboundLoc = r.outboundLocation || '(미지정)'
    const perOutbound = o.delivery_dates_by_outbound?.[outboundLoc]
    if (perOutbound) r.deliveryDate = perOutbound.slice(0, 16)
    else if (o.delivery_date) r.deliveryDate = o.delivery_date.slice(0, 16)
    if (o.received_indices && o.received_indices.length > 0) {
      r.receivedIndices = o.received_indices
      r.totalOrderItems = o.cart?.length ? o.cart.length : o.received_indices.length
    }
  }

  const filteredList: OutboundRow[] = []

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
    const cartFor = o.cart || []
    const code = String(r.code || '').trim()
    const name = String(r.name || '').trim()
    const matchIdx = findReceivedCartLineIndex(cartFor, o.received_indices, code, name)
    let cartItem: OrderCartLine | undefined
    if (matchIdx >= 0) {
      // 출고 화면은 동일 cart 줄 중복 표시를 줄이지만, 미수금 합계는 **모든 출고 로그 줄**을 합산해야 함 (continue 제거)
      cartItem = cartFor[matchIdx]
    }
    const finalQty = r.qty
    if (cartItem) {
      const cartQty = Number(cartItem?.qty ?? 0)
      const origAtReceive = o.original_order_qty_json?.[String(matchIdx)]
      const approvedOrig = o.approved_original_qty_json?.[String(matchIdx)]
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
      if (r.frozenUnitPrice != null && Number.isFinite(r.frozenUnitPrice)) {
        r.amount = r.frozenUnitPrice * finalQty
      } else {
        const infoRow = itemMap[code] || { spec: '-', price: 0, outboundLocation: '(미지정)' }
        const cartP = Number(cartItem.price)
        const lineUnit = Number.isFinite(cartP) ? cartP : infoRow.price
        r.amount = lineUnit * finalQty
      }
    }
    filteredList.push(r)
  }

  const o = orderEnrich
  if (o.received_indices?.length && o.cart?.length) {
    const recIdxSet = new Set(o.received_indices)
    const target = storeName
    const sample = filteredList[0]
    const baseDate = sample?.date || (orderRow.order_date || '').slice(0, 10) || ''
    const baseInvoiceNo = sample?.invoiceNo ?? ''
    for (let ci = 0; ci < o.cart.length; ci++) {
      if (recIdxSet.has(ci)) continue
      const c = o.cart[ci]
      if (!c || !c.name) continue
      const code = String(c.code || '').trim()
      const info = itemMap[code] || { spec: '-', price: 0, outboundLocation: '(미지정)' }
      const qty = Number(c.qty || 0)
      const cartUnit = Number(c.price)
      const unitPrice = Number.isFinite(cartUnit) ? cartUnit : info.price
      const amount = unitPrice * qty
      filteredList.push({
        date: baseDate,
        target,
        type: 'Outbound',
        name: String(c.name || '').trim(),
        code,
        spec: String(c.spec || info.spec || '').trim() || '-',
        qty,
        amount,
        orderRowId: oidStr,
        deliveryStatus: '미수령',
        deliveryDate: o.delivery_date?.slice(0, 16),
        orderDate: orderRow.order_date?.slice(0, 10),
        invoiceNo: baseInvoiceNo,
        outboundLocation: info.outboundLocation,
        originalOrderQty: qty,
        isUnreceived: true,
      })
    }
  }

  const codes = [...new Set(filteredList.map((r) => r.code).filter(Boolean))]
  const directMap = codes.length ? await getDirectSettlementMap(codes) : {}
  for (const r of filteredList) {
    if (r.code && directMap[r.code]) r.amount = 0
  }

  return { rows: filteredList, stockLogRowCount: (logs || []).length }
}

export type SyncReceivableToOutboundResult = {
  ok: boolean
  orderId: number
  subtotalHQ?: number
  totalHQ?: number
  removed?: boolean
  usedCartFallback?: boolean
  message?: string
}

export async function syncReceivableToOutboundView(orderId: number): Promise<SyncReceivableToOutboundResult> {
  if (!orderId || Number.isNaN(orderId)) {
    return { ok: false, orderId, message: 'orderId가 필요합니다.' }
  }

  const orders = (await supabaseSelectFilter('orders', `id=eq.${orderId}`, {
    limit: 1,
    select:
      'id,store_name,cart_json,delivery_status,delivery_date,delivery_dates_by_outbound,order_date,received_indices,received_qty_json,original_order_qty_json,approved_original_qty_json',
  })) as Record<string, unknown>[]

  const o = orders?.[0] as {
    id?: number
    store_name?: string
    cart_json?: string
    delivery_status?: string
    delivery_date?: string
    delivery_dates_by_outbound?: string
    order_date?: string
    received_indices?: string | number[] | null
    received_qty_json?: string
    original_order_qty_json?: string
    approved_original_qty_json?: string
  }

  if (!o?.id) {
    return { ok: false, orderId, message: '주문을 찾을 수 없습니다.' }
  }

  const ds = String(o.delivery_status || '')
  if (ds !== '배송완료' && ds !== '일부배송완료') {
    return { ok: false, orderId, message: '수령 완료(배송완료·일부배송완료) 주문만 출고 기준으로 맞출 수 있습니다.' }
  }

  const storeName = String(o.store_name || '').trim()
  if (!storeName) {
    return { ok: false, orderId, message: '매장명이 없어 미수금을 반영할 수 없습니다.' }
  }

  const items = (await supabaseSelect('items', {
    order: 'id.asc',
    select: 'code,spec,price,outbound_location',
    limit: 10000,
  })) as { code?: string; spec?: string; price?: number; outbound_location?: string }[]

  const itemMap: Record<string, ItemInfo> = {}
  for (const it of items || []) {
    const c = String(it.code || '').trim()
    itemMap[c] = {
      spec: String(it.spec || '').trim() || '-',
      price: Number(it.price) || 0,
      outboundLocation: String(it.outbound_location || '').trim() || '(미지정)',
    }
  }

  let cart: OrderCartLine[] = []
  try {
    if (o.cart_json) cart = JSON.parse(o.cart_json) || []
  } catch {
    cart = []
  }

  const existing = (await supabaseSelectFilter(
    'receivable_transactions',
    `ref_type=eq.Order&ref_id=eq.${orderId}`,
    { limit: 1, select: 'trans_date' }
  )) as { trans_date?: string }[]

  const transDate =
    (existing?.[0]?.trans_date && String(existing[0].trans_date).slice(0, 10)) ||
    (o.delivery_date && String(o.delivery_date).slice(0, 10)) ||
    new Date().toLocaleDateString('en-CA', { timeZone: TZ })

  const { rows: filteredRows, stockLogRowCount } = await buildFilteredOutboundRowsForOrder(orderId, itemMap, o)
  let usedCartFallback = false

  const rawFromOutbound = filteredRows.reduce((s, r) => s + Number(r.amount || 0), 0)

  /** 출고 로그가 아예 없을 때만 카트 기준(기존 syncOrderReceivable과 동일)으로 대체 — 직접정산만 있어 합계 0인 경우는 제외 */
  if (stockLogRowCount === 0 && cart.length > 0) {
    const { subtotalHQ, totalHQ } = await computeOrderHqReceivableTotal(cart)
    await upsertReceivableFromOrder({ orderId, storeName, total: totalHQ, transDate })
    usedCartFallback = true
    return {
      ok: true,
      orderId,
      subtotalHQ,
      totalHQ,
      removed: totalHQ <= 0,
      usedCartFallback: true,
      message:
        totalHQ <= 0
          ? '본사 정산 출고 금액이 없어 미수금을 제거했습니다. (출고 로그 없음·카트 기준)'
          : '출고 로그가 없어 주문 카트 기준으로 미수금을 맞췄습니다.',
    }
  }

  const { subtotalRounded, grandTotal } = thaiInvoiceTotalsFromRawSubtotal(rawFromOutbound)

  await upsertReceivableFromOrder({ orderId, storeName, total: grandTotal, transDate })

  return {
    ok: true,
    orderId,
    subtotalHQ: subtotalRounded,
    totalHQ: grandTotal,
    removed: grandTotal <= 0,
    usedCartFallback,
    message:
      grandTotal <= 0
        ? '출고 관리 합계상 본사 정산분이 없어 미수금을 제거했습니다.'
        : '출고 관리와 동일한 합계로 미수금을 맞췄습니다.',
  }
}
