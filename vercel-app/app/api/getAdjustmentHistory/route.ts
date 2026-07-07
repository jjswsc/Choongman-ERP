import { NextRequest, NextResponse } from 'next/server'
import { fetchAdjustmentHistoryRows } from '@/lib/stock-logs-history-rpc'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { createVendorNameResolver } from '@/lib/vendor-name-normalizer'

/** 재고 조정 내역 조회 - stock_logs log_type=Adjustment. 매니저는 자기 매장만 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const auth = await getVerifiedAuth(request)
  const userRole = (auth?.role || '').toLowerCase()
  const isManager = userRole.includes('manager') || userRole.includes('franchisee')
  const userStore = (auth?.store || '').trim()

  try {
    const resolveVendorName = await createVendorNameResolver()
    const { searchParams } = new URL(request.url)
    const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
    const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
    let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
    if (isManager && userStore) storeFilter = userStore

    if (!startStr || !endStr) {
      return NextResponse.json([], { headers })
    }

    const rows = await fetchAdjustmentHistoryRows({ startStr, endStr, storeFilter })
    const list = rows.map((row) => ({
      date: row.date,
      store: row.store,
      item: row.item,
      itemCode: row.itemCode,
      category: row.category,
      spec: row.spec,
      diff: row.diff,
      reason: resolveVendorName(row.vendorTarget),
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getAdjustmentHistory:', e)
    return NextResponse.json([], { headers })
  }
}
