import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/** 재고 조정 내역 조회 - stock_logs log_type=Adjustment */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
    const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
    const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()

    const startD = startStr ? new Date(startStr) : new Date()
    const endD = endStr ? new Date(endStr) : new Date()
    startD.setHours(0, 0, 0, 0)
    endD.setHours(23, 59, 59, 999)

    const logs = (await supabaseSelectFilter(
      'stock_logs',
      'log_type=eq.Adjustment',
      { order: 'log_date.desc', limit: 500 }
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
        reason: row.vendor_target || '',
      })
      if (list.length >= 300) break
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getAdjustmentHistory:', e)
    return NextResponse.json([], { headers })
  }
}
