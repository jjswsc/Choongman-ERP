/**
 * 본사 창고(S&J) 일별 입·출고 매트릭스 — Daily Stock Report 스타일.
 * stock_logs + 출고 관리와 동일 단가·인보이스 번호(IV/IVF).
 */
import { supabaseSelect, supabaseSelectFilter, supabaseSelectFilterAllPages, supabaseRpc } from '@/lib/supabase-server'
import { STOCK_LOG_OUTBOUND_HISTORY_COLS } from '@/lib/postgrest-narrow-select'
import { storeMatchesIncomeFilter } from '@/lib/accounting-store-match'
import { addBangkokCalendarDays, getBangkokDateRangeUtc, getBangkokEndOfDayUtcIso } from '@/lib/bangkok-time'
import { getDirectSettlementMap } from '@/lib/direct-settlement-server'
import {
  isOutboundLogDateInBangkokYmdRange,
} from '@/lib/hq-outbound-income-total'
import { isHeadOfficeLikeStoreName, isInternalForceOutboundTarget } from '@/lib/internal-outbound'
import { thaiInvoiceTotalsFromRawSubtotal } from '@/lib/invoice-vat-total'
import {
  type OrderCartLine,
  formatDateBangkok,
  unitPriceFromOutboundLogSnapshot,
} from '@/lib/outbound-order-line-match'
import { getStockLocationPatterns } from '@/lib/stock-location-patterns'
import { resolveStockValuationUnitCost } from '@/lib/accounting-inventory-asof'
import {
  buildDailyOutSparkline,
  computePriorPeriodRange,
  pctChange,
} from '@/lib/hq-warehouse-daily-stock-matrix-view'

type RawStockLog = {
  id?: number
  log_type?: string
  log_date?: string
  vendor_target?: string
  item_code?: string
  item_name?: string
  qty?: number
  order_id?: number
  invoice_unit_price?: number | string | null
}

type ItemMeta = {
  code: string
  name: string
  spec: string
  unit: string
  cost: number
  price: number
  category: string
  minQty: number
}

export type HqWarehouseMovementColumn = {
  key: string
  ymd: string
  kind: 'in' | 'out' | 'adjust'
  store?: string
  label: string
}

export type HqWarehouseDailyItemRow = {
  code: string
  name: string
  spec: string
  unit: string
  cost: number
  price: number
  category: string
  cells: Record<string, number>
  beginning: number
  balance: number
  minQty: number
  totalIn: number
  totalOut: number
  avgOutPerDay: number
  avgOutPerWeek: number
  avgOutPerMonth: number
  orderPeriodDays: number | null
  costOfGoods: number
  valuationUnitCost: number
  priorTotalOut: number
  outChangePct: number | null
  sparkline: number[]
}

export type HqWarehouseDayInvoice = {
  ymd: string
  store: string
  invoiceNo: string
  type: 'Outbound' | 'Force'
  orderId?: number
  stockLogId?: number
  subtotal: number
  vat: number
  grandTotal: number
}

export type HqWarehouseDailyStockMatrixResult = {
  startStr: string
  endStr: string
  warehouseKey: string
  warehouseLabel: string
  warehouseOptions: string[]
  columns: HqWarehouseMovementColumn[]
  items: HqWarehouseDailyItemRow[]
  dayInvoices: HqWarehouseDayInvoice[]
  stores: string[]
  periodDays: number
  hitRowCap: boolean
  usedRpc: boolean
  priorStartStr?: string
  priorEndStr?: string
}

const ROW_CAP = 100_000
const DEFAULT_WAREHOUSE_KEY = '본사'

