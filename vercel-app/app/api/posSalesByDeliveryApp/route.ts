/**
 * 채널별 매출 (매장/포장/배달) + 배달 세부 플랫폼(Grab 등).
 * 우선 RPC get_pos_sales_analytics_agg(delivery_app) 1회 →
 * 구버전 RPC면 channel+delivery_platform 2회 → 미배포 시 fetch 폴백.
 */
import { NextRequest, NextResponse } from 'next/server'
import { normalizePosOrderTypeKey, parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import { resolvePosSalesStoresFromRequest } from '@/lib/pos-sales-request-scope'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_DELIVERY_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { filterCompletedPosSalesRows } from '@/lib/pos-sales-period-aggregate'
import { resolveOrderDeliveryAppCode } from '@/lib/pos-delivery-order-meta'
import {
  tryFetchPosSalesAnalyticsAgg,
  type PosSalesAnalyticsAggRow,
} from '@/lib/pos-sales-analytics-rpc-server'
import { applyPosSalesCacheControl } from '@/lib/pos-sales-response-cache'

const ORDER_KEYS = ['dine_in', 'takeout', 'delivery'] as const

export type PosSalesDeliveryChannelItem = {
  channelKey: string
  sales: number
  pct: number
  platforms?: { code: string; sales: number; pct: number }[]
}

function bucketOrderType(raw: string): (typeof ORDER_KEYS)[number] | 'unknown' {
  const t = normalizePosOrderTypeKey(raw)
  if (t === 'dine_in' || t === '') return 'dine_in'
  if (t === 'takeout' || t === 'delivery') return t
  return 'unknown'
}

function buildDeliveryItemsFromChannelAndPlatform(
  channelRows: PosSalesAnalyticsAggRow[],
  platformRows: PosSalesAnalyticsAggRow[]
): { items: PosSalesDeliveryChannelItem[]; total: number } {
  const byApp: Record<string, number> = {}
  for (const r of channelRows) {
    const k = String(r.bucket_key ?? '').trim()
    if (!k) continue
    byApp[k] = Number(r.total ?? 0) || 0
  }

  const total = Object.values(byApp).reduce((a, b) => a + b, 0)
  const deliveryTotal = byApp.delivery || 0
  const deliveryByPlatform: Record<string, number> = {}
  for (const r of platformRows) {
    const pk = String(r.bucket_key ?? '').trim() || '_unspecified'
    deliveryByPlatform[pk] = Number(r.total ?? 0) || 0
  }

  const result: PosSalesDeliveryChannelItem[] = []
  for (const channelKey of ORDER_KEYS) {
    const s = byApp[channelKey] || 0
    if (s > 0) {
      const item: PosSalesDeliveryChannelItem = {
        channelKey,
        sales: s,
        pct: total > 0 ? (s / total) * 100 : 0,
      }
      if (channelKey === 'delivery' && deliveryTotal > 0) {
        item.platforms = Object.entries(deliveryByPlatform)
          .map(([code, sales]) => ({
            code,
            sales,
            pct: deliveryTotal > 0 ? (sales / deliveryTotal) * 100 : 0,
          }))
          .sort((a, b) => b.sales - a.sales)
      }
      result.push(item)
    }
  }
  const u = byApp.unknown || 0
  if (u > 0) {
    result.push({
      channelKey: 'unknown',
      sales: u,
      pct: total > 0 ? (u / total) * 100 : 0,
    })
  }
  return { items: result, total }
}

/** delivery_app 모드 응답인지 (구버전 RPC는 빈 배열 → 이중 호출로 폴백) */
function splitDeliveryAppBundleRows(rows: PosSalesAnalyticsAggRow[]): {
  channel: PosSalesAnalyticsAggRow[]
  platform: PosSalesAnalyticsAggRow[]
} | null {
  const channel: PosSalesAnalyticsAggRow[] = []
  const platform: PosSalesAnalyticsAggRow[] = []
  let sawBundleKey = false
  for (const r of rows) {
    const k2 = String(r.bucket_key2 ?? '').trim().toLowerCase()
    if (k2 === 'channel') {
      sawBundleKey = true
      channel.push(r)
    } else if (k2 === 'platform') {
      sawBundleKey = true
      platform.push(r)
    }
  }
  if (!sawBundleKey) return null
  return { channel, platform }
}

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

    const rpcBase = {
      request,
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      orderTypes: orderTypesAllowed,
    }

    const bundleRows = await tryFetchPosSalesAnalyticsAgg({
      ...rpcBase,
      aggMode: 'delivery_app',
    })
    const bundle = bundleRows ? splitDeliveryAppBundleRows(bundleRows) : null

    if (bundle) {
      headers.set('X-Pos-Sales-Source', 'rpc')
      const { items, total } = buildDeliveryItemsFromChannelAndPlatform(bundle.channel, bundle.platform)
      return NextResponse.json({ items, total }, { headers })
    }

    const [channelRpc, platformRpc] = await Promise.all([
      tryFetchPosSalesAnalyticsAgg({
        ...rpcBase,
        aggMode: 'channel',
      }),
      tryFetchPosSalesAnalyticsAgg({
        ...rpcBase,
        aggMode: 'delivery_platform',
      }),
    ])

    if (channelRpc) {
      headers.set('X-Pos-Sales-Source', 'rpc')
      const { items, total } = buildDeliveryItemsFromChannelAndPlatform(channelRpc, platformRpc || [])
      return NextResponse.json({ items, total }, { headers })
    }

    const { rows, truncated } = await fetchPosSalesOrdersForBusinessRange({
      request,
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      select: POS_SALES_DELIVERY_ROW_SELECT,
      queryLabel: 'posSalesByDeliveryApp',
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'fetch')

    const byApp: Record<string, number> = {}
    const deliveryByPlatform: Record<string, number> = {}

    for (const r of filterCompletedPosSalesRows(rows, orderTypesAllowed)) {
      const k = bucketOrderType(String(r.order_type ?? ''))
      const amt = Number(r.total) || 0
      byApp[k] = (byApp[k] || 0) + amt
      if (k === 'delivery') {
        const plat = resolveOrderDeliveryAppCode(r as { delivery_app_code?: string | null; items_json?: string | null })
        const pk = plat || '_unspecified'
        deliveryByPlatform[pk] = (deliveryByPlatform[pk] || 0) + amt
      }
    }

    const total = Object.values(byApp).reduce((a, b) => a + b, 0)
    const deliveryTotal = byApp.delivery || 0

    const result: PosSalesDeliveryChannelItem[] = []
    for (const channelKey of ORDER_KEYS) {
      const s = byApp[channelKey] || 0
      if (s > 0) {
        const item: PosSalesDeliveryChannelItem = {
          channelKey,
          sales: s,
          pct: total > 0 ? (s / total) * 100 : 0,
        }
        if (channelKey === 'delivery' && deliveryTotal > 0) {
          item.platforms = Object.entries(deliveryByPlatform)
            .map(([code, sales]) => ({
              code,
              sales,
              pct: deliveryTotal > 0 ? (sales / deliveryTotal) * 100 : 0,
            }))
            .sort((a, b) => b.sales - a.sales)
        }
        result.push(item)
      }
    }
    const u = byApp.unknown || 0
    if (u > 0) {
      result.push({
        channelKey: 'unknown',
        sales: u,
        pct: total > 0 ? (u / total) * 100 : 0,
      })
    }

    return NextResponse.json({ items: result, total }, { headers })
  } catch (e) {
    console.error('posSalesByDeliveryApp:', e)
    return NextResponse.json({ items: [], total: 0 }, { headers })
  }
}
