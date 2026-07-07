import { NextRequest, NextResponse } from 'next/server'
import { getBangkokDateRangeUtc } from '@/lib/bangkok-time'
import { isOutboundLogDateInBangkokYmdRange } from '@/lib/hq-outbound-income-total'
import { formatDateBangkok, formatDateHourMinBangkok } from '@/lib/outbound-order-line-match'
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
    const itemRows = (await supabaseSelect('items', { order: 'id.asc', select: 'code,price,category' })) as { code?: string; price?: number; category?: string }[]
    const priceByCode: Record<string, number> = {}
    const categoryByCode: Record<string, string> = {}
    ;(itemRows || []).forEach((it) => {
      const code = String(it.code || '')
      priceByCode[code] = Number(it.price) || 0
      categoryByCode[code] = String(it.category || '').trim()
    })

    const lo = startStr <= endStr ? startStr : endStr
    const hi = startStr <= endStr ? endStr : startStr
    const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(lo, hi)
    const filter = [
      `location=ilike.${encodeURIComponent(store)}`,
      'log_type=eq.Usage',
      `log_date=gte.${encodeURIComponent(dayStartUtcIso)}`,
      `log_date=lt.${encodeURIComponent(nextDayStartUtcIso)}`,
    ].join('&')
    const logs = (await supabaseSelectFilter('stock_logs', filter, {
      order: 'log_date.desc',
      limit: 50000,
      select: 'log_date,item_code,item_name,qty,user_name',
    })) as { log_date?: string; item_code?: string; item_name?: string; qty?: number; user_name?: string }[]

    const nameToNick: Record<string, string> = {}
    if (store) {
      try {
        const empFilter = `store=eq.${encodeURIComponent(store)}`
        const emps = (await supabaseSelectFilter('employees', empFilter, { select: 'name,nick', limit: 2000 })) as { name?: string; nick?: string }[]
        for (const e of emps || []) {
          const n = String(e.name || '').trim()
          if (n) nameToNick[n] = String(e.nick || e.name || '').trim() || n
        }
      } catch {}
    }

    const list: { date: string; dateTime: string; item: string; itemCode: string; category: string; qty: number; amount: number; userName?: string; userNick?: string }[] = []
    for (const row of logs || []) {
      if (!isOutboundLogDateInBangkokYmdRange(row.log_date, lo, hi)) continue
      const rowDate = new Date(row.log_date || '')
      if (isNaN(rowDate.getTime())) continue
      const qty = Math.abs(Number(row.qty) || 0)
      const code = String(row.item_code || '').trim()
      const price = priceByCode[code] ?? 0
      const userName = String(row.user_name || '').trim() || undefined
      const userNick = userName ? nameToNick[userName] : undefined
      list.push({
        date: formatDateBangkok(rowDate),
        dateTime: formatDateHourMinBangkok(rowDate),
        item: String(row.item_name || '').trim(),
        itemCode: code,
        category: categoryByCode[code] || '',
        qty,
        amount: price * qty,
        userName,
        userNick,
      })
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getMyUsageHistory:', e)
    return NextResponse.json([], { headers })
  }
}
