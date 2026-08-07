/**
 * 협업 할인 사용 현황 — 기간·매장·캠페인별 주문건수·할인액
 * groupBy: campaign(기본) | store | day
 */
import { NextRequest, NextResponse } from 'next/server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import {
  aggregateCollabDiscountUsageByStoreFromOrders,
  aggregateCollabDiscountUsageDailyFromOrders,
  aggregateCollabDiscountUsageFromOrders,
  type CollabDiscountUsageAggRow,
  type CollabDiscountUsageByStoreAggRow,
  type CollabDiscountUsageDailyAggRow,
  type CollabDiscountUsageOrderRow,
} from '@/lib/collab-discount-usage'
import { parseMarketingCampaignIdForOrderSave } from '@/lib/pos-order-collab-discount-fields'
import {
  supabaseRpc,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
} from '@/lib/supabase-server'

const FALLBACK_MAX_ROWS = 100_000

type GroupBy = 'campaign' | 'store' | 'day'

type RpcCampaignRow = {
  campaign_id?: number | string
  order_count?: number | string
  discount_amount?: number | string
  store_count?: number | string
}

type RpcStoreRow = {
  store_code?: string | null
  order_count?: number | string
  discount_amount?: number | string
  campaign_count?: number | string
}

type RpcDailyRow = {
  usage_ymd?: string | null
  order_count?: number | string
  discount_amount?: number | string
}

type CampaignMeta = {
  id?: number | string
  campaign_no?: string | null
  topic?: string | null
}

function corsHeaders() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  return headers
}

function isRpcMissingError(e: unknown): boolean {
  const s = String(e)
  return (
    s.includes('42883') ||
    s.includes('PGRST202') ||
    /Could not find the function/i.test(s) ||
    /function .* does not exist/i.test(s)
  )
}

function isColumnSchemaError(e: unknown): boolean {
  const s = String(e)
  return (
    s.includes('42703') ||
    s.includes('PGRST204') ||
    s.includes('schema cache') ||
    /Could not find the .* column/i.test(s) ||
    /column .* does not exist/i.test(s)
  )
}

function parseGroupBy(raw: string): GroupBy {
  const v = raw.trim().toLowerCase()
  if (v === 'store' || v === 'by_store' || v === 'stores') return 'store'
  if (v === 'day' || v === 'daily' || v === 'date') return 'day'
  return 'campaign'
}

async function loadCampaignMeta(ids: string[]): Promise<Map<string, { campaignNo: string; topic: string }>> {
  const map = new Map<string, { campaignNo: string; topic: string }>()
  if (ids.length === 0) return map
  const unique = [...new Set(ids)].filter(Boolean)
  const chunkSize = 80
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const filter = `id=in.(${chunk.map((id) => encodeURIComponent(id)).join(',')})`
    try {
      const rows = (await supabaseSelectFilter('marketing_campaigns', filter, {
        limit: chunk.length,
        select: 'id,campaign_no,topic',
      })) as CampaignMeta[]
      for (const r of rows || []) {
        const id = String(r.id ?? '').trim()
        if (!id) continue
        map.set(id, {
          campaignNo: String(r.campaign_no ?? '').trim(),
          topic: String(r.topic ?? '').trim(),
        })
      }
    } catch {
      /* ignore meta load errors — still return counts */
    }
  }
  return map
}

function attachMeta(
  rows: CollabDiscountUsageAggRow[],
  meta: Map<string, { campaignNo: string; topic: string }>
) {
  return rows.map((r) => {
    const m = meta.get(r.campaignId)
    return {
      campaignId: r.campaignId,
      campaignNo: m?.campaignNo ?? '',
      topic: m?.topic ?? '',
      orderCount: r.orderCount,
      discountAmount: r.discountAmount,
      storeCount: r.storeCount,
    }
  })
}

