import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  canViewEvaluationForStore,
  roleMayViewEvaluation,
} from '@/lib/warning-letter-evaluation-access'
import { normalizeHistoryEvalType, type EvalHistoryType } from '@/lib/evaluation-postgrest-filters'

/** 평가 1건 상세(수정 폼 불러오기). JWT·매장 접근은 경고서/평가 조회와 동일 */
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

    const id = String(new URL(req.url).searchParams.get('id') || '').trim()
    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400, headers })
    }

    const rows = (await supabaseSelectFilter(
      'evaluation_results',
      `id=eq.${encodeURIComponent(id)}`,
      {
        limit: 1,
        select: 'id,eval_date,store_name,employee_name,evaluator,final_grade,json_data,memo,eval_type',
      }
    )) as {
      id?: string
      eval_date?: string
      store_name?: string
      employee_name?: string
      evaluator?: string
      final_grade?: string
      json_data?: string | Record<string, unknown>
      memo?: string
      eval_type?: string
    }[] | null

    const row = rows?.[0]
    if (!row?.id) {
      return NextResponse.json({ error: '평가를 찾을 수 없습니다.' }, { status: 404, headers })
    }

    const storeName = String(row.store_name || '').trim()
    if (storeName && !canViewEvaluationForStore(auth, storeName)) {
      return NextResponse.json({ error: '해당 평가를 볼 권한이 없습니다.' }, { status: 403, headers })
    }

    let totalScore = ''
    if (row.json_data) {
      try {
        const parsed =
          typeof row.json_data === 'string'
            ? (JSON.parse(row.json_data) as Record<string, unknown>)
            : (row.json_data as Record<string, unknown>)
        if (parsed?.totalScore != null) {
          const n = Number(parsed.totalScore)
          totalScore = Number.isFinite(n) ? n.toFixed(2) : String(parsed.totalScore)
        }
      } catch {
        //
      }
    }

    const evalType: EvalHistoryType = normalizeHistoryEvalType(String(row.eval_type || 'kitchen'))

    return NextResponse.json(
      {
        id: String(row.id),
        date: String(row.eval_date || '').slice(0, 10),
        store: storeName,
        employeeName: String(row.employee_name || '').trim(),
        evaluator: String(row.evaluator || '').trim(),
        finalGrade: String(row.final_grade || ''),
        memo: String(row.memo || ''),
        totalScore,
        jsonData: row.json_data,
        evalType,
      },
      { headers }
    )
  } catch (e) {
    console.error('getEvaluationResultById:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
