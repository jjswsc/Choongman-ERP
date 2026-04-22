import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
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

    const startD = startStr ? new Date(startStr) : new Date()
    const endD = endStr ? new Date(endStr) : new Date()
    startD.setHours(0, 0, 0, 0)
    endD.setHours(23, 59, 59, 999)

    const logs = (await supabaseSelectFilter(
      'stock_logs',
      'log_type=eq.Adjustment',
      {
        order: 'log_date.desc',
        limit: 500,
        select: 'log_date,location,item_code,item_name,qty,vendor_target',
      }
    )) as {
      log_date?: string
      location?: string
      item_code?: string
      item_name?: string
      qty?: number
      vendor_target?: string
    }[] | null

    const itemRows = (await supabaseSelect('items', { order: 'id.asc', limit: 5000, select: 'code,spec' })) as {
      code?: string
      spec?: string
    }[] | null
    const specMap: Record<string, string> = {}
    for (const r of itemRows || []) {
      if (r?.code) specMap[r.code] = r.spec || '-'
    }

    const list: { date: string; store: string; item: string; spec: string; diff: number; reason: string }[] = []
    for (const row of logs || []) {
      const rowDate = row.log_date ? new Date(row.log_date) : null
      if (!rowDate || isNaN(rowDate.getTime())) continue
      if (rowDate < startD || rowDate > endD) continue

      const store = String(row.location || '')
      if (storeFilter && storeFilter.toLowerCase() !== 'all' && store.toLowerCase() !== storeFilter.toLowerCase()) continue

      const dateStr = rowDate.toISOString().slice(0, 10)
      list.push({
        date: dateStr,
        store,
        item: row.item_name || '-',
        spec: specMap[row.item_code || ''] || '-',
        diff: Number(row.qty) || 0,
        reason: resolveVendorName(String(row.vendor_target || '')),
      })
      if (list.length >= 300) break
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getAdjustmentHistory:', e)
    return NextResponse.json([], { headers })
  }
}
