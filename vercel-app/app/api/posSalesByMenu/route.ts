/**
 * 메뉴별 매출 (수량·금액). pos_orders 기반. items_json에서 추출.
 * 우선 RPC get_pos_sales_analytics_agg → 미배포 시 fetch 폴백.
 */
import { NextRequest, NextResponse } from 'next/server'
import { parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import { resolvePosSalesStoresFromRequest } from '@/lib/pos-sales-request-scope'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_MENU_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { filterCompletedPosSalesRows } from '@/lib/pos-sales-period-aggregate'
import { tryFetchPosSalesAnalyticsAgg } from '@/lib/pos-sales-analytics-rpc-server'

type PosOrderItem = {
  id?: string
  name?: string
  price?: number
  qty?: number
  category?: string
  category_main?: string
}

function parseSearchTokens(raw: string | null): string[] {
  return String(raw ?? '')
    .split(/[,\n]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
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
    const searchTokens = parseSearchTokens(searchParams.get('search'))
    const searchMode = String(searchParams.get('searchMode') ?? 'or').toLowerCase()
    const searchAnd = searchMode === 'and' || searchMode === 'all'
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
      aggMode: 'menu',
      menuSearchTokens: searchTokens.length > 0 ? searchTokens : undefined,
      menuSearchAnd: searchAnd,
    })

    if (rpcRows) {
      headers.set('X-Pos-Sales-Source', 'rpc')
      const result = rpcRows
        .map((r) => ({
          name: String(r.bucket_key ?? '').trim() || '(없음)',
          qty: Math.max(0, Number(r.menu_qty ?? 0) || 0),
          sales: Math.round(Number(r.total ?? 0) || 0),
        }))
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 500)
      return NextResponse.json(result, { headers })
    }

    const { rows, truncated } = await fetchPosSalesOrdersForBusinessRange({
      request,
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      select: POS_SALES_MENU_ROW_SELECT,
      queryLabel: 'posSalesByMenu',
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'fetch')

    const byMenu: Record<string, { qty: number; sales: number }> = {}
    for (const r of filterCompletedPosSalesRows(rows, orderTypesAllowed) as Array<{ items_json?: string }>) {
      let items: PosOrderItem[] = []
      try {
        const parsed = JSON.parse(String(r.items_json || '[]'))
        items = Array.isArray(parsed) ? parsed : []
      } catch {
        // skip
      }
      for (const it of items) {
        const name = String(it.name ?? '').trim() || '(없음)'
        if (searchTokens.length > 0) {
          const haystack = [name, String(it.category_main ?? ''), String(it.category ?? '')]
            .join(' ')
            .toLowerCase()
          const matched = searchAnd
            ? searchTokens.every((token) => haystack.includes(token))
            : searchTokens.some((token) => haystack.includes(token))
          if (!matched) continue
        }
        const qty = Math.max(0, Number(it.qty) || 0)
        const price = Number(it.price) || 0
        const sales = qty * price
        if (!byMenu[name]) byMenu[name] = { qty: 0, sales: 0 }
        byMenu[name].qty += qty
        byMenu[name].sales += sales
      }
    }

    const result = Object.entries(byMenu)
      .map(([name, v]) => ({ name, qty: v.qty, sales: v.sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 500)

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByMenu:', e)
    return NextResponse.json([], { headers })
  }
}
