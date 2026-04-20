import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelectPageCap } from '@/lib/supabase-server'
import { postgrestStoreNameIlikeOrFilter } from '@/lib/evaluation-postgrest-filters'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { canViewEvaluationForStore, roleMayViewEvaluation } from '@/lib/warning-letter-evaluation-access'

export type WarningLetterRegistryApiRow = {
  id: number
  store_name: string
  employee_name: string
  incident_date: string | null
  incident_type: string
  details: string
  warning_letter_url: string | null
  evaluator_name: string
  approval_status: 'draft' | 'pending' | 'approved' | 'rejected'
  approved_by: string | null
  approved_at: string | null
  rejected_reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** 독립 등록 경고 레지스트리 — JWT·매장 접근은 평가 조회와 동일 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(req)
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401, headers })
    }
    if (!roleMayViewEvaluation(auth)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403, headers })
    }

    const { searchParams } = new URL(req.url)
    const startStr = (searchParams.get('start') || '').trim().slice(0, 10)
    const endStr = (searchParams.get('end') || '').trim().slice(0, 10)
    const filterStore = (searchParams.get('store') || 'All').trim()
    const filterEmployee = (searchParams.get('employee') || 'All').trim()
    const filterEvaluator = (searchParams.get('evaluator') || 'All').trim()
    const filterApproval = (searchParams.get('approval') || 'All').trim()

    const pageCap = supabaseSelectPageCap()

    const filters: string[] = []
    if (startStr) filters.push(`incident_date=gte.${startStr}`)
    if (endStr) filters.push(`incident_date=lte.${endStr}`)
    if (filterStore && filterStore !== 'All') {
      const sf = postgrestStoreNameIlikeOrFilter(filterStore)
      if (sf) filters.push(sf)
    }
    if (filterEmployee && filterEmployee !== 'All' && filterEmployee !== '') {
      filters.push(`employee_name=eq.${encodeURIComponent(filterEmployee)}`)
    }
    if (filterEvaluator && filterEvaluator !== 'All' && filterEvaluator !== '') {
      filters.push(`evaluator_name=eq.${encodeURIComponent(filterEvaluator)}`)
    }
    if (
      filterApproval &&
      filterApproval !== 'All' &&
      ['draft', 'pending', 'approved', 'rejected'].includes(filterApproval)
    ) {
      filters.push(`approval_status=eq.${encodeURIComponent(filterApproval)}`)
    }

    const filterStr = filters.length ? filters.join('&') : undefined
    const raw = (await supabaseSelectFilter(
      'employee_warning_letter_registry',
      filterStr || 'id=not.is.null',
      {
        order: 'incident_date.desc.nullslast,created_at.desc',
        select:
          'id,store_name,employee_name,incident_date,incident_type,details,warning_letter_url,evaluator_name,approval_status,approved_by,approved_at,rejected_reason,created_by,created_at,updated_at',
        limit: pageCap,
      }
    )) as WarningLetterRegistryApiRow[]

    const rows = (raw || []).filter((r) => {
      const storeName = String(r.store_name || '').trim()
      if (!storeName) return false
      return canViewEvaluationForStore(auth, storeName)
    })

    const summary = {
      draft: rows.filter((r) => r.approval_status === 'draft').length,
      pending: rows.filter((r) => r.approval_status === 'pending').length,
      approved: rows.filter((r) => r.approval_status === 'approved').length,
      rejected: rows.filter((r) => r.approval_status === 'rejected').length,
    }

    return NextResponse.json({ items: rows, summary, truncated: (raw || []).length >= pageCap, pageCap }, { headers })
  } catch (e) {
    console.error('getWarningLetterRegistry:', e)
    return NextResponse.json(
      { error: '조회 실패', items: [], summary: { draft: 0, pending: 0, approved: 0, rejected: 0 } },
      { status: 500, headers }
    )
  }
}
