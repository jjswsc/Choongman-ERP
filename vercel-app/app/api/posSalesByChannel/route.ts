/**
 * 채널별 매출 (매장/포장/배달). pos_orders 기반. pos 필터 지원.
 */
import { NextRequest, NextResponse } from 'next/server'
import { normalizePosOrderTypeKey, parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import { fetchPosSalesOrdersForBusinessRange } from '@/lib/pos-sales-fetch-rows'
import { filterCompletedPosSalesRows } from '@/lib/pos-sales-period-aggregate'

/** UI에서 i18n 매핑용 고정 키 */
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
    const stores = resolveStoresFromParams(pos, searchParams.get('stores'))
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const { rows, truncated } = await fetchPosSalesOrdersForBusinessRange({
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      queryLabel: 'posSalesByChannel',
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'posSalesFetchRows')

    const filtered = filterCompletedPosSalesRows(rows, orderTypesAllowed)
    const byChannel: Record<string, number> = {}
    for (const r of filtered) {
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