async function loadOrdersFallback(params: {
  startStr: string
  endStr: string
  store: string
  campaignId: number | null
  includeCreatedAt: boolean
}): Promise<CollabDiscountUsageOrderRow[]> {
  const { startISO, endISOExclusive } = bangkokDateRangeToUtc(params.startStr, params.endStr)
  const parts = [
    `created_at=gte.${encodeURIComponent(startISO)}`,
    `created_at=lt.${encodeURIComponent(endISOExclusive)}`,
    'status=in.(completed,paid,ready)',
    'marketing_campaign_id=not.is.null',
    'collab_discount_amt=gt.0',
  ]
  if (params.store) parts.push(`store_code=eq.${encodeURIComponent(params.store)}`)
  if (params.campaignId != null) {
    parts.push(`marketing_campaign_id=eq.${params.campaignId}`)
  }
  const select = params.includeCreatedAt
    ? 'marketing_campaign_id,collab_discount_amt,store_code,status,created_at'
    : 'marketing_campaign_id,collab_discount_amt,store_code,status'
  return (await supabaseSelectFilterAllPages('pos_orders', parts.join('&'), {
    pageSize: 5000,
    maxRows: FALLBACK_MAX_ROWS,
    select,
  })) as CollabDiscountUsageOrderRow[]
}

