import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelectPageCap } from '@/lib/supabase-server'
import {
  EVAL_RESULTS_ORDER,
  normalizeHistoryEvalType,
  postgrestEvalTypeInFilter,
  postgrestStoreNameIlikeOrFilter,
} from '@/lib/evaluation-postgrest-filters'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  canViewEvaluationForStore,
  roleMayViewEvaluation,
} from '@/lib/warning-letter-evaluation-access'

interface WarningLetterIncidentItem {
  source: 'evaluation'
  evaluationId: string
  evalDate: string
  evalType: 'kitchen' | 'service' | 'manager'
  store: string
  employeeName: string
  evaluator: string
  finalGrade: string
  incidentIndex: number
  incidentType: string
  incidentDate: string
  details: string
  warningLetterChecked: boolean
  warningLetterUrl: string
}

function incidentHasContent(inc: Record<string, unknown>): boolean {
  const type = String(inc?.type || '').trim()
  const details = String(inc?.details || '').trim()
  const url = String(inc?.warningLetterUrl || '').trim()
  const checked = Boolean(inc?.warningLetterChecked)
  return Boolean(type || details || url || checked)
}

function incidentMatchesFilter(
  inc: Record<string, unknown>,
  warningsOnly: boolean
): boolean {
  if (!incidentHasContent(inc)) return false
  if (!warningsOnly) return true
  const url = String(inc?.warningLetterUrl || '').trim()
  const checked = Boolean(inc?.warningLetterChecked)
  return checked || Boolean(url)
}

/** 평가 JSON의 사건·경고 행을 펼친 목록 — JWT·매장 접근과 동일 규칙 */
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
    const type = (searchParams.get('type') || 'all').trim()
    const startStr = (searchParams.get('start') || '').trim().slice(0, 10)
    const endStr = (searchParams.get('end') || '').trim().slice(0, 10)
    const filterStore = (searchParams.get('store') || 'All').trim()
    const filterEmployee = (searchParams.get('employee') || 'All').trim()
    const filterEvaluator = (searchParams.get('evaluator') || 'All').trim()
    const warningsOnly = searchParams.get('warningsOnly') !== '0' && searchParams.get('warningsOnly') !== 'false'

    const pageCap = supabaseSelectPageCap()

    async function getRowsForType(typeVal: string): Promise<
      {
        id?: string
        eval_date?: string
        store_name?: string
        employee_name?: string
        evaluator?: string
        final_grade?: string
        json_data?: string | Record<string, unknown>
        eval_type?: string
      }[]
    > {
      const filters: string[] = [postgrestEvalTypeInFilter(normalizeHistoryEvalType(typeVal))]
      if (startStr) filters.push(`eval_date=gte.${startStr}`)
      if (endStr) filters.push(`eval_date=lte.${endStr}`)
      if (filterStore && filterStore !== 'All') {
        const sf = postgrestStoreNameIlikeOrFilter(filterStore)
        if (sf) filters.push(sf)
      }
      if (filterEmployee && filterEmployee !== 'All' && filterEmployee !== '') {
        filters.push(`employee_name=eq.${encodeURIComponent(filterEmployee)}`)
      }
      if (filterEvaluator && filterEvaluator !== 'All' && filterEvaluator !== '') {
        filters.push(`evaluator=eq.${encodeURIComponent(filterEvaluator)}`)
      }

      const rows = (await supabaseSelectFilter(
        'evaluation_results',
        filters.join('&'),
        {
          order: EVAL_RESULTS_ORDER,
          select: 'id,eval_date,store_name,employee_name,evaluator,final_grade,json_data,eval_type',
          limit: pageCap,
        }
      )) as {
        id?: string
        eval_date?: string
        store_name?: string
        employee_name?: string
        evaluator?: string
        final_grade?: string
        json_data?: string | Record<string, unknown>
        eval_type?: string
      }[]

      return rows || []
    }

    let rawRows: {
      id?: string
      eval_date?: string
      store_name?: string
      employee_name?: string
      evaluator?: string
      final_grade?: string
      json_data?: string | Record<string, unknown>
      eval_type?: string
    }[]

    let truncated = false
    if (type === 'all' || type === 'All' || type === '') {
      const settled = await Promise.allSettled([
        getRowsForType('kitchen'),
        getRowsForType('service'),
        getRowsForType('manager'),
      ])
      rawRows = []
      for (const r of settled) {
        if (r.status === 'fulfilled') rawRows.push(...r.value)
        else console.error('getWarningLettersFromEvaluations branch failed:', r.reason)
      }
      truncated = settled.some(
        (r) => r.status === 'fulfilled' && r.value.length >= pageCap
      )
      const seen = new Set<string>()
      rawRows = rawRows.filter((row) => {
        const id = String(row.id || '')
        if (!id || seen.has(id)) return false
        seen.add(id)
        return true
      })
      rawRows.sort(
        (a, b) =>
          new Date(String(b.eval_date || '').slice(0, 10)).getTime() -
          new Date(String(a.eval_date || '').slice(0, 10)).getTime()
      )
    } else {
      rawRows = await getRowsForType(normalizeHistoryEvalType(type))
      truncated = rawRows.length >= pageCap
    }

    const out: WarningLetterIncidentItem[] = []

    for (const row of rawRows) {
      const storeName = String(row.store_name || '').trim()
      if (storeName && !canViewEvaluationForStore(auth, storeName)) {
        continue
      }

      let parsed: Record<string, unknown> | null = null
      if (row.json_data) {
        try {
          parsed =
            typeof row.json_data === 'string'
              ? (JSON.parse(row.json_data) as Record<string, unknown>)
              : (row.json_data as Record<string, unknown>)
        } catch {
          parsed = null
        }
      }
      const incidents = parsed?.incidents
      if (!Array.isArray(incidents)) continue

      const evalTypeNorm = normalizeHistoryEvalType(String(row.eval_type || 'kitchen'))

      for (let incidentIndex = 0; incidentIndex < incidents.length; incidentIndex++) {
        const inc = incidents[incidentIndex]
        if (!inc || typeof inc !== 'object') continue
        const rec = inc as Record<string, unknown>
        if (!incidentMatchesFilter(rec, warningsOnly)) continue

        out.push({
          source: 'evaluation',
          evaluationId: String(row.id || ''),
          evalDate: String(row.eval_date || '').slice(0, 10),
          evalType: evalTypeNorm,
          store: storeName,
          employeeName: String(row.employee_name || '').trim(),
          evaluator: String(row.evaluator || '').trim(),
          finalGrade: String(row.final_grade || '').trim(),
          incidentIndex,
          incidentType: String(rec.type || '').trim(),
          incidentDate: String(rec.date || '').trim().slice(0, 10),
          details: String(rec.details || '').trim(),
          warningLetterChecked: Boolean(rec.warningLetterChecked),
          warningLetterUrl: String(rec.warningLetterUrl || '').trim(),
        })
      }
    }

    out.sort(
      (a, b) =>
        new Date(b.evalDate || '').getTime() - new Date(a.evalDate || '').getTime() ||
        b.evaluationId.localeCompare(a.evaluationId)
    )

    return NextResponse.json({ items: out, truncated, pageCap }, { headers })
  } catch (e) {
    console.error('getWarningLettersFromEvaluations:', e)
    return NextResponse.json(
      { error: '조회 실패', items: [], truncated: false },
      { status: 500, headers }
    )
  }
}
