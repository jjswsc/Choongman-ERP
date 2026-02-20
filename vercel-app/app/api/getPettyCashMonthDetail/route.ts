import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** 해당 월 거래 전체 + 실시간 잔액 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const scopeFilter = String(searchParams.get('scopeFilter') || searchParams.get('scope') || '').trim()
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const departmentFilter = String(searchParams.get('departmentFilter') || searchParams.get('department') || '').trim()
  let yearMonth = String(searchParams.get('yearMonth') || searchParams.get('yearMonth') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()

  if (storeFilter === 'undefined' || storeFilter === 'null' || storeFilter === 'All') storeFilter = ''

  const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
  let effectiveStore = ''
  if (!isOffice && userStore) effectiveStore = userStore
  else if (scopeFilter === 'office') {
    effectiveStore = departmentFilter ? 'Office-' + departmentFilter : 'Office'
  } else if (storeFilter) effectiveStore = storeFilter

  if (yearMonth.length < 7) {
    const n = new Date()
    yearMonth = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0')
  }
  const parts = yearMonth.split('-')
  const year = parseInt(parts[0], 10) || new Date().getFullYear()
  const month = parseInt(parts[1], 10) || 1
  const startStr = String(year) + '-' + String(month).padStart(2, '0') + '-01'
  const lastDay = new Date(year, month, 0).getDate()
  const endStr = String(year) + '-' + String(month).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0')

  try {
    let rows: { id?: number; store?: string; trans_date?: string; trans_type?: string; amount?: number; memo?: string; receipt_url?: string; user_name?: string }[] = []
    if (effectiveStore) {
      if (effectiveStore === 'Office' && !departmentFilter) {
        rows = (await supabaseSelectFilter(
          'petty_cash_transactions',
          'or=(store.eq.Office,store.eq.본사,store.eq.오피스,store.eq.본점,store.ilike.Office-%25)',
          { order: 'trans_date.asc,id.asc', limit: 2000 }
        )) as typeof rows
      } else {
        rows = (await supabaseSelectFilter(
          'petty_cash_transactions',
          'store=eq.' + encodeURIComponent(effectiveStore),
          { order: 'trans_date.asc,id.asc', limit: 2000 }
        )) as typeof rows
      }
    } else {
      rows = (await supabaseSelect('petty_cash_transactions', {
        order: 'trans_date.asc,id.asc',
        limit: 2000,
      })) as typeof rows
    }

    const startD = new Date(startStr + 'T00:00:00')
    const endD = new Date(endStr + 'T23:59:59')
    const storePrevBal: Record<string, number> = {}
    const inMonth: { id: number; store: string; trans_date: string; trans_type: string; amount: number; memo: string; receipt_url?: string; user_name: string }[] = []

    for (const r of rows || []) {
      const dt = toDateStr(r.trans_date)
      if (!dt) continue
      const store = String(r.store || '').trim()
      if (!store) continue
      const amt = Number(r.amount) || 0
      const dtD = new Date(dt + 'T12:00:00')

      if (dtD < startD) {
        if (!storePrevBal[store]) storePrevBal[store] = 0
        storePrevBal[store] += amt
        continue
      }
      if (dtD > endD) continue
      inMonth.push({
        id: r.id || 0,
        store,
        trans_date: dt,
        trans_type: String(r.trans_type || 'expense').trim(),
        amount: amt,
        memo: String(r.memo || '').trim(),
        receipt_url: r.receipt_url ? String(r.receipt_url).trim() : undefined,
        user_name: String(r.user_name || '').trim(),
      })
    }

    inMonth.sort((a, b) => {
      const c = a.store.localeCompare(b.store)
      return c !== 0 ? c : a.trans_date.localeCompare(b.trans_date)
    })

    const storeBal: Record<string, number> = { ...storePrevBal }
    const list: { id: number; store: string; trans_date: string; trans_type: string; amount: number; balance_after: number; memo: string; receipt_url?: string; user_name: string }[] = []
    for (const it of inMonth) {
      if (!storeBal[it.store]) storeBal[it.store] = 0
      storeBal[it.store] += it.amount
      list.push({
        id: it.id,
        store: it.store,
        trans_date: it.trans_date,
        trans_type: it.trans_type,
        amount: it.amount,
        balance_after: storeBal[it.store],
        memo: it.memo,
        receipt_url: it.receipt_url,
        user_name: it.user_name,
      })
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPettyCashMonthDetail:', e)
    return NextResponse.json([], { headers })
  }
}