type RpcAggRow = {
  bangkok_ymd?: string
  log_type?: string
  vendor_target?: string
  item_code?: string
  qty_sum?: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function appendLocationPatternFilter(base: string, patterns: string[]): string {
  if (patterns.length === 0) return base
  if (patterns.length === 1) {
    return `${base}&location=ilike.${encodeURIComponent(patterns[0]!)}`
  }
  return `${base}&or=(${patterns.map((p) => `location.ilike.${encodeURIComponent(p)}`).join(',')})`
}

function buildHqLocationPeriodFilter(startStr: string, endStr: string, warehouseKey: string): string {
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  let f = `log_date=gte.${encodeURIComponent(dayStartUtcIso)}&log_date=lt.${encodeURIComponent(nextDayStartUtcIso)}`
  f += '&is_deleted=is.false'
  return appendLocationPatternFilter(f, getStockLocationPatterns(warehouseKey))
}

function buildWarehouseOutboundFilter(
  startStr: string,
  endStr: string,
  warehouseKey: string,
  includeSoftDelete: boolean
): string {
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  let f = `log_date=gte.${encodeURIComponent(dayStartUtcIso)}&log_date=lt.${encodeURIComponent(nextDayStartUtcIso)}`
  if (includeSoftDelete) f += '&is_deleted=is.false'
  return appendLocationPatternFilter(f, getStockLocationPatterns(warehouseKey))
}

async function tryFetchMovementAggRpc(
  warehouseKey: string,
  startStr: string,
  endStr: string
): Promise<RpcAggRow[] | null> {
  const patterns = getStockLocationPatterns(warehouseKey)
  if (!patterns.length) return null
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  try {
    const rows = (await supabaseRpc<RpcAggRow[]>('get_hq_warehouse_stock_movement_agg', {
      p_location_patterns: patterns,
      p_start: dayStartUtcIso,
      p_end: nextDayStartUtcIso,
    })) as RpcAggRow[] | null
    return rows && rows.length > 0 ? rows : null
  } catch {
    return null
  }
}

async function loadWarehouseOptions(): Promise<string[]> {
  const defaults = ['본사', '입고등록']
  try {
    const rows = (await supabaseSelect('warehouse_locations', {
      order: 'sort_order.asc',
      limit: 100,
      select: 'name',
    })) as { name?: string }[] | null
    const names = (rows || []).map((r) => String(r.name || '').trim()).filter(Boolean)
    return [...new Set([...defaults, ...names])].sort((a, b) => a.localeCompare(b))
  } catch {
    return defaults
  }
}

async function loadValuationUnitCostMap(): Promise<Record<string, number>> {
  const rows = (await supabaseSelect('items', {
    order: 'id.asc',
    select: 'code,cost,price',
    limit: 10000,
  })) as { code?: string; cost?: number; price?: number }[] | null
  const out: Record<string, number> = {}
  for (const r of rows || []) {
    const code = String(r.code || '').trim()
    if (!code) continue
    out[code] = resolveStockValuationUnitCost(r.cost, r.price)
  }
  return out
}

async function fetchPriorOutByCode(
  warehouseKey: string,
  priorStart: string,
  priorEnd: string
): Promise<Record<string, number>> {
  const raw = await fetchOutboundRawLogs(priorStart, priorEnd, warehouseKey)
  const m: Record<string, number> = {}
  for (const row of raw) {
    const logType = String(row.log_type || '')
    if (logType !== 'Outbound' && logType !== 'ForceOutbound') continue
    if (!isOutboundLogDateInBangkokYmdRange(row.log_date, priorStart, priorEnd)) continue
    const target = String(row.vendor_target || '').trim()
    if (!target || isHeadOfficeLikeStoreName(target)) continue
    const code = String(row.item_code || '').trim()
    const qtyAbs = Math.abs(Number(row.qty) || 0)
    if (!code || !qtyAbs) continue
    m[code] = (m[code] || 0) + qtyAbs
  }
  return m
}

async function fetchStockLogsByType(logType: string, locPeriodFilter: string): Promise<RawStockLog[]> {
  const typeEq = `log_type=eq.${encodeURIComponent(logType)}`
  try {
    return (await supabaseSelectFilterAllPages('stock_logs', `${typeEq}&${locPeriodFilter}`, {
      order: 'log_date.asc',
      select: STOCK_LOG_OUTBOUND_HISTORY_COLS,
      pageSize: 8000,
      maxRows: ROW_CAP,
    })) as RawStockLog[]
  } catch (e) {
    const msg = String(e || '').toLowerCase()
    if (!msg.includes('is_deleted') && !msg.includes('42703')) throw e
    const relaxed = locPeriodFilter.replace(/&is_deleted=is\.false/g, '')
    return (await supabaseSelectFilterAllPages('stock_logs', `${typeEq}&${relaxed}`, {
      order: 'log_date.asc',
      select: STOCK_LOG_OUTBOUND_HISTORY_COLS,
      pageSize: 8000,
      maxRows: ROW_CAP,
    })) as RawStockLog[]
  }
}

async function fetchOutboundRawLogs(
  startStr: string,
  endStr: string,
  warehouseKey: string
): Promise<RawStockLog[]> {
  const fetchOne = async (logType: 'Outbound' | 'ForceOutbound', includeSoftDelete: boolean) =>
    supabaseSelectFilterAllPages(
      'stock_logs',
      `log_type=eq.${logType}&${buildWarehouseOutboundFilter(startStr, endStr, warehouseKey, includeSoftDelete)}`,
      {
        order: 'log_date.asc',
        select: STOCK_LOG_OUTBOUND_HISTORY_COLS,
        pageSize: 8000,
        maxRows: ROW_CAP,
      }
    ) as Promise<RawStockLog[]>

  try {
    const [outbound, force] = await Promise.all([fetchOne('Outbound', true), fetchOne('ForceOutbound', true)])
    return [...(outbound || []), ...(force || [])]
  } catch (e) {
    const msg = String(e || '').toLowerCase()
    if (!msg.includes('is_deleted') && !msg.includes('42703')) throw e
    const [outbound, force] = await Promise.all([fetchOne('Outbound', false), fetchOne('ForceOutbound', false)])
    return [...(outbound || []), ...(force || [])]
  }
}

async function loadOrderCartsById(orderIds: number[]): Promise<Record<string, OrderCartLine[]>> {
  const out: Record<string, OrderCartLine[]> = {}
  if (orderIds.length === 0) return out
  const idsFilter = `id=in.(${orderIds.join(',')})`
  const cartRows = (await supabaseSelectFilter('orders', idsFilter, {
    select: 'id,cart_json',
    limit: orderIds.length + 50,
  })) as { id?: number; cart_json?: string }[] | null
  for (const cr of cartRows || []) {
    const oid = cr.id
    if (oid == null) continue
    let cart: OrderCartLine[] = []
    try {
      if (cr.cart_json) cart = JSON.parse(cr.cart_json) || []
    } catch {
      cart = []
    }
    out[String(oid)] = cart
  }
  return out
}

async function loadItemPriceByCode(): Promise<Record<string, number>> {
  const rows = (await supabaseSelect('items', {
    order: 'id.asc',
    select: 'code,price',
    limit: 10000,
  })) as { code?: string; price?: number }[] | null
  const map: Record<string, number> = {}
  for (const r of rows || []) {
    const code = String(r.code || '').trim()
    if (code) map[code] = Number(r.price) || 0
  }
  return map
}

async function loadItemMetaMap(warehouseKey: string): Promise<Record<string, ItemMeta>> {
  const rows = (await supabaseSelect('items', {
    order: 'id.asc',
    select: 'code,name,spec,unit,price,cost,category',
    limit: 10000,
  })) as {
    code?: string
    name?: string
    spec?: string
    unit?: string
    price?: number
    cost?: number
    category?: string
  }[] | null

  const safeStore = warehouseKey.trim() || DEFAULT_WAREHOUSE_KEY
  const safeRows = (await supabaseSelectFilter(
    'store_settings',
    `store=ilike.${encodeURIComponent(safeStore)}`,
    { select: 'code,safe_qty', limit: 10000 }
  )) as { code?: string; safe_qty?: number }[] | null
  const safeMap: Record<string, number> = {}
  for (const s of safeRows || []) {
    const c = String(s.code || '').trim()
    if (c) safeMap[c] = Number(s.safe_qty) || 0
  }

  const map: Record<string, ItemMeta> = {}
  for (const r of rows || []) {
    const code = String(r.code || '').trim()
    if (!code) continue
    map[code] = {
      code,
      name: String(r.name || '').trim(),
      spec: String(r.spec || '').trim() || '-',
      unit: String(r.unit || '').trim() || '-',
      cost: Number(r.cost) || 0,
      price: Number(r.price) || 0,
      category: String(r.category || '').trim(),
      minQty: safeMap[code] || 0,
    }
  }
  return map
}

async function fetchHqStockQtyMap(warehouseKey: string, asOfYmd: string): Promise<Record<string, number>> {
  const patterns = getStockLocationPatterns(warehouseKey)
  const asOfIso = getBangkokEndOfDayUtcIso(asOfYmd)
  try {
    const rows = (await supabaseRpc<{ item_code: string; total_qty: number }[]>('get_store_stock', {
      p_location_patterns: patterns,
      p_as_of_date: asOfIso,
    })) as { item_code?: string; total_qty?: number }[] | null
    const m: Record<string, number> = {}
    for (const r of rows || []) {
      const code = String(r.item_code || '').trim()
      if (!code) continue
      m[code] = Number(r.total_qty ?? 0)
    }
    return m
  } catch {
    let locFilter = 'id=gt.0'
    if (patterns.length === 1) {
      locFilter = `location=ilike.${encodeURIComponent(patterns[0]!)}`
    } else if (patterns.length > 1) {
      locFilter = `or=(${patterns.map((p) => `location.ilike.${encodeURIComponent(p)}`).join(',')})`
    }
    const dateSuffix = `&log_date=lte.${encodeURIComponent(asOfIso)}`
    const rows = (await supabaseSelectFilterAllPages('stock_logs', `${locFilter}${dateSuffix}`, {
      order: 'id.asc',
      pageSize: 8000,
      maxRows: ROW_CAP,
      select: 'item_code,qty',
    })) as { item_code?: string; qty?: number }[] | null
    const m: Record<string, number> = {}
    for (const r of rows || []) {
      const code = String(r.item_code || '').trim()
      if (!code) continue
      m[code] = (m[code] || 0) + Number(r.qty || 0)
    }
    return m
  }
}

function parseYmdRangeDays(startStr: string, endStr: string): number {
  const lo = startStr.trim().slice(0, 10)
  const hi = endStr.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lo) || !/^\d{4}-\d{2}-\d{2}$/.test(hi)) return 1
  const startMs = Date.parse(getBangkokEndOfDayUtcIso(lo))
  const endMs = Date.parse(getBangkokEndOfDayUtcIso(hi))
  const diff = Math.round((endMs - startMs) / 86400000) + 1
  return Math.max(1, diff)
}

