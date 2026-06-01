import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilterStrippingUnknownColumns } from '@/lib/supabase-pgrst204-retry'
import { filterRowsByPosSalesBusinessDateRange, posSalesBusinessDateRangeUtcEnvelope } from '@/lib/pos-sales-business-day-range'
import { parseOrderTypesParam, rowMatchesOrderFilter } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams, appendStoreCodeFilterAsync } from '@/lib/pos-sales-store-filter'
import { applyPosSalesStoreSelectionFilterAsync } from '@/lib/pos-sales-fetch-rows'
import { excludePosSalesTestOfficeRows } from '@/lib/pos-sales-test-office'
import { normalizePosCancelReasonKey } from '@/lib/pos-cancel-reason-key'
import { loadPosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'

const FETCH_LIMIT = 50000

type CancelReasonRow = {
  reason: string
  count: number
  amount: number
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const stores = resolveStoresFromParams(pos, searchParams.get('stores'))
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    if (!startStr || !endStr) {
      return NextResponse.json(
        {
          lineRows: [],
          orderRows: [],
          lineTotalCount: 0,
          lineTotalAmount: 0,
          orderTotalCount: 0,
          orderTotalAmount: 0,
          truncated: false,
        },
        { headers }
      )
    }

    const bizCtx = await loadPosBusinessDaySettingsContext()
    const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(bizCtx, startStr, endStr)
    let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    filter = await appendStoreCodeFilterAsync(filter, stores)

    const ordersRaw = (await supabaseSelectFilterStrippingUnknownColumns(
      'pos_orders',
      filter,
      {
        limit: FETCH_LIMIT,
        select: 'created_at,store_code,order_type,status,total,memo,items_json',
      },
      'posCancelReasonSummary'
    )) as {
      created_at?: string
      store_code?: string
      order_type?: string
      status?: string
      total?: number
      memo?: string
      items_json?: string
    }[]

    let orders = filterRowsByPosSalesBusinessDateRange(ordersRaw, bizCtx, startStr, endStr)
    orders = excludePosSalesTestOfficeRows(orders)
    orders = await applyPosSalesStoreSelectionFilterAsync(orders, stores.length > 0 ? stores : undefined)

    const lineBucket = new Map<string, { count: number; amount: number }>()
    const orderBucket = new Map<string, { count: number; amount: number }>()
    let lineTotalCount = 0
    let lineTotalAmount = 0
    let orderTotalCount = 0
    let orderTotalAmount = 0

    for (const row of orders) {
      if (!rowMatchesOrderFilter(row.order_type, orderTypesAllowed)) continue
      let items: unknown[] = []
      try {
        const parsed = JSON.parse(String(row.items_json || '[]'))
        items = Array.isArray(parsed) ? parsed : []
      } catch {
        items = []
      }
      for (const raw of items) {
        const it = raw as {
          cancelledAt?: string | null
          cancelReason?: string | null
          price?: number
          qty?: number
          quantity?: number
        }
        if (!String(it.cancelledAt || '').trim()) continue
        const reason = normalizePosCancelReasonKey(String(it.cancelReason || ''))
        const qty = Math.max(1, Number(it.qty ?? it.quantity ?? 1) || 1)
        const amount = Math.max(0, Number(it.price ?? 0) || 0) * qty
        const prev = lineBucket.get(reason) || { count: 0, amount: 0 }
        prev.count += 1
        prev.amount += amount
        lineBucket.set(reason, prev)
        lineTotalCount += 1
        lineTotalAmount += amount
      }
      if (row.status === 'cancelled' || row.status === 'refunded') {
        const memoLines = String(row.memo || '').split(/\r?\n/)
        let reason = ''
        for (let i = memoLines.length - 1; i >= 0; i -= 1) {
          const line = memoLines[i].trim()
          const m = /^\[ORDER_(?:CANCELLED|REFUNDED)\s+[^\]]+\]\s*(.+)$/.exec(line)
          if (m?.[1]) {
            reason = m[1].trim()
            break
          }
        }
        const resolvedReason = normalizePosCancelReasonKey(reason)
        const amount = Math.max(0, Number(row.total ?? 0) || 0)
        const prev = orderBucket.get(resolvedReason) || { count: 0, amount: 0 }
        prev.count += 1
        prev.amount += amount
        orderBucket.set(resolvedReason, prev)
        orderTotalCount += 1
        orderTotalAmount += amount
      }
    }

    const toRows = (m: Map<string, { count: number; amount: number }>): CancelReasonRow[] =>
      Array.from(m.entries())
        .map(([reason, v]) => ({ reason, count: v.count, amount: v.amount }))
        .sort((a, b) => b.count - a.count || b.amount - a.amount)

    const lineRows = toRows(lineBucket)
    const orderRows = toRows(orderBucket)

    const truncated = ordersRaw.length >= FETCH_LIMIT
    if (truncated) headers.set('X-Sales-Truncated', '1')

    return NextResponse.json(
      {
        lineRows,
        orderRows,
        lineTotalCount,
        lineTotalAmount,
        orderTotalCount,
        orderTotalAmount,
        truncated,
      },
      { headers }
    )
  } catch (e) {
    console.error('posCancelReasonSummary:', e)
    return NextResponse.json(
      {
        lineRows: [],
        orderRows: [],
        lineTotalCount: 0,
        lineTotalAmount: 0,
        orderTotalCount: 0,
        orderTotalAmount: 0,
        truncated: false,
      },
      { headers }
    )
  }
}

