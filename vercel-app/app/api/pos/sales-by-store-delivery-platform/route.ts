/**
 * 매장×배달앱 매출. pos_orders 기반.
 * 우선 RPC get_pos_sales_analytics_agg (store_delivery_platform) → 미배포 시 fetch 폴백.
 */
import { NextRequest, NextResponse } from 'next/server'
import { normalizePosOrderTypeKey, parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import { resolvePosSalesStoresFromRequest } from '@/lib/pos-sales-request-scope'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_DELIVERY_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { groupPosSalesRowsByCanonicalStore } from '@/lib/pos-sales-period-aggregate'
import { resolveOrderDeliveryAppCode } from '@/lib/pos-delivery-order-meta'
import {
  isPosSalesAnalyticsRpcTimeoutError,
  respondPosSalesAnalyticsTimeout,
  tryFetchPosSalesAnalyticsAgg,
} from '@/lib/pos-sales-analytics-rpc-server'
import { mapAnalyticsAggToStoreDeliveryPlatformResults } from '@/lib/pos-sales-analytics-rpc-map'
import { applyPosSalesCacheControl } from '@/lib/pos-sales-response-cache'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  applyPosSalesCacheControl(headers, searchParams)

  try {
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
      request,
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      orderTypes: orderTypesAllowed,
      aggMode: 'store_delivery_platform',
    })

    // 구버전 RPC는 미지원 모드를 빈 배열로 돌려줌 → 빈 결과면 fetch 폴백(SQL 적용 후 배달 0건이면 fetch도 빈 값).
    if (rpcRows && rpcRows.length > 0) {
      headers.set('X-Pos-Sales-Source', 'rpc')
      return NextResponse.json(mapAnalyticsAggToStoreDeliveryPlatformResults(rpcRows), { headers })
    }

    const { rows, truncated } = await fetchPosSalesOrdersForBusinessRange({
      request,
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      select: POS_SALES_DELIVERY_ROW_SELECT,
      queryLabel: 'posSalesByStoreDeliveryPlatform',
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'fetch')

    const grouped = groupPosSalesRowsByCanonicalStore(rows, orderTypesAllowed)
    const result = Array.from(grouped.entries())
      .map(([storeName, subset]) => {
        const byPlatform = new Map<string, number>()
        for (const r of subset) {
          const t = normalizePosOrderTypeKey(String(r.order_type ?? ''))
          if (t !== 'delivery') continue
          const amt = Number(r.total) || 0
          const plat =
            resolveOrderDeliveryAppCode(r as { delivery_app_code?: string | null; items_json?: string | null }) ||
            '_unspecified'
          byPlatform.set(plat, (byPlatform.get(plat) || 0) + amt)
        }
        const platforms = Array.from(byPlatform.entries())
          .map(([code, sales]) => ({ code, sales }))
          .sort((a, b) => b.sales - a.sales)
        const deliveryTotal = platforms.reduce((s, p) => s + p.sales, 0)
        return { storeName, platforms, deliveryTotal }
      })
      .filter((r) => r.deliveryTotal > 0)
      .sort((a, b) => b.deliveryTotal - a.deliveryTotal)

    return NextResponse.json(result, { headers })
  } catch (e) {
    if (isPosSalesAnalyticsRpcTimeoutError(e)) return respondPosSalesAnalyticsTimeout(headers)
    console.error('pos/sales-by-store-delivery-platform:', e)
    return NextResponse.json([], { headers })
  }
}
