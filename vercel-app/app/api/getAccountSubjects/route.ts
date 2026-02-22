import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/** 계정과목 목록 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const typeFilter = String(searchParams.get('type') || '').trim()
  const forExpense = searchParams.get('forExpense') === 'true'
  const forFixed = searchParams.get('forFixed') === 'true'
  const forTransfer = searchParams.get('forTransfer') === 'true'

  try {
    type Row = { id?: number; code?: string; name?: string; name_en?: string; type?: string; p_and_l_section?: string; sort_order?: number }
    let rows: Row[] = []

    if (typeFilter && typeFilter !== 'All') {
      rows = (await supabaseSelectFilter('account_subjects', `type=ilike.${encodeURIComponent(typeFilter)}`, {
        order: 'sort_order.asc,code.asc',
        limit: 200,
      })) as Row[]
    } else {
      rows = (await supabaseSelect('account_subjects', {
        order: 'sort_order.asc,code.asc',
        limit: 200,
      })) as Row[]
    }

    let list = (rows || []).map((r) => ({
      id: r.id,
      code: String(r.code || '').trim(),
      name: String(r.name || '').trim(),
      nameEn: (r.name_en || '').toString().trim() || null,
      type: String(r.type || 'expense').toLowerCase(),
      pAndLSection: (r.p_and_l_section || '').toString().trim() || null,
      sortOrder: Number(r.sort_order) ?? 0,
    }))

    if (forExpense) {
      list = list.filter((x) => x.type === 'expense' && (x.pAndLSection === 'expense' || !x.pAndLSection))
    }
    if (forFixed) {
      list = list.filter((x) => x.type === 'expense' && x.pAndLSection === 'fixed')
    }
    if (forTransfer) {
      list = list.filter((x) => x.type === 'transfer')
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getAccountSubjects:', e)
    return NextResponse.json([], { headers })
  }
}
