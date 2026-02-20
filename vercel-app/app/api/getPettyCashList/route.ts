import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const scopeFilter = String(searchParams.get('scopeFilter') || searchParams.get('scope') || '').trim()
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const departmentFilter = String(searchParams.get('departmentFilter') || searchParams.get('department') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()

  if (storeFilter === 'undefined' || storeFilter === 'null' || storeFilter === 'All') storeFilter = ''

  const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
  let effectiveStore = ''
  if (!isOffice && userStore) effectiveStore = userStore
  else if (scopeFilter === 'office') {
    effectiveStore = departmentFilter ? 'Office-' + departmentFilter : 'Office'
  } else if (storeFilter) effectiveStore = storeFilter

  try {
    let rows: { id: number; store?: string; trans_date?: string; trans_type?: string; amount?: number; balance_after?: number; memo?: string; receipt_url?: string; user_name?: string }[] = []
    if (effectiveStore) {
      if (effectiveStore === 'Office' && !departmentFilter) {
        rows = (await supabaseSelectFilter(
          'petty_cash_transactions',
          'or=(store.eq.Office,store.eq.본사,store.eq.오피스,store.eq.본점,store.ilike.Office-%25)',
          { order: 'trans_date.desc,id.desc', limit: 500 }
        )) as typeof rows
      } else {
        rows = (await supabaseSelectFilter(
          'petty_cash_transactions',
          'store=eq.' + encodeURIComponent(effectiveStore),
          { order: 'trans_date.desc,id.desc', limit: 500 }
        )) as typeof rows
      }
    } else {
      rows = (await supabaseSelect('petty_cash_transactions', {
        order: 'trans_date.desc,id.desc',
        limit: 500,
      })) as typeof rows
    }

    const startD = startStr ? new Date(startStr + 'T00:00:00') : null
    const endD = endStr ? new Date(endStr + 'T23:59:59') : null

    const list: { id: number; store: string; trans_date: string; trans_type: string; amount: number; balance_after: number | null; memo: string; receipt_url?: string; user_name: string }[] = []
    for (const r of rows || []) {
      const dt = toDateStr(r.trans_date)
      if (!dt) continue
      if (startD && new Date(dt + 'T12:00:00') < startD) continue
      if (endD && new Date(dt + 'T12:00:00') > endD) continue
      list.push({
        id: r.id,
        store: String(r.store || '').trim(),
        trans_date: dt,
        trans_type: String(r.trans_type || 'expense').trim(),
        amount: Number(r.amount) || 0,
        balance_after: r.balance_after != null ? Number(r.balance_after) : null,
        memo: String(r.memo || '').trim(),
        receipt_url: r.receipt_url ? String(r.receipt_url).trim() : undefined,
        user_name: String(r.user_name || '').trim(),
      })
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPettyCashList:', e)
    return NextResponse.json([], { headers })
  }
}
