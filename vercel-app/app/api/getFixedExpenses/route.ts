import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/** 고정비 목록 조회 */
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
    type Row = { id?: number; name?: string; monthly_amount?: number; store?: string; start_year_month?: string; end_year_month?: string; memo?: string; account_subject_id?: number }
    let rows: Row[] = []
    if (effectiveStore && effectiveStore !== 'All') {
      rows = (await supabaseSelectFilter('fixed_expenses', `store=ilike.${encodeURIComponent(effectiveStore)}`, {
        order: 'store.asc,name.asc',
        limit: 200,
      })) as Row[]
    } else {
      rows = (await supabaseSelect('fixed_expenses', {
        order: 'store.asc,name.asc',
        limit: 200,
      })) as Row[]
    }

    const list = (rows || []).map((r) => ({
      id: r.id,
      name: String(r.name || '').trim(),
      monthlyAmount: Number(r.monthly_amount) ?? 0,
      store: String(r.store || '').trim(),
      startYearMonth: r.start_year_month ? String(r.start_year_month).trim() : null,
      endYearMonth: r.end_year_month ? String(r.end_year_month).trim() : null,
      memo: String(r.memo || '').trim() || null,
      accountSubjectId: r.account_subject_id ?? null,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getFixedExpenses:', e)
    return NextResponse.json([], { headers })
  }
}
