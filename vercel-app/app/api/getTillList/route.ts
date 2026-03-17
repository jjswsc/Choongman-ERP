import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export interface TillItem {
  id: number
  store: string
  trans_date: string
  trans_type: string
  amount: number
  balance_after: number | null
  memo: string
  user_name: string
}

/** 시재(카운터 현금) 입출금 목록 - pos_till_transactions */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()

  if (storeFilter === 'undefined' || storeFilter === 'null' || storeFilter === 'All') storeFilter = ''

  const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
  const effectiveStore = !isOffice && userStore ? userStore : storeFilter || ''

  if (!effectiveStore) {
    return NextResponse.json([], { headers })
  }

  try {
    let rows = (await supabaseSelectFilter(
      'pos_till_transactions',
      'store_code=eq.' + encodeURIComponent(effectiveStore),
      { order: 'trans_date.asc,id.asc', limit: 2000 }
    )) as { id: number; store_code?: string; trans_date?: string; trans_type?: string; amount?: number; memo?: string; user_name?: string }[] | null

    const startD = startStr ? new Date(startStr + 'T00:00:00') : null
    const endD = endStr ? new Date(endStr + 'T23:59:59') : null

    let balance = 0
    const list: TillItem[] = []

    for (const r of rows || []) {
      const dt = toDateStr(r.trans_date)
      if (!dt) continue
      const dtD = new Date(dt + 'T12:00:00')
      const inRange = (!startD || dtD >= startD) && (!endD || dtD <= endD)

      const amt = Number(r.amount) || 0
      balance += amt

      if (inRange) {
        list.push({
          id: r.id,
          store: String(r.store_code || '').trim(),
          trans_date: dt,
          trans_type: String(r.trans_type || 'deposit').trim(),
          amount: amt,
          balance_after: balance,
          memo: String(r.memo || '').trim(),
          user_name: String(r.user_name || '').trim(),
        })
      }
    }

    list.sort((a, b) => b.trans_date.localeCompare(a.trans_date) || b.id - a.id)
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getTillList:', e)
    return NextResponse.json([], { headers })
  }
}
