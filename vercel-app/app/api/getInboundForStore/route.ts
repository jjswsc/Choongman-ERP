import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/** 매장 전용 - 본사에서 해당 매장으로 보낸 입고 수령 내역 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const storeName = String(searchParams.get('storeName') || searchParams.get('store') || '').trim()
    let startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
    let endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()

    if (!storeName) {
      return NextResponse.json([], { headers })
    }

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
      `location=ilike.${encodeURIComponent(storeName)}`,
      { order: 'log_date.desc', limit: 400 }
    )) as {
      log_date?: string
      log_type?: string
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
      const type = String(row.log_type || '')
      const note = String(row.vendor_target || '').trim()
      const isFromHq = (type === 'ForcePush' && note === 'HQ') || (type === 'Inbound' && note === 'From HQ')
      if (!isFromHq) continue

      const rowDate = row.log_date ? new Date(row.log_date) : null
      if (!rowDate || isNaN(rowDate.getTime())) continue
      if (rowDate < startD || rowDate > endD) continue

      const code = String(row.item_code || '').trim()
      const info = itemMap[code] || { spec: '-', cost: 0 }
      const qty = Number(row.qty) || 0
      list.push({
        date: rowDate.toISOString().slice(0, 10),
        vendor: 'From HQ',
        name: row.item_name || '-',
        spec: info.spec,
        qty,
        amount: info.cost * qty,
      })
      if (list.length >= 300) break
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInboundForStore:', e)
    return NextResponse.json([], { headers })
  }
}
