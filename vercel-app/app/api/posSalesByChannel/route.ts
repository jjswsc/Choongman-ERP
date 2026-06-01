/**
 * 채널별 매출 (매장/포장/배달). pos_orders 기반.
 * 우선 RPC get_pos_sales_analytics_agg → 미배포 시 fetch 폴백.
 */
import { NextRequest, NextResponse } from 'next/server'
import { normalizePosOrderTypeKey, parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import { resolvePosSalesStoresFromRequest } from '@/lib/pos-sales-request-scope'
import { fetchPosSalesOrdersForBusinessRange } from '@/lib/pos-sales-fetch-rows'
import { filterCompletedPosSalesRows } from '@/lib/pos-sales-period-aggregate'
import { tryFetchPosSalesAnalyticsAgg } from '@/lib/pos-sales-analytics-rpc-server'

function bucketOrderType(raw: string): 'dine_in' | 'takeout' | 'delivery' | 'unknown' {
  const t = normalizePosOrderTypeKey(raw)
  if (t === 'dine_in' || t === '') return 'dine_in'
  if (t === 'takeout' || t === 'delivery') return t
  return 'unknown'
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const stores = await resolvePosSalesStoresFromRequest(
      request,
      resolveStoresFromParams(pos, searchParams.get('stores'))
    )
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const rpcRows = await tryFetchPosSalesAnalyticsAgg({
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      orderTypes: orderTypesAllowed,
      aggMode: 'channel',
    })

    if (rpcRows) {
      headers.set('X-Pos-Sales-Source', 'rpc')
      const result = rpcRows
        .map((r) => ({
          channelKey: String(r.bucket_key ?? '').trim(),
          sales: Number(r.total ?? 0) || 0,
        }))
        .filter((r) => r.channelKey && r.sales > 0)
        .sort((a, b) => b.sales - a.sales)
      return NextResponse.json(result, { headers })
    }

    const { rows, truncated } = await fetchPosSalesOrdersForBusinessRange({
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      queryLabel: 'posSalesByChannel',
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'fetch')

    const byChannel: Record<string, number> = {}
    for (const r of filterCompletedPosSalesRows(rows, orderTypesAllowed)) {
      const ch = bucketOrderType(String(r.order_type ?? ''))
      const amt = Number(r.total) || 0
      byChannel[ch] = (byChannel[ch] || 0) + amt
    }

    const result = Object.entries(byChannel)
      .map(([channelKey, sales]) => ({ channelKey, sales }))
      .sort((a, b) => b.sales - a.sales)

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByChannel:', e)
    return NextResponse.json([], { headers })
  }
}
