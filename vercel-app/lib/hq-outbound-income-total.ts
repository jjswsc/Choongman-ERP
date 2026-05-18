/**
 * 손익 「본사 창고 출고(매입)」 = 출고 관리(getCombinedOutboundHistory)의
 * **실제 stock_logs 출고 줄** 합계와 동일 단가·동일 필터 (미수령 발주 가상 줄 제외).
 */
import { supabaseSelect, supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { STOCK_LOG_OUTBOUND_HISTORY_COLS } from '@/lib/postgrest-narrow-select'
import { storeMatchesIncomeFilter } from '@/lib/accounting-store-match'
import { isInternalForceOutboundTarget } from '@/lib/internal-outbound'
import {
  type OrderCartLine,
  formatDateBangkok,
  unitPriceFromOutboundLogSnapshot,
} from '@/lib/outbound-order-line-match'
import { getStockLocationPatterns } from '@/lib/stock-location-patterns'

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

function buildOutboundLogDateFilter(startStr: string, endStr: string): string {
  return `log_date=gte.${startStr}&log_date=lte.${endStr}T23:59:59.999&is_deleted=is.false`
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
  const locationPatterns = getStockLocationPatterns('본사')
  const dateFilter = buildOutboundLogDateFilter(startStr, endStr)
  const locFilter = appendLocationPatternFilter(dateFilter, locationPatterns)

  const [outboundLogs, forceLogs] = await Promise.all([
    supabaseSelectFilterAllPages('stock_logs', `log_type=eq.Outbound&${locFilter}`, {
      order: 'log_date.desc',
      select: STOCK_LOG_OUTBOUND_HISTORY_COLS,
      pageSize: 8000,
      maxRows: 100_000,
    }) as Promise<OutboundLogRow[]>,
    supabaseSelectFilterAllPages('stock_logs', `log_type=eq.ForceOutbound&${locFilter}`, {
      order: 'log_date.desc',
      select: STOCK_LOG_OUTBOUND_HISTORY_COLS,
      pageSize: 8000,
      maxRows: 100_000,
    }) as Promise<OutboundLogRow[]>,
  ])

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

  const startDate = new Date(startStr)
  startDate.setHours(0, 0, 0, 0)
  const endDate = new Date(endStr)
  endDate.setHours(23, 59, 59, 999)

  const lines: HqOutboundProcessedLine[] = []

  for (const row of allLogs) {
    const type = String(row.log_type || '')
    if (type !== 'Outbound' && type !== 'ForceOutbound') continue

    const rowDate = new Date(row.log_date || '')
    if (isNaN(rowDate.getTime()) || rowDate < startDate || rowDate > endDate) continue

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

/**
 * 본사 창고 출고 매입 — 출고 관리 기간 총액(실제 출고 로그)과 동일 단가.
 */
export async function sumHqOutboundSubtotalMatchingOutboundManagement(params: {
  startStr: string
  endStr: string
  storeFilter: string | null
  isExpenseRoutedItem?: (itemCode: string) => { isExpense: boolean; subjectId: number | null }
  addExpenseToMap?: (subjectId: number | null, amount: number) => void
}): Promise<HqOutboundIncomeSplit> {
  const { lines, hitRowCap } = await loadHqOutboundProcessedLines({
    startStr: params.startStr,
    endStr: params.endStr,
    storeFilter: params.storeFilter,
  })

  let subtotalBeforeExpenseSplit = 0
  let purchaseTotal = 0
  const expenseBySubject = new Map<number | null, number>()

  for (const line of lines) {
    const amount = line.lineAmount
    subtotalBeforeExpenseSplit += amount

    const routed = params.isExpenseRoutedItem?.(line.itemCode)
    if (routed?.isExpense) {
      const sid = routed.subjectId
      expenseBySubject.set(sid, (expenseBySubject.get(sid) || 0) + amount)
      params.addExpenseToMap?.(sid, amount)
    } else {
      purchaseTotal += amount
    }
  }

  return {
    purchaseTotal,
    expenseBySubject,
    lineCount: lines.length,
    subtotalBeforeExpenseSplit,
    hitRowCap,
  }
}

/** 손익 매입 상세 — 매출원가에 포함된 출고 줄만 (비용 계정 품목 제외) */
export async function listHqOutboundPurchaseDrillLines(params: {
  startStr: string
  endStr: string
  storeFilter: string | null
  isExpenseRoutedItem?: (itemCode: string) => { isExpense: boolean; subjectId: number | null }
}): Promise<{ lines: HqOutboundProcessedLine[]; hitRowCap: boolean }> {
  const { lines, hitRowCap } = await loadHqOutboundProcessedLines({
    startStr: params.startStr,
    endStr: params.endStr,
    storeFilter: params.storeFilter,
  })
  const filtered = lines.filter((line) => {
    const routed = params.isExpenseRoutedItem?.(line.itemCode)
    return !routed?.isExpense
  })
  return { lines: filtered, hitRowCap }
}
