import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/** 통장(계좌) 목록 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeFilter = String(searchParams.get('store') || searchParams.get('storeFilter') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()

  const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
  const effectiveStore = !isOffice && userStore ? userStore : storeFilter

  try {
    let rows: { id?: number; name?: string; store?: string; bank_name?: string; opening_balance?: number; opening_balance_date?: string; sort_order?: number }[] = []
    if (effectiveStore && effectiveStore !== 'All') {
      rows = (await supabaseSelectFilter('bank_accounts', `store=ilike.${encodeURIComponent(effectiveStore)}`, {
        order: 'sort_order.asc,id.asc',
        limit: 100,
      })) as typeof rows
    } else {
      rows = (await supabaseSelect('bank_accounts', {
        order: 'sort_order.asc,id.asc',
        limit: 100,
      })) as typeof rows
    }

    const list = (rows || []).map((r) => ({
      id: r.id,
      name: String(r.name || '').trim(),
      store: String(r.store || '').trim(),
      bankName: String(r.bank_name || '').trim(),
      openingBalance: Number(r.opening_balance) ?? 0,
      openingBalanceDate: r.opening_balance_date ? String(r.opening_balance_date).slice(0, 10) : null,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getBankAccounts:', e)
    return NextResponse.json([], { headers })
  }
}
