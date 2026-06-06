/**
 * 매장별 채널(홀·포장·배달) 매출. pos_orders 기반.
 * 우선 RPC get_pos_sales_analytics_agg (store_channel) → 미배포 시 fetch 폴백.
 */
import { NextRequest, NextResponse } from 'next/server'
import { normalizePosOrderTypeKey, parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import { resolvePosSalesStoresFromRequest } from '@/lib/pos-sales-request-scope'
import { fetchPosSalesOrdersForBusinessRange } from '@/lib/pos-sales-fetch-rows'
import { groupPosSalesRowsByCanonicalStore } from '@/lib/pos-sales-period-aggregate'
import { tryFetchPosSalesAnalyticsAgg } from '@/lib/pos-sales-analytics-rpc-server'
import { mapAnalyticsAggToStoreChannelResults } from '@/lib/pos-sales-analytics-rpc-map'

function bucketChannel(raw: string): 'dineIn' | 'takeout' | 'delivery' | null {
  const t = normalizePosOrderTypeKey(raw)
  if (t === 'dine_in' || t === '') return 'dineIn'
  if (t === 'takeout') return 'takeout'
  if (t === 'delivery') return 'delivery'
  return null
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
      aggMode: 'store_channel',
    })

    if (rpcRows) {
      headers.set('X-Pos-Sales-Source', 'rpc')
      return NextResponse.json(mapAnalyticsAggToStoreChannelResults(rpcRows), { headers })
    }

    const { rows, truncated } = await fetchPosSalesOrdersForBusinessRange({
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      queryLabel: 'posSalesByStoreChannel',
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'fetch')

    const grouped = groupPosSalesRowsByCanonicalStore(rows, orderTypesAllowed)
    const result = Array.from(grouped.entries())
      .map(([storeName, subset]) => {
        const buckets = { dineIn: 0, takeout: 0, delivery: 0 }
        for (const r of subset) {
          const ch = bucketChannel(String(r.order_type ?? ''))
          const amt = Number(r.total) || 0
          if (ch) buckets[ch] += amt
        }
        return { storeName, ...buckets }
      })
      .sort((a, b) => b.dineIn + b.takeout + b.delivery - (a.dineIn + a.takeout + a.delivery))

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByStoreChannel:', e)
    return NextResponse.json([], { headers })
  }
}
