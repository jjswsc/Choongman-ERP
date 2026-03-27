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
  const forCost = searchParams.get('forCost') === 'true'
  const forTransfer = searchParams.get('forTransfer') === 'true'
  const forRevenue = searchParams.get('forRevenue') === 'true'
  const forCard = searchParams.get('forCard') === 'true'
  const excludeHeaders = searchParams.get('excludeHeaders') === 'true'

  try {
    type Row = {
      id?: number
      code?: string
      name?: string
      name_en?: string
      name_th?: string | null
      type?: string
      p_and_l_section?: string
      sort_order?: number
      statement_type?: string | null
      normal_side?: string | null
      parent_id?: number | null
      is_header?: boolean | null
      is_system?: boolean | null
      coa_class?: string | null
    }
    let rows: Row[] = []

    if (typeFilter && typeFilter !== 'All') {
      rows = (await supabaseSelectFilter('account_subjects', `type=ilike.${encodeURIComponent(typeFilter)}`, {
        order: 'sort_order.asc,code.asc',
        limit: 2000,
      })) as Row[]
    } else {
      rows = (await supabaseSelect('account_subjects', {
        order: 'sort_order.asc,code.asc',
        limit: 2000,
      })) as Row[]
    }

    let list = (rows || []).map((r) => {
      const plRaw = (r.p_and_l_section || '').toString().trim()
      const plNorm = plRaw ? plRaw.toLowerCase() : null
      return {
      id: r.id,
      code: String(r.code || '').trim(),
      name: String(r.name || '').trim(),
      nameEn: (r.name_en || '').toString().trim() || null,
      nameTh: r.name_th != null && String(r.name_th).trim() !== '' ? String(r.name_th).trim() : null,
      type: String(r.type || 'expense').toLowerCase(),
      pAndLSection: plNorm,
      sortOrder: Number(r.sort_order) ?? 0,
      statementType: r.statement_type != null ? String(r.statement_type).trim().toLowerCase() || null : null,
      normalSide: r.normal_side != null ? String(r.normal_side).trim().toLowerCase() || null : null,
      parentId: r.parent_id != null && !Number.isNaN(Number(r.parent_id)) ? Number(r.parent_id) : null,
      isHeader: Boolean(r.is_header),
      isSystem: Boolean(r.is_system),
      coaClass: r.coa_class != null && String(r.coa_class).trim() !== '' ? String(r.coa_class).trim() : null,
      }
    })

    /**
     * 지출 등록·은행·패티 등 일반 경비: type=expense 중 매출원가(cost)만 제외
     * (구) 손익 구분 fixed(고정비) 과목도 경비·지출등록에서 동일하게 선택 가능
     */
    if (forExpense) {
      list = list.filter((x) => {
        if (x.type !== 'expense') return false
        return x.pAndLSection !== 'cost'
      })
    }
    if (forFixed) {
      list = list.filter((x) => x.type === 'expense' && x.pAndLSection === 'fixed')
    }
    if (forCost) {
      list = list.filter((x) => x.type === 'expense' && x.pAndLSection === 'cost')
    }
    if (forTransfer) {
      list = list.filter((x) => x.type === 'transfer')
    }
    if (forRevenue) {
      list = list.filter((x) => x.type === 'revenue')
    }
    if (forCard) {
      list = list.filter((x) => x.type === 'expense' && (x.pAndLSection === 'expense' || x.pAndLSection === 'cost' || !x.pAndLSection))
    }

    if (excludeHeaders) {
      list = list.filter((x) => !x.isHeader)
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getAccountSubjects:', e)
    return NextResponse.json([], { headers })
  }
}
