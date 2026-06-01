/**
 * 손익 「본사 창고 출고(매입)」 = 출고 관리(getCombinedOutboundHistory)의
 * **실제 stock_logs 출고 줄** 합계와 동일 단가·동일 필터 (미수령 발주 가상 줄 제외).
 */
import { supabaseSelect, supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { STOCK_LOG_OUTBOUND_HISTORY_COLS } from '@/lib/postgrest-narrow-select'
import { buildStoreFieldOrIlikeFragment, storeMatchesIncomeFilter } from '@/lib/accounting-store-match'
import { isInternalForceOutboundTarget } from '@/lib/internal-outbound'
import { getBangkokDateRangeUtc } from '@/lib/bangkok-time'
import {
  type OrderCartLine,
  formatDateBangkok,
  unitPriceFromOutboundLogSnapshot,
} from '@/lib/outbound-order-line-match'
import { getStockLocationPatterns } from '@/lib/stock-location-patterns'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'

const OFFICE_STORE_LABELS = new Set(['본사', 'Office', '오피스', '본점'])

/**
 * 본사 손익(매출) — 매출처 필터: UI에서 「본사」를 고른 경우 전 매출처 출고 합.
 * 특정 가맹 매장만 볼 때는 해당 vendor_target 만 (본사 화면에서 매장 선택 시 isHQ=false).
 */
export function resolveHqOutboundSalesCustomerFilter(storeFilter: string | null): string | null {
  const s = String(storeFilter || '').trim()
  if (!s || s === 'All' || s === '전체 매출처') return null
  if (OFFICE_STORE_LABELS.has(s) || isHeadOfficeLikeStoreName(s)) return null
  return s
}

type OutboundLogRow = {
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

export type HqOutboundProcessedLine = {
  id: number
  logDate: string
  logType: string | null
  itemCode: string
  targetStore: string | null
  qty: number
  unitPrice: number
  lineAmount: number
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

/** 출고 관리·손익 공통 — 본사 창고 location + 기간 + (선택) 매출처 (log_type 은 호출측에서 붙임) */
export function buildHqWarehouseOutboundStockLogsFilter(params: {
  startStr: string
  endStr: string
  vendorFilter?: string | null
  includeSoftDeleteFilter?: boolean
}): string {
  let f = buildOutboundLogDateFilter(
    params.startStr,
    params.endStr,
    params.includeSoftDeleteFilter !== false
  )
  f = appendLocationPatternFilter(f, getStockLocationPatterns('본사'))
  const vf = String(params.vendorFilter || '').trim()
  if (vf && vf !== 'All' && vf !== '전체 매출처') {
    const storeFrag = buildStoreFieldOrIlikeFragment('vendor_target', vf)
    if (storeFrag) f += `&${storeFrag}`
  }
  return f
}

/** stock_logs.log_date → 방콕 달력 YYYY-MM-DD 가 start~end(포함) 안인지 — 손익·출고 관리 공통 */
export function isOutboundLogDateInBangkokYmdRange(
  logDateRaw: string | null | undefined,
  startYmd: string,
  endYmd: string
): boolean {
  if (!logDateRaw) return false
  const d = new Date(logDateRaw)
  if (Number.isNaN(d.getTime())) return false
  const ymd = formatDateBangkok(d)
  const lo = startYmd.trim().slice(0, 10)
  const hi = endYmd.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !/^\d{4}-\d{2}-\d{2}$/.test(lo) || !/^\d{4}-\d{2}-\d{2}$/.test(hi)) {
    return false
  }
  const loEff = lo <= hi ? lo : hi
  const hiEff = lo <= hi ? hi : lo
  return ymd >= loEff && ymd <= hiEff
}

function buildOutboundLogDateFilter(startStr: string, endStr: string, includeSoftDeleteFilter: boolean): string {
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  const base = `log_date=gte.${encodeURIComponent(dayStartUtcIso)}&log_date=lt.${encodeURIComponent(nextDayStartUtcIso)}`
  return includeSoftDeleteFilter ? `${base}&is_deleted=is.false` : base
}

async function fetchOutboundLogsPage(
  logType: 'Outbound' | 'ForceOutbound',
  locFilter: string,
  select: string
): Promise<OutboundLogRow[]> {
  const typeEq = logType === 'Outbound' ? 'log_type=eq.Outbound' : 'log_type=eq.ForceOutbound'
  try {
    return (await supabaseSelectFilterAllPages('stock_logs', `${typeEq}&${locFilter}`, {
      order: 'log_date.desc',
      select,
      pageSize: 8000,
      maxRows: 1_000_000,
    })) as OutboundLogRow[]
  } catch (e) {
    const msg = String(e || '').toLowerCase()
    if (!msg.includes('is_deleted') && !msg.includes('42703')) throw e
    const relaxed = locFilter.replace(/&is_deleted=is\.false/g, '')
    return (await supabaseSelectFilterAllPages('stock_logs', `${typeEq}&${relaxed}`, {
      order: 'log_date.desc',
      select,
      pageSize: 8000,
      maxRows: 1_000_000,
    })) as OutboundLogRow[]
  }
}

/** 품목 마스터 판매가(items.price) — 매장 매입 단가 폴백(본사 내부 원가 items.cost 아님) */
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

/** 본사 창고 실제 출고 로그 — 출고 관리·손익·상세 펼침 공통 */
export async function loadHqOutboundProcessedLines(params: {
  startStr: string
  endStr: string
  storeFilter: string | null
}): Promise<{ lines: HqOutboundProcessedLine[]; hitRowCap: boolean }> {
  const { startStr, endStr, storeFilter } = params
  const itemPriceByCode = await loadItemPriceByCode()
  const vendorForFilter =
    storeFilter && storeFilter !== 'All' ? storeFilter : null

  let outboundLogs: OutboundLogRow[]
  let forceLogs: OutboundLogRow[]
  try {
    ;[outboundLogs, forceLogs] = await Promise.all([
      fetchOutboundLogsPage(
        'Outbound',
        buildHqWarehouseOutboundStockLogsFilter({
          startStr,
          endStr,
          vendorFilter: vendorForFilter,
          includeSoftDeleteFilter: true,
        }),
        STOCK_LOG_OUTBOUND_HISTORY_COLS
      ),
      fetchOutboundLogsPage(
        'ForceOutbound',
        buildHqWarehouseOutboundStockLogsFilter({
          startStr,
          endStr,
          vendorFilter: vendorForFilter,
          includeSoftDeleteFilter: true,
        }),
        STOCK_LOG_OUTBOUND_HISTORY_COLS
      ),
    ])
  } catch {
    ;[outboundLogs, forceLogs] = await Promise.all([
      fetchOutboundLogsPage(
        'Outbound',
        buildHqWarehouseOutboundStockLogsFilter({
          startStr,
          endStr,
          vendorFilter: vendorForFilter,
          includeSoftDeleteFilter: false,
        }),
        STOCK_LOG_OUTBOUND_HISTORY_COLS
      ),
      fetchOutboundLogsPage(
        'ForceOutbound',
        buildHqWarehouseOutboundStockLogsFilter({
          startStr,
          endStr,
          vendorFilter: vendorForFilter,
          includeSoftDeleteFilter: false,
        }),
        STOCK_LOG_OUTBOUND_HISTORY_COLS
      ),
    ])
  }

  const hitRowCap = outboundLogs.length + forceLogs.length >= 100_000
  const allLogs = [...outboundLogs, ...forceLogs]
  const orderIds = new Set<number>()
  for (const row of allLogs) {
    if (String(row.log_type || '') === 'Outbound' && row.order_id != null) {
      const oid = Number(row.order_id)
      if (oid > 0) orderIds.add(oid)
    }
  }
  const orderCartByOrderId = await loadOrderCartsById([...orderIds])

  const lines: HqOutboundProcessedLine[] = []

  for (const row of allLogs) {
    const type = String(row.log_type || '')
    if (type !== 'Outbound' && type !== 'ForceOutbound') continue

    if (!isOutboundLogDateInBangkokYmdRange(row.log_date, startStr, endStr)) continue
    const rowDate = new Date(row.log_date || '')
    if (Number.isNaN(rowDate.getTime())) continue

    const target = String(row.vendor_target || '').trim()
    if (storeFilter && storeFilter !== 'All') {
      if (!storeMatchesIncomeFilter(target, storeFilter)) continue
    }

    const code = String(row.item_code || '').trim()
    if (!code) continue
    const qtyAbs = Math.abs(Number(row.qty) || 0)
    if (qtyAbs <= 0) continue

    const id = Number(row.id)
    if (!id) continue

    const typeCode = type === 'ForceOutbound' ? 'Force' : 'Outbound'
    const orderRowId = typeCode === 'Outbound' && row.order_id ? String(row.order_id) : ''
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
    const lineAmount = round2(isInternalUseForce ? 0 : unitPrice * qtyAbs)
    if (!lineAmount) continue

    lines.push({
      id,
      logDate: formatDateBangkok(rowDate),
      logType: type,
      itemCode: code,
      targetStore: target || null,
      qty: qtyAbs,
      unitPrice: round2(unitPrice),
      lineAmount,
    })
  }

  lines.sort((a, b) => b.logDate.localeCompare(a.logDate) || b.id - a.id)
  return { lines, hitRowCap }
}

export type HqOutboundIncomeSplit = {
  purchaseTotal: number
  expenseBySubject: Map<number | null, number>
  lineCount: number
  subtotalBeforeExpenseSplit: number
  hitRowCap: boolean
}

export type HqOutboundSalesAggregate = {
  salesTotal: number
  salesByCustomer: { key: string; amount: number; label?: string }[]
  lineCount: number
  hitRowCap: boolean
}

/**
 * 본사 손익 「매출」— 출고 관리(getCombinedOutboundHistory)와 동일:
 * 본사 창고 stock_logs 출고 줄 합계(매출처별), 발주 orders.total 아님.
 */
export async function sumHqOutboundSalesMatchingOutboundManagement(params: {
  startStr: string
  endStr: string
  storeFilter: string | null
}): Promise<HqOutboundSalesAggregate> {
  const customerFilter = resolveHqOutboundSalesCustomerFilter(params.storeFilter)
  const { lines, hitRowCap } = await loadHqOutboundProcessedLines({
    startStr: params.startStr,
    endStr: params.endStr,
    storeFilter: customerFilter,
  })

  const byCustomer: Record<string, number> = {}
  let salesTotal = 0

  for (const line of lines) {
    const store = String(line.targetStore || '').trim()
    if (!store || isHeadOfficeLikeStoreName(store)) continue
    salesTotal += line.lineAmount
    const k = store || '__pl_sales_customer_unknown__'
    byCustomer[k] = (byCustomer[k] || 0) + line.lineAmount
  }

  const salesByCustomer = Object.entries(byCustomer)
    .filter(([, v]) => v > 0)
    .map(([key, amount]) => ({ key, amount, label: key === '__pl_sales_customer_unknown__' ? undefined : key }))
    .sort((a, b) => b.amount - a.amount)

  return {
    salesTotal: round2(salesTotal),
    salesByCustomer,
    lineCount: lines.length,
    hitRowCap,
  }
}

/**
 * 본사 창고 출고 매입 — 출고 관리 기간 총액(실제 출고 로그)과 동일 단가.
 */
export async function sumHqOutboundSubtotalMatchingOutboundManagement(params: {
  startStr: string
  endStr: string
  storeFilter: string | null
}): Promise<HqOutboundIncomeSplit> {
  const { lines, hitRowCap } = await loadHqOutboundProcessedLines({
    startStr: params.startStr,
    endStr: params.endStr,
    storeFilter: params.storeFilter,
  })

  let purchaseTotal = 0
  for (const line of lines) {
    purchaseTotal += line.lineAmount
  }

  return {
    purchaseTotal,
    expenseBySubject: new Map(),
    lineCount: lines.length,
    subtotalBeforeExpenseSplit: purchaseTotal,
    hitRowCap,
  }
}

/** 손익 매입 상세 — 매출원가에 포함된 출고 줄만 (비용 계정 품목 제외) */
export async function listHqOutboundPurchaseDrillLines(params: {
  startStr: string
  endStr: string
  storeFilter: string | null
}): Promise<{ lines: HqOutboundProcessedLine[]; hitRowCap: boolean }> {
  return loadHqOutboundProcessedLines({
    startStr: params.startStr,
    endStr: params.endStr,
    storeFilter: params.storeFilter,
  })
}