function invoiceNoFromLog(
  ymd: string,
  logType: string,
  orderId: number | null,
  stockLogId: number
): string | null {
  const datePart = ymd.replace(/\D/g, '').slice(0, 8)
  if (datePart.length < 8) return null
  if (logType === 'Outbound' && orderId != null && orderId > 0) {
    return `IV${datePart}-${orderId}`
  }
  if (logType === 'ForceOutbound' && stockLogId > 0) {
    return `IVF${datePart}-${stockLogId}`
  }
  return null
}

function sortColumns(cols: HqWarehouseMovementColumn[]): HqWarehouseMovementColumn[] {
  const kindOrder = { in: 0, out: 1, adjust: 2 }
  return [...cols].sort((a, b) => {
    if (a.ymd !== b.ymd) return a.ymd.localeCompare(b.ymd)
    const ka = kindOrder[a.kind]
    const kb = kindOrder[b.kind]
    if (ka !== kb) return ka - kb
    return (a.store || '').localeCompare(b.store || '')
  })
}

export function parseHqDailyMatrixDateRange(
  startRaw: string | null | undefined,
  endRaw: string | null | undefined
): { startStr: string; endStr: string } | null {
  const startStr = String(startRaw || '').trim().slice(0, 10)
  const endStr = String(endRaw || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) return null
  const lo = startStr <= endStr ? startStr : endStr
  const hi = startStr <= endStr ? endStr : startStr
  return { startStr: lo, endStr: hi }
}

