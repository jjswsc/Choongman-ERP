/**
 * 채널별 매출 (매장/포장/배달) + 배달 세부 플랫폼(Grab 등).
 * pos_orders: order_type, delivery_app_code, items_json(레거시 보조).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { filterRowsByPosSalesBusinessDateRange, posSalesBusinessDateRangeUtcEnvelope } from '@/lib/pos-sales-business-day-range'
import { parseOrderTypesParam, rowMatchesOrderFilter } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams, appendStoreCodeFilter } from '@/lib/pos-sales-store-filter'
import { loadPosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'
import { resolveOrderDeliveryAppCode } from '@/lib/pos-delivery-order-meta'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']

const ORDER_KEYS = ['dine_in', 'takeout', 'delivery'] as const
const FETCH_LIMIT = 50000

type OrderRow = {
  created_at?: string
  order_type?: string
  total?: number
  status?: string
  store_code?: string
  delivery_app_code?: string | null
  items_json?: string | null
}

function bucketOrderType(raw: string): (typeof ORDER_KEYS)[number] | 'unknown' {
  const t = String(raw ?? '').trim()
  if (t === 'dine_in' || t === 'takeout' || t === 'delivery') return t
  return 'unknown'
}

export type PosSalesDeliveryChannelItem = {
  channelKey: string
  sales: number
  pct: number
  /** order_type === delivery 행에만: 플랫폼별 (매출은 배달 합계 대비 %) */
  platforms?: { code: string; sales: number; pct: number }[]
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
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const bizCtx = await loadPosBusinessDaySettingsContext()
    const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(bizCtx, startStr, endStr)
    let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    filter = appendStoreCodeFilter(filter, stores)

    const rowsRaw = (await supabaseSelectFilter('pos_orders', filter, {
      limit: FETCH_LIMIT,
      select: 'created_at,order_type,total,status,store_code,delivery_app_code,items_json',
    })) as OrderRow[]

    const rows = filterRowsByPosSalesBusinessDateRange(rowsRaw, bizCtx, startStr, endStr)

    if (rowsRaw.length >= FETCH_LIMIT) headers.set('X-Sales-Truncated', '1')

    const byApp: Record<string, number> = {}
    const deliveryByPlatform: Record<string, number> = {}

    for (const r of rows) {
      if (!rowMatchesOrderFilter(r.order_type, orderTypesAllowed)) continue
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
      const k = bucketOrderType(String(r.order_type ?? ''))
      const amt = Number(r.total) || 0
      byApp[k] = (byApp[k] || 0) + amt
      if (k === 'delivery') {
        const plat = resolveOrderDeliveryAppCode(r)
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
          const platforms = Object.entries(deliveryByPlatform)
            .map(([code, sales]) => ({
              code,
              sales,
              pct: deliveryTotal > 0 ? (sales / deliveryTotal) * 100 : 0,
            }))
            .sort((a, b) => b.sales - a.sales)
          item.platforms = platforms
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
