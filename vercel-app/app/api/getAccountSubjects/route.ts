import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/** 계정과목 목록 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  const { searchParams } = new URL(request.url)
  const typeFilter = String(searchParams.get('type') || '').trim()
  const forExpense = searchParams.get('forExpense') === 'true'
  const forFixed = searchParams.get('forFixed') === 'true'
  const forCost = searchParams.get('forCost') === 'true'
  const forTransfer = searchParams.get('forTransfer') === 'true'
  const forRevenue = searchParams.get('forRevenue') === 'true'
  const forCard = searchParams.get('forCard') === 'true'
  const forItem = searchParams.get('forItem') === 'true'
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
    /**
     * 품목 관리용 계정과목:
     * - 물류/품목에서 실제 사용하는 원가(cost)·비용(expense) 계정만 노출
     * - 자산/부채/자본/수익/이체 계정 숨김
     */
    if (forItem) {
      list = list.filter((x) => {
        if (x.type !== 'expense') return false
        const code = String(x.code || '').trim()
        // 매입: 식품원재료(5111), 포장재(5112)만 (코드 고정)
        const isAllowedCost = x.pAndLSection === 'cost' && (code === '5111' || code === '5112')
        // 비용: 소모품비(5521), 잡비(5520)만 (코드 고정)
        const isAllowedExpense = x.pAndLSection === 'expense' && (code === '5521' || code === '5520')
        return isAllowedCost || isAllowedExpense
      })
      // 품목 화면에서는 고정 코드 계정명을 표준 라벨로 노출한다.
      // (기존 DB에 남아있는 과거 영문명 예: 5521=Service costs 정리)
      list = list.map((x) => {
        const code = String(x.code || '').trim()
        if (code === '5521') {
          return { ...x, name: '소모품비', nameEn: 'Supplies Expense' }
        }
        if (code === '5520') {
          return { ...x, name: '기타경비', nameEn: 'Misc Expense' }
        }
        return x
      })
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
