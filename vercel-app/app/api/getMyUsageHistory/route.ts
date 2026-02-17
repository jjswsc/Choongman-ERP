import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || '').trim()
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()

  if (!store || !startStr || !endStr) {
    return NextResponse.json([], { headers })
  }

  try {
    const itemRows = (await supabaseSelect('items', { order: 'id.asc' })) as { code?: string; price?: number }[]
    const priceByCode: Record<string, number> = {}
    ;(itemRows || []).forEach((it) => {
      priceByCode[String(it.code || '')] = Number(it.price) || 0
    })

    const filter = `location=eq.${encodeURIComponent(store)}&log_type=eq.Usage`
    const logs = (await supabaseSelectFilter('stock_logs', filter, {
      order: 'log_date.desc',
      limit: 200,
    })) as { log_date?: string; item_code?: string; item_name?: string; qty?: number; user_name?: string }[]

    const startD = new Date(startStr)
    startD.setHours(0, 0, 0, 0)
    const endD = new Date(endStr)
    endD.setHours(23, 59, 59, 999)

    const list: { date: string; dateTime: string; item: string; qty: number; amount: number; userName?: string }[] = []
    for (const row of logs || []) {
      const rowDate = new Date(row.log_date || '')
      if (isNaN(rowDate.getTime()) || rowDate < startD || rowDate > endD) continue
      const qty = Math.abs(Number(row.qty) || 0)
      const code = String(row.item_code || '').trim()
      const price = priceByCode[code] ?? 0
      const userName = String(row.user_name || '').trim() || undefined
      list.push({
        date: rowDate.toISOString().slice(0, 10),
        dateTime: rowDate.toISOString().slice(0, 16).replace('T', ' '),
        item: String(row.item_name || '').trim(),
        qty,
        amount: price * qty,
        userName,
      })
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getMyUsageHistory:', e)
    return NextResponse.json([], { headers })
  }
}
