/**
 * 채널별 매출 (매장/포장/배달). pos_orders 기반. pos 필터 지원.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { filterRowsByPosSalesBusinessDateRange, posSalesBusinessDateRangeUtcEnvelope } from '@/lib/pos-sales-business-day-range'
import { parseOrderTypesParam, rowMatchesOrderFilter } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams, appendStoreCodeFilter } from '@/lib/pos-sales-store-filter'
import { loadPosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']
const FETCH_LIMIT = 50000

/** UI에서 i18n 매핑용 고정 키 */
function bucketOrderType(raw: string): 'dine_in' | 'takeout' | 'delivery' | 'unknown' {
  const t = String(raw ?? '').trim()
  if (t === 'dine_in' || t === 'takeout' || t === 'delivery') return t
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
      select: 'created_at,order_type,total,status,store_code',
    })) as { created_at?: string; order_type?: string; total?: number; status?: string; store_code?: string }[]

    const rows = filterRowsByPosSalesBusinessDateRange(rowsRaw, bizCtx, startStr, endStr)

    if (rowsRaw.length >= FETCH_LIMIT) headers.set('X-Sales-Truncated', '1')

    const byChannel: Record<string, number> = {}
    for (const r of rows) {
      if (!rowMatchesOrderFilter(r.order_type, orderTypesAllowed)) continue
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
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