function unavailablePayload(
  startStr: string,
  endStr: string,
  store: string,
  campaignId: number | null,
  groupBy: GroupBy
) {
  return {
    success: true as const,
    startStr,
    endStr,
    store: store || null,
    campaignId: campaignId != null ? String(campaignId) : null,
    groupBy,
    source: 'unavailable' as const,
    message:
      'pos_orders.collab_discount_amt / marketing_campaign_id 컬럼이 없습니다. sql/pos_orders_collab_discount_amt.sql 을 실행하세요.',
    rows: [],
    storeRows: [],
    dailyRows: [],
    totals: { orderCount: 0, discountAmount: 0, campaignCount: 0, storeCount: 0 },
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

export async function GET(request: NextRequest) {
  const headers = corsHeaders()
  try {
    const { searchParams } = new URL(request.url)
    const startStr = String(searchParams.get('startStr') ?? searchParams.get('start') ?? '').trim()
    const endStr = String(searchParams.get('endStr') ?? searchParams.get('end') ?? '').trim()
    const store = String(searchParams.get('store') ?? searchParams.get('pos') ?? '').trim()
    const campaignRaw = String(searchParams.get('campaignId') ?? '').trim()
    const campaignId = parseMarketingCampaignIdForOrderSave(campaignRaw)
    const groupBy = parseGroupBy(String(searchParams.get('groupBy') ?? 'campaign'))

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
      return NextResponse.json(
        { success: false, message: 'startStr/endStr (YYYY-MM-DD) 필요' },
        { status: 400, headers }
      )
    }
    if (startStr > endStr) {
      return NextResponse.json(
        { success: false, message: 'startStr must be <= endStr' },
        { status: 400, headers }
      )
    }

    const rpcParams = {
      p_start_ymd: startStr,
      p_end_ymd: endStr,
      p_store_code: store || null,
      p_campaign_id: campaignId,
    }

    if (groupBy === 'store') {
      let storeRows: CollabDiscountUsageByStoreAggRow[] = []
      let source: 'rpc' | 'fallback' = 'rpc'
      try {
        const rpcRows = (await supabaseRpc<RpcStoreRow[]>(
          'get_collab_discount_usage_by_store',
          rpcParams
        )) as RpcStoreRow[]
        storeRows = (rpcRows || [])
          .map((r) => ({
            storeCode: String(r.store_code ?? '').trim(),
            orderCount: Math.max(0, Math.trunc(Number(r.order_count) || 0)),
            discountAmount: Math.round((Number(r.discount_amount) || 0) * 100) / 100,
            campaignCount: Math.max(0, Math.trunc(Number(r.campaign_count) || 0)),
          }))
          .filter((r) => r.storeCode)
      } catch (e) {
        if (!isRpcMissingError(e) && !isColumnSchemaError(e)) throw e
        source = 'fallback'
        try {
          const orderRows = await loadOrdersFallback({
            startStr,
            endStr,
            store,
            campaignId,
            includeCreatedAt: false,
          })
          storeRows = aggregateCollabDiscountUsageByStoreFromOrders(orderRows || [])
        } catch (fallbackErr) {
          if (isColumnSchemaError(fallbackErr)) {
            return NextResponse.json(unavailablePayload(startStr, endStr, store, campaignId, groupBy), {
              headers,
            })
          }
          throw fallbackErr
        }
      }

      const totals = {
        orderCount: storeRows.reduce((s, r) => s + r.orderCount, 0),
        discountAmount: Math.round(storeRows.reduce((s, r) => s + r.discountAmount, 0) * 100) / 100,
        campaignCount: 0,
        storeCount: storeRows.length,
      }

      return NextResponse.json(
        {
          success: true,
          startStr,
          endStr,
          store: store || null,
          campaignId: campaignId != null ? String(campaignId) : null,
          groupBy,
          source,
          rows: [],
          storeRows,
          dailyRows: [],
          totals,
        },
        { headers }
      )
    }

    if (groupBy === 'day') {
      let dailyRows: CollabDiscountUsageDailyAggRow[] = []
      let source: 'rpc' | 'fallback' = 'rpc'
      try {
        const rpcRows = (await supabaseRpc<RpcDailyRow[]>(
          'get_collab_discount_usage_daily',
          rpcParams
        )) as RpcDailyRow[]
        dailyRows = (rpcRows || [])
          .map((r) => ({
            ymd: String(r.usage_ymd ?? '').trim(),
            orderCount: Math.max(0, Math.trunc(Number(r.order_count) || 0)),
            discountAmount: Math.round((Number(r.discount_amount) || 0) * 100) / 100,
          }))
          .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.ymd))
          .sort((a, b) => a.ymd.localeCompare(b.ymd))
      } catch (e) {
        if (!isRpcMissingError(e) && !isColumnSchemaError(e)) throw e
        source = 'fallback'
        try {
          const orderRows = await loadOrdersFallback({
            startStr,
            endStr,
            store,
            campaignId,
            includeCreatedAt: true,
          })
          dailyRows = aggregateCollabDiscountUsageDailyFromOrders(orderRows || [])
        } catch (fallbackErr) {
          if (isColumnSchemaError(fallbackErr)) {
            return NextResponse.json(unavailablePayload(startStr, endStr, store, campaignId, groupBy), {
              headers,
            })
          }
          throw fallbackErr
        }
      }

      const totals = {
        orderCount: dailyRows.reduce((s, r) => s + r.orderCount, 0),
        discountAmount: Math.round(dailyRows.reduce((s, r) => s + r.discountAmount, 0) * 100) / 100,
        campaignCount: 0,
        storeCount: 0,
      }

      return NextResponse.json(
        {
          success: true,
          startStr,
          endStr,
          store: store || null,
          campaignId: campaignId != null ? String(campaignId) : null,
          groupBy,
          source,
          rows: [],
          storeRows: [],
          dailyRows,
          totals,
        },
        { headers }
      )
    }

    let aggRows: CollabDiscountUsageAggRow[] = []
    let source: 'rpc' | 'fallback' = 'rpc'

    try {
      const rpcRows = (await supabaseRpc<RpcCampaignRow[]>('get_collab_discount_usage', rpcParams)) as RpcCampaignRow[]
      aggRows = (rpcRows || [])
        .map((r) => ({
          campaignId: String(r.campaign_id ?? '').trim(),
          orderCount: Math.max(0, Math.trunc(Number(r.order_count) || 0)),
          discountAmount: Math.round((Number(r.discount_amount) || 0) * 100) / 100,
          storeCount: Math.max(0, Math.trunc(Number(r.store_count) || 0)),
        }))
        .filter((r) => r.campaignId)
    } catch (e) {
      if (!isRpcMissingError(e) && !isColumnSchemaError(e)) throw e
      source = 'fallback'
      try {
        const orderRows = await loadOrdersFallback({
          startStr,
          endStr,
          store,
          campaignId,
          includeCreatedAt: false,
        })
        aggRows = aggregateCollabDiscountUsageFromOrders(orderRows || [])
      } catch (fallbackErr) {
        if (isColumnSchemaError(fallbackErr)) {
          return NextResponse.json(unavailablePayload(startStr, endStr, store, campaignId, groupBy), {
            headers,
          })
        }
        throw fallbackErr
      }
    }

    const meta = await loadCampaignMeta(aggRows.map((r) => r.campaignId))
    const rows = attachMeta(aggRows, meta)
    const totals = {
      orderCount: rows.reduce((s, r) => s + r.orderCount, 0),
      discountAmount: Math.round(rows.reduce((s, r) => s + r.discountAmount, 0) * 100) / 100,
      campaignCount: rows.length,
      storeCount: 0,
    }

    return NextResponse.json(
      {
        success: true,
        startStr,
        endStr,
        store: store || null,
        campaignId: campaignId != null ? String(campaignId) : null,
        groupBy,
        source,
        rows,
        storeRows: [],
        dailyRows: [],
        totals,
      },
      { headers }
    )
  } catch (e) {
    console.error('collabDiscountUsage:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '집계 실패' },
      { status: 500, headers }
    )
  }
}
