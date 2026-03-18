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
    let rows: { id: number; store?: string; trans_date?: string; trans_type?: string; amount?: number; balance_after?: number; memo?: string; receipt_url?: string; user_name?: string; account_subject_id?: number }[] = []
    // 잔액 계산을 위해 날짜순(오래된순) 조회
    if (effectiveStore) {
      if (effectiveStore === 'Office' && !departmentFilter) {
        rows = (await supabaseSelectFilter(
          'petty_cash_transactions',
          'or=(store.eq.Office,store.eq.본사,store.eq.오피스,store.eq.본점,store.ilike.Office-%25)',
          { order: 'trans_date.asc,id.asc', limit: 20000 }
        )) as typeof rows
      } else {
        rows = (await supabaseSelectFilter(
          'petty_cash_transactions',
          'store=eq.' + encodeURIComponent(effectiveStore),
          { order: 'trans_date.asc,id.asc', limit: 20000 }
        )) as typeof rows
      }
    } else {
      rows = (await supabaseSelect('petty_cash_transactions', {
        order: 'trans_date.asc,id.asc',
        limit: 20000,
      })) as typeof rows
    }

    const startD = startStr ? new Date(startStr + 'T00:00:00') : null
    const endD = endStr ? new Date(endStr + 'T23:59:59') : null

    // 날짜순(이미 asc 조회됨)으로 잔액 계산 (DB에 balance_after가 없을 수 있음)
    const storeBal: Record<string, number> = {}
    const list: { id: number; store: string; trans_date: string; trans_type: string; amount: number; balance_after: number | null; memo: string; receipt_url?: string; user_name: string; account_subject_id?: number | null; accountSubjectId?: number | null }[] = []

    for (const r of rows || []) {
      const dt = toDateStr(r.trans_date)
      if (!dt) continue
      const store = String(r.store || '').trim()
      if (!store) continue
      const amt = Number(r.amount) || 0
      if (!storeBal[store]) storeBal[store] = 0
      storeBal[store] += amt

      const dtD = new Date(dt + 'T12:00:00')
      if (startD && dtD < startD) continue
      if (endD && dtD > endD) continue

      list.push({
        id: r.id,
        store,
        trans_date: dt,
        trans_type: String(r.trans_type || 'expense').trim(),
        amount: amt,
        balance_after: storeBal[store],
        memo: String(r.memo || '').trim(),
        receipt_url: r.receipt_url ? String(r.receipt_url).trim() : undefined,
        user_name: String(r.user_name || '').trim(),
        account_subject_id: r.account_subject_id != null ? Number(r.account_subject_id) : null,
        accountSubjectId: r.account_subject_id != null ? Number(r.account_subject_id) : null,
      })
    }

    // 최신순으로 정렬 (화면 표시용)
    list.sort((a, b) => b.trans_date.localeCompare(a.trans_date) || b.id - a.id)

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPettyCashList:', e)
    return NextResponse.json([], { headers })
  }
}
