import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { isOfficeRole } from '@/lib/permissions'
import {
  buildHqWarehouseDailyStockMatrix,
  parseHqDailyMatrixDateRange,
} from '@/lib/hq-warehouse-daily-stock-matrix'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  const role = String(authResult.auth.role || '')
  if (!isOfficeRole(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
  }

  const { searchParams } = new URL(request.url)
  const range = parseHqDailyMatrixDateRange(
    searchParams.get('startStr') || searchParams.get('start'),
    searchParams.get('endStr') || searchParams.get('end')
  )
  if (!range) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400, headers })
  }

  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim() || null
  const warehouseKey = String(searchParams.get('warehouseKey') || searchParams.get('warehouse') || '').trim() || null
  const includePriorPeriod = searchParams.get('includePriorPeriod') !== '0'
  const categoryFilter = String(searchParams.get('categoryFilter') || searchParams.get('category') || '').trim() || null

  try {
    const data = await buildHqWarehouseDailyStockMatrix({
      startStr: range.startStr,
      endStr: range.endStr,
      storeFilter,
      categoryFilter,
      warehouseKey,
      includePriorPeriod,
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    console.error('getHqWarehouseDailyStockMatrix:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