export async function buildHqWarehouseDailyStockMatrix(params: {
  startStr: string
  endStr: string
  storeFilter?: string | null
  categoryFilter?: string | null
  warehouseKey?: string | null
  includePriorPeriod?: boolean
}): Promise<HqWarehouseDailyStockMatrixResult> {
  const startStr = params.startStr
  const endStr = params.endStr
  const warehouseKey = String(params.warehouseKey || DEFAULT_WAREHOUSE_KEY).trim() || DEFAULT_WAREHOUSE_KEY
  const storeFilter =
    params.storeFilter && params.storeFilter !== 'All' ? String(params.storeFilter).trim() : null
  const categoryFilter = params.categoryFilter?.trim() || null
  const includePriorPeriod = params.includePriorPeriod !== false
  const periodDays = parseYmdRangeDays(startStr, endStr)
  const beginningYmd = addBangkokCalendarDays(startStr, -1)
  const { priorStart, priorEnd } = computePriorPeriodRange(startStr, endStr)

  const locPeriodFilter = buildHqLocationPeriodFilter(startStr, endStr, warehouseKey)
  const [
    rpcRows,
    outboundRaw,
    inboundRawFallback,
    adjustRawFallback,
    itemMetaMap,
    itemPriceByCode,
    valuationMap,
    beginningMap,
    balanceMap,
    warehouseOptions,
    priorOutByCode,
  ] = await Promise.all([
    tryFetchMovementAggRpc(warehouseKey, startStr, endStr),
    fetchOutboundRawLogs(startStr, endStr, warehouseKey),
    fetchStockLogsByType('Inbound', locPeriodFilter),
    fetchStockLogsByType('Adjustment', locPeriodFilter),
    loadItemMetaMap(warehouseKey),
    loadItemPriceByCode(),
    loadValuationUnitCostMap(),
    fetchHqStockQtyMap(warehouseKey, beginningYmd),
    fetchHqStockQtyMap(warehouseKey, endStr),
    loadWarehouseOptions(),
    includePriorPeriod
      ? fetchPriorOutByCode(warehouseKey, priorStart, priorEnd)
      : Promise.resolve({} as Record<string, number>),
  ])

  const usedRpc = Boolean(rpcRows?.length)
  const inboundRaw = usedRpc ? [] : inboundRawFallback
  const adjustRaw = usedRpc ? [] : adjustRawFallback

  const hitRowCap =
    outboundRaw.length +
    inboundRawFallback.length +
    adjustRawFallback.length +
    (rpcRows?.length || 0) >= ROW_CAP

  const orderIds = new Set<number>()
  for (const row of outboundRaw) {
    if (String(row.log_type) === 'Outbound' && row.order_id != null) {
      const oid = Number(row.order_id)
      if (oid > 0) orderIds.add(oid)
    }
  }
  const orderCartByOrderId = await loadOrderCartsById([...orderIds])

  const columnMap = new Map<string, HqWarehouseMovementColumn>()
  const cellByItem = new Map<string, Record<string, number>>()
  const itemCodes = new Set<string>()
  const storeSet = new Set<string>()
  const totalInByCode = new Map<string, number>()
  const totalOutByCode = new Map<string, number>()

  const addCell = (code: string, colKey: string, delta: number) => {
    if (!code || !delta) return
    itemCodes.add(code)
    let cells = cellByItem.get(code)
    if (!cells) {
      cells = {}
      cellByItem.set(code, cells)
    }
    cells[colKey] = (cells[colKey] || 0) + delta
  }

  const ensureInCol = (ymd: string) => {
    const key = `in|${ymd}`
    if (!columnMap.has(key)) {
      columnMap.set(key, { key, ymd, kind: 'in', label: 'IN' })
    }
    return key
  }

  const ensureOutCol = (ymd: string, store: string) => {
    const key = `out|${ymd}|${store}`
    if (!columnMap.has(key)) {
      columnMap.set(key, {
        key,
        ymd,
        kind: 'out',
        store,
        label: `OUT ${store}`,
      })
    }
    return key
  }

  const ensureAdjCol = (ymd: string) => {
    const key = `adj|${ymd}`
    if (!columnMap.has(key)) {
      columnMap.set(key, { key, ymd, kind: 'adjust', label: 'ADJ' })
    }
    return key
  }

  if (usedRpc && rpcRows) {
    for (const row of rpcRows) {
      const ymd = String(row.bangkok_ymd || '').trim().slice(0, 10)
      if (!ymd || ymd < startStr || ymd > endStr) continue
      const logType = String(row.log_type || '')
      const code = String(row.item_code || '').trim()
      const qtyRaw = Number(row.qty_sum) || 0
      if (!code || qtyRaw === 0) continue

      if (logType === 'Inbound') {
        const qty = qtyRaw > 0 ? qtyRaw : Math.abs(qtyRaw)
        const colKey = ensureInCol(ymd)
        addCell(code, colKey, qty)
        totalInByCode.set(code, (totalInByCode.get(code) || 0) + qty)
        continue
      }
      if (logType === 'Adjustment') {
        const colKey = ensureAdjCol(ymd)
        addCell(code, colKey, qtyRaw)
        if (qtyRaw > 0) totalInByCode.set(code, (totalInByCode.get(code) || 0) + qtyRaw)
        else totalOutByCode.set(code, (totalOutByCode.get(code) || 0) + Math.abs(qtyRaw))
        continue
      }
      if (logType === 'Outbound' || logType === 'ForceOutbound') {
        const target = String(row.vendor_target || '').trim()
        if (!target || isHeadOfficeLikeStoreName(target)) continue
        if (storeFilter && !storeMatchesIncomeFilter(target, storeFilter)) continue
        const qtyAbs = Math.abs(qtyRaw)
        if (!qtyAbs) continue
        storeSet.add(target)
        const colKey = ensureOutCol(ymd, target)
        addCell(code, colKey, qtyAbs)
        totalOutByCode.set(code, (totalOutByCode.get(code) || 0) + qtyAbs)
      }
    }
  }

  for (const row of inboundRaw) {
    if (!isOutboundLogDateInBangkokYmdRange(row.log_date, startStr, endStr)) continue
    const ymd = formatDateBangkok(new Date(row.log_date || ''))
    const code = String(row.item_code || '').trim()
    const qty = Number(row.qty) || 0
    if (!code || qty <= 0) continue
    const colKey = ensureInCol(ymd)
    addCell(code, colKey, qty)
    totalInByCode.set(code, (totalInByCode.get(code) || 0) + qty)
    itemCodes.add(code)
  }

  for (const row of adjustRaw) {
    if (!isOutboundLogDateInBangkokYmdRange(row.log_date, startStr, endStr)) continue
    const ymd = formatDateBangkok(new Date(row.log_date || ''))
    const code = String(row.item_code || '').trim()
    const qty = Number(row.qty) || 0
    if (!code || qty === 0) continue
    const colKey = ensureAdjCol(ymd)
    addCell(code, colKey, qty)
    if (qty > 0) totalInByCode.set(code, (totalInByCode.get(code) || 0) + qty)
    else totalOutByCode.set(code, (totalOutByCode.get(code) || 0) + Math.abs(qty))
    itemCodes.add(code)
  }

  type InvoiceAcc = {
    ymd: string
    store: string
    type: 'Outbound' | 'Force'
    orderId?: number
    stockLogId?: number
    invoiceNo: string
    subtotalRaw: number
  }
  const invoiceAcc = new Map<string, InvoiceAcc>()

  const outboundCodes = [...new Set(outboundRaw.map((r) => String(r.item_code || '').trim()).filter(Boolean))]
  const directMap = outboundCodes.length ? await getDirectSettlementMap(outboundCodes) : {}

  for (const row of outboundRaw) {
    const logType = String(row.log_type || '')
    if (logType !== 'Outbound' && logType !== 'ForceOutbound') continue
    if (!isOutboundLogDateInBangkokYmdRange(row.log_date, startStr, endStr)) continue

    const ymd = formatDateBangkok(new Date(row.log_date || ''))
    const target = String(row.vendor_target || '').trim()
    if (!target || isHeadOfficeLikeStoreName(target)) continue
    if (storeFilter && !storeMatchesIncomeFilter(target, storeFilter)) continue

    const code = String(row.item_code || '').trim()
    const qtyAbs = Math.abs(Number(row.qty) || 0)
    if (!code || qtyAbs <= 0) continue

    if (!usedRpc) {
      storeSet.add(target)
      const colKey = ensureOutCol(ymd, target)
      addCell(code, colKey, qtyAbs)
      totalOutByCode.set(code, (totalOutByCode.get(code) || 0) + qtyAbs)
    } else {
      storeSet.add(target)
    }

    const orderId =
      logType === 'Outbound' && row.order_id != null ? Number(row.order_id) : null
    const stockLogId = Number(row.id) || 0
    const typeCode: 'Outbound' | 'Force' = logType === 'ForceOutbound' ? 'Force' : 'Outbound'
    const orderRowId = typeCode === 'Outbound' && orderId && orderId > 0 ? String(orderId) : ''
    const cartForPrice =
      orderRowId && orderCartByOrderId[orderRowId]?.length ? orderCartByOrderId[orderRowId] : undefined
    const masterPrice = itemPriceByCode[code] ?? 0
    const unitPrice = unitPriceFromOutboundLogSnapshot(
      row,
      cartForPrice,
      code,
      String(row.item_name || '').trim(),
      masterPrice
    )
    const isInternalUseForce = typeCode === 'Force' && isInternalForceOutboundTarget(target)
    let lineAmount = round2(isInternalUseForce ? 0 : unitPrice * qtyAbs)
    if (code && directMap[code]) lineAmount = 0

    const invKey =
      typeCode === 'Outbound' && orderId && orderId > 0
        ? `o|${ymd}|${target}|${orderId}`
        : `f|${ymd}|${target}|${stockLogId}`
    const invoiceNo = invoiceNoFromLog(ymd, logType, orderId, stockLogId) || ''
    let acc = invoiceAcc.get(invKey)
    if (!acc) {
      acc = {
        ymd,
        store: target,
        type: typeCode,
        orderId: orderId && orderId > 0 ? orderId : undefined,
        stockLogId: typeCode === 'Force' && stockLogId > 0 ? stockLogId : undefined,
        invoiceNo,
        subtotalRaw: 0,
      }
      invoiceAcc.set(invKey, acc)
    }
    acc.subtotalRaw += lineAmount
    if (!acc.invoiceNo && invoiceNo) acc.invoiceNo = invoiceNo
  }

  for (const code of Object.keys(beginningMap)) itemCodes.add(code)
  for (const code of Object.keys(balanceMap)) itemCodes.add(code)

  const sortedCodes = [...itemCodes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const items: HqWarehouseDailyItemRow[] = []
  for (const code of sortedCodes) {
    const meta = itemMetaMap[code]
    if (categoryFilter) {
      const cat = meta?.category || ''
      if (cat !== categoryFilter) continue
    }

    const cells = cellByItem.get(code) || {}
    const beginning = beginningMap[code] ?? 0
    const balance = balanceMap[code] ?? 0
    const totalIn = totalInByCode.get(code) || 0
    const totalOut = totalOutByCode.get(code) || 0
    const hasActivity =
      totalIn > 0 ||
      totalOut > 0 ||
      beginning !== 0 ||
      balance !== 0 ||
      Object.keys(cells).length > 0
    if (!hasActivity) continue

    const avgOutPerDay = totalOut / periodDays
    const avgOutPerWeek = avgOutPerDay * 7
    const avgOutPerMonth = avgOutPerDay * 30
    const orderPeriodDays =
      avgOutPerDay > 0 && balance > 0 ? Math.round(balance / avgOutPerDay) : balance > 0 ? null : 0
    const valuationUnitCost = valuationMap[code] ?? meta?.cost ?? 0
    const priorTotalOut = priorOutByCode[code] || 0

    items.push({
      code,
      name: meta?.name || code,
      spec: meta?.spec || '-',
      unit: meta?.unit || '-',
      cost: meta?.cost ?? 0,
      price: meta?.price ?? itemPriceByCode[code] ?? 0,
      category: meta?.category || '',
      cells,
      beginning,
      balance,
      minQty: meta?.minQty ?? 0,
      totalIn,
      totalOut,
      avgOutPerDay: round2(avgOutPerDay),
      avgOutPerWeek: round2(avgOutPerWeek),
      avgOutPerMonth: round2(avgOutPerMonth),
      orderPeriodDays,
      valuationUnitCost,
      priorTotalOut,
      outChangePct: pctChange(totalOut, priorTotalOut),
      costOfGoods: round2(balance * valuationUnitCost),
      sparkline: [],
    })
  }

  const dayInvoices: HqWarehouseDayInvoice[] = []
  for (const acc of invoiceAcc.values()) {
    if (!acc.invoiceNo && acc.subtotalRaw <= 0) continue
    const tax = thaiInvoiceTotalsFromRawSubtotal(acc.subtotalRaw)
    dayInvoices.push({
      ymd: acc.ymd,
      store: acc.store,
      invoiceNo: acc.invoiceNo,
      type: acc.type,
      orderId: acc.orderId,
      stockLogId: acc.stockLogId,
      subtotal: tax.subtotalRounded,
      vat: tax.vatRounded,
      grandTotal: tax.grandTotal,
    })
  }
  dayInvoices.sort((a, b) => b.ymd.localeCompare(a.ymd) || a.store.localeCompare(b.store))

  const columns = sortColumns([...columnMap.values()])
  const stores = [...storeSet].sort((a, b) => a.localeCompare(b))
  const itemsFinal = items.map((row) => ({
    ...row,
    sparkline: buildDailyOutSparkline(columns, row.cells),
  }))

  return {
    startStr,
    endStr,
    warehouseKey,
    warehouseLabel: warehouseKey === '본사' || warehouseKey === '입고등록' ? 'S&J' : warehouseKey,
    warehouseOptions,
    columns,
    items: itemsFinal,
    dayInvoices,
    stores,
    periodDays,
    hitRowCap,
    usedRpc,
    priorStartStr: includePriorPeriod ? priorStart : undefined,
    priorEndStr: includePriorPeriod ? priorEnd : undefined,
  }
}
