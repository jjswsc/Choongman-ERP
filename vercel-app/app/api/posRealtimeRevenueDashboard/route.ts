import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilterStrippingUnknownColumns } from '@/lib/supabase-pgrst204-retry'
import {
  filterRowsByPosSalesBusinessDateRange,
  posSalesBusinessDateRangeUtcEnvelope,
} from '@/lib/pos-sales-business-day-range'
import {
  appendStoreCodeFilterAsync,
  canonicalSalesStoreRowKey,
  resolveStoresFromParams,
  rowMatchesSalesStoreSelection,
} from '@/lib/pos-sales-store-filter'
import { applyPosSalesStoreSelectionFilterAsync } from '@/lib/pos-sales-fetch-rows'
import { excludePosSalesTestOfficeRows } from '@/lib/pos-sales-test-office'
import { parseOrderTypesParam, rowMatchesOrderFilter } from '@/lib/pos-sales-order-type-filter'
import { loadPosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { isOfficeRole } from '@/lib/permissions'

const FETCH_LIMIT = 50000
const COMPLETED_STATUSES = new Set(['completed', 'paid', 'ready'])
const WAITING_STATUSES = new Set(['pending', 'cooking', 'preparing'])
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'refunded'])
const STOCKOUT_KEYWORDS = [
  'sold out',
  'soldout',
  'stockout',
  'out of stock',
  'out-of-stock',
  '품절',
  '재고없',
  '재고 없음',
  'หมด',
]

type DashboardOrderRow = {
  id?: number
  order_no?: string
  created_at?: string
  store_code?: string
  order_type?: string
  status?: string
  total?: number
  memo?: string
  items_json?: string
}

type DelayedOrderSummary = {
  id: number
  orderNo: string
  createdAt: string
  elapsedMin: number
  total: number
}

type StoreAccumulator = {
  storeCode: string
  grossAmount: number
  orderCount: number
  completedRevenue: number
  completedCount: number
  waitingRevenue: number
  waitingOrders: number
  waitingElapsedSum: number
  waitingElapsedWeightedSum: number
  waitingWeightBase: number
  delayedRevenue: number
  delayedOrders: number
  cancelAmount: number
  cancelCount: number
  stockoutCancelAmount: number
  stockoutCancelCount: number
  hourlyRevenue: number[]
  delayedTopOrders: DelayedOrderSummary[]
}

function toBangkokYmd(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function toBangkokHour(dateIso: string): number | null {
  const d = new Date(dateIso)
  if (!Number.isFinite(d.getTime())) return null
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    hour12: false,
  }).format(d)
  const hour = Number(hourStr)
  return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : null
}

function parseOrderCancelReason(memo: string): string {
  const lines = String(memo || '').split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim()
    const match = /^\[ORDER_(?:CANCELLED|REFUNDED)\s+[^\]]+\]\s*(.+)$/.exec(line)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function parseLineCancelReasons(itemsJson: string): string[] {
  let rows: unknown[] = []
  try {
    const parsed = JSON.parse(String(itemsJson || '[]'))
    if (Array.isArray(parsed)) rows = parsed
  } catch {
    rows = []
  }
  const out: string[] = []
  for (const raw of rows) {
    const it = raw as { cancelledAt?: string | null; cancelReason?: string | null }
    if (!String(it.cancelledAt || '').trim()) continue
    const reason = String(it.cancelReason || '').trim()
    if (reason) out.push(reason)
  }
  return out
}

function isStockoutReason(rawReason: string): boolean {
  const reason = String(rawReason || '').trim().toLowerCase()
  if (!reason) return false
  return STOCKOUT_KEYWORDS.some((keyword) => reason.includes(keyword))
}

function emptyAccumulator(storeCode: string): StoreAccumulator {
  return {
    storeCode,
    grossAmount: 0,
    orderCount: 0,
    completedRevenue: 0,
    completedCount: 0,
    waitingRevenue: 0,
    waitingOrders: 0,
    waitingElapsedSum: 0,
    waitingElapsedWeightedSum: 0,
    waitingWeightBase: 0,
    delayedRevenue: 0,
    delayedOrders: 0,
    cancelAmount: 0,
    cancelCount: 0,
    stockoutCancelAmount: 0,
    stockoutCancelCount: 0,
    hourlyRevenue: Array.from({ length: 24 }, () => 0),
    delayedTopOrders: [],
  }
}

