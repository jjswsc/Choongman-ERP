import { NextRequest, NextResponse } from 'next/server'
import { fetchStockLogsItemQtySum } from '@/lib/stock-logs-active-filter'

/** 본사 발주용: location별 재고 (stock_logs 합산) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const locationCode = String(searchParams.get('locationCode') || searchParams.get('location') || '').trim()

  if (!locationCode) {
    return NextResponse.json({}, { headers })
  }

  try {
    const enc = encodeURIComponent(locationCode)
    const m = await fetchStockLogsItemQtySum(`location=ilike.${enc}`, {
      pageSize: 8000,
      maxRows: 100000,
    })
    return NextResponse.json(m, { headers })
  } catch (e) {
    console.error('getHqStockByLocation:', e)
    return NextResponse.json({}, { headers })
  }
}
