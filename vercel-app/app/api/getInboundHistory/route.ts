import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/** 입고 내역 조회 - stock_logs log_type=Inbound (From HQ 제외) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    let startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
    let endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
    const vendorFilter = String(searchParams.get('vendorFilter') || searchParams.get('vendor') || '').trim()

    if (!startStr || !endStr) {
      const now = new Date()
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      startStr = first.toISOString().slice(0, 10)
      endStr = last.toISOString().slice(0, 10)
    }

    const itemRows = (await supabaseSelect('items', { order: 'id.asc', limit: 5000 })) as {
      code?: string
      spec?: string
      cost?: number
    }[] | null
    const itemMap: Record<string, { spec: string; cost: number }> = {}
    for (const row of itemRows || []) {
      const code = String(row.code || '').trim()
      if (code) itemMap[code] = { spec: row.spec || '-', cost: Number(row.cost) || 0 }
    }

    const logs = (await supabaseSelectFilter(
      'stock_logs',
      'log_type=eq.Inbound',
      { order: 'log_date.desc', limit: 400 }
    )) as {
      log_date?: string
      vendor_target?: string
      item_code?: string
      item_name?: string
      qty?: number
    }[] | null

    const startD = new Date(startStr)
    const endD = new Date(endStr)
    startD.setHours(0, 0, 0, 0)
    endD.setHours(23, 59, 59, 999)

    const list: { date: string; vendor: string; name: string; spec: string; qty: number; amount: number }[] = []
    for (const row of logs || []) {
      if (String(row.vendor_target || '').trim() === 'From HQ') continue
      const rowDate = row.log_date ? new Date(row.log_date) : null
      if (!rowDate || isNaN(rowDate.getTime())) continue
      if (rowDate < startD || rowDate > endD) continue

      const rowVendor = String(row.vendor_target || '').trim()
      if (vendorFilter && vendorFilter !== 'All' && vendorFilter !== '전체 매입처' && rowVendor !== vendorFilter) continue

      const code = String(row.item_code || '').trim()
      const info = itemMap[code] || { spec: '-', cost: 0 }
      const qty = Number(row.qty) || 0
      list.push({
        date: rowDate.toISOString().slice(0, 10),
        vendor: rowVendor,
        name: row.item_name || '-',
        spec: info.spec,
        qty,
        amount: info.cost * qty,
      })
      if (list.length >= 300) break
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInboundHistory:', e)
    return NextResponse.json([], { headers })
  }
}