function finalizeStoreRow(acc: StoreAccumulator) {
  const avgCookingMinutes =
    acc.waitingOrders > 0 ? Math.round((acc.waitingElapsedSum / acc.waitingOrders) * 10) / 10 : 0
  const revenueWeightedCookingMinutes =
    acc.waitingWeightBase > 0
      ? Math.round((acc.waitingElapsedWeightedSum / acc.waitingWeightBase) * 10) / 10
      : avgCookingMinutes
  const peakHour = acc.hourlyRevenue.reduce(
    (best, value, hour) => {
      if (value > best.revenue) return { hour, revenue: value }
      return best
    },
    { hour: -1, revenue: 0 }
  )
  return {
    storeCode: acc.storeCode,
    grossAmount: acc.grossAmount,
    orderCount: acc.orderCount,
    completedRevenue: acc.completedRevenue,
    completedCount: acc.completedCount,
    waitingRevenue: acc.waitingRevenue,
    waitingOrders: acc.waitingOrders,
    avgCookingMinutes,
    revenueWeightedCookingMinutes,
    delayedRevenue: acc.delayedRevenue,
    delayedOrders: acc.delayedOrders,
    cancelAmount: acc.cancelAmount,
    cancelCount: acc.cancelCount,
    cancelRate: acc.grossAmount > 0 ? acc.cancelAmount / acc.grossAmount : 0,
    stockoutCancelAmount: acc.stockoutCancelAmount,
    stockoutCancelCount: acc.stockoutCancelCount,
    stockoutRate: acc.grossAmount > 0 ? acc.stockoutCancelAmount / acc.grossAmount : 0,
    peakHour: peakHour.hour,
    peakHourRevenue: peakHour.revenue,
    delayedTopOrders: acc.delayedTopOrders.sort((a, b) => b.elapsedMin - a.elapsedMin).slice(0, 5),
  }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', request.headers.get('origin') || '*')
  headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120')
  const startedAt = Date.now()
  try {
    const auth = await getVerifiedAuth(request)
    const { searchParams } = new URL(request.url)
    const todayYmd = toBangkokYmd(new Date())
    const startStr = searchParams.get('startStr')?.trim() || todayYmd
    const endStr = searchParams.get('endStr')?.trim() || startStr
    const pos = searchParams.get('pos')?.trim()
    const requestedStores = resolveStoresFromParams(pos, searchParams.get('stores'))
    const isOffice = isOfficeRole(auth?.role || '')
    const stores = isOffice
      ? requestedStores
      : String(auth?.store || '').trim()
        ? [String(auth?.store || '').trim()]
        : requestedStores
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))
    const delayThresholdMin = Math.max(
      1,
      Math.min(180, Math.trunc(Number(searchParams.get('delayThresholdMin') || 15) || 15))
    )
    const nowMs = Date.now()

    const bizCtx = await loadPosBusinessDaySettingsContext()
    const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(bizCtx, startStr, endStr)
    let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    filter = await appendStoreCodeFilterAsync(filter, stores)
    const rowsRaw = (await supabaseSelectFilterStrippingUnknownColumns(
      'pos_orders',
      filter,
      {
        limit: FETCH_LIMIT,
        select: 'id,order_no,created_at,store_code,order_type,status,total,memo,items_json',
      },
      'posRealtimeRevenueDashboard'
    )) as DashboardOrderRow[]
    let rows = filterRowsByPosSalesBusinessDateRange(rowsRaw, bizCtx, startStr, endStr)
    rows = excludePosSalesTestOfficeRows(rows)
    rows = await applyPosSalesStoreSelectionFilterAsync(rows, stores.length > 0 ? stores : undefined)
    if (rowsRaw.length >= FETCH_LIMIT) headers.set('X-Sales-Truncated', '1')

    const byStore = new Map<string, StoreAccumulator>()
    const ensureStore = (storeCode: string) => {
      if (!byStore.has(storeCode)) byStore.set(storeCode, emptyAccumulator(storeCode))
      return byStore.get(storeCode)!
    }

    for (const row of rows) {
      if (!rowMatchesOrderFilter(row.order_type, orderTypesAllowed)) continue
      const createdAt = String(row.created_at || '').trim()
      const status = String(row.status || '').trim().toLowerCase()
      const rawStore = String(row.store_code || '').trim() || '(미지정)'
      const storeCode = canonicalSalesStoreRowKey(rawStore)
      const total = Math.max(0, Number(row.total) || 0)
      const acc = ensureStore(storeCode)
      acc.orderCount += 1
      acc.grossAmount += total

      if (COMPLETED_STATUSES.has(status)) {
        acc.completedCount += 1
        acc.completedRevenue += total
        const hour = toBangkokHour(createdAt)
        if (hour != null) acc.hourlyRevenue[hour] += total
      }

      if (WAITING_STATUSES.has(status)) {
        acc.waitingOrders += 1
        acc.waitingRevenue += total
        const createdMs = new Date(createdAt).getTime()
        if (Number.isFinite(createdMs) && createdMs > 0) {
          const elapsedMin = Math.max(0, (nowMs - createdMs) / 60000)
          acc.waitingElapsedSum += elapsedMin
          const weight = Math.max(1, total)
          acc.waitingElapsedWeightedSum += elapsedMin * weight
          acc.waitingWeightBase += weight
          if (elapsedMin >= delayThresholdMin) {
            acc.delayedOrders += 1
            acc.delayedRevenue += total
            acc.delayedTopOrders.push({
              id: Number(row.id || 0),
              orderNo: String(row.order_no || ''),
              createdAt,
              elapsedMin: Math.round(elapsedMin * 10) / 10,
              total,
            })
          }
        }
      }

      if (CANCELLED_STATUSES.has(status)) {
        acc.cancelCount += 1
        acc.cancelAmount += total
        const orderReason = parseOrderCancelReason(String(row.memo || ''))
        const lineReasons = parseLineCancelReasons(String(row.items_json || ''))
        const isStockout = [orderReason, ...lineReasons].some(isStockoutReason)
        if (isStockout) {
          acc.stockoutCancelCount += 1
          acc.stockoutCancelAmount += total
        }
      }
    }

    const storeRows = Array.from(byStore.values())
      .map((acc) => finalizeStoreRow(acc))
      .sort((a, b) => b.completedRevenue - a.completedRevenue)
    const totalAcc = emptyAccumulator('ALL')
    for (const s of byStore.values()) {
      totalAcc.grossAmount += s.grossAmount
      totalAcc.orderCount += s.orderCount
      totalAcc.completedRevenue += s.completedRevenue
      totalAcc.completedCount += s.completedCount
      totalAcc.waitingRevenue += s.waitingRevenue
      totalAcc.waitingOrders += s.waitingOrders
      totalAcc.waitingElapsedSum += s.waitingElapsedSum
      totalAcc.waitingElapsedWeightedSum += s.waitingElapsedWeightedSum
      totalAcc.waitingWeightBase += s.waitingWeightBase
      totalAcc.delayedRevenue += s.delayedRevenue
      totalAcc.delayedOrders += s.delayedOrders
      totalAcc.cancelAmount += s.cancelAmount
      totalAcc.cancelCount += s.cancelCount
      totalAcc.stockoutCancelAmount += s.stockoutCancelAmount
      totalAcc.stockoutCancelCount += s.stockoutCancelCount
      for (let h = 0; h < 24; h += 1) totalAcc.hourlyRevenue[h] += s.hourlyRevenue[h]
    }

    const selectedStore =
      stores.length === 1
        ? storeRows.find((r) => rowMatchesSalesStoreSelection(r.storeCode, stores[0]!)) ?? null
        : null
    const summaryStore = selectedStore || finalizeStoreRow(totalAcc)

    return NextResponse.json(
      {
        success: true,
        startStr,
        endStr,
        delayThresholdMin,
        store: summaryStore,
        office: {
          stores: storeRows,
          totals: finalizeStoreRow(totalAcc),
        },
        generatedAt: new Date().toISOString(),
        truncated: rowsRaw.length >= FETCH_LIMIT,
        elapsedMs: Date.now() - startedAt,
      },
      { headers }
    )
  } catch (e) {
    console.error('posRealtimeRevenueDashboard:', e)
    console.error('posRealtimeRevenueDashboard_metrics', {
      elapsedMs: Date.now() - startedAt,
      error: e instanceof Error ? e.message : String(e),
    })
    return NextResponse.json(
      {
        success: false,
        message: 'failed to load dashboard',
      },
      { headers }
    )
  }
}
