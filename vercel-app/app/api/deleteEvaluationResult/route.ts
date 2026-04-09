import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelectFilter,
  supabaseDeleteByFilter,
  supabaseUpdate,
} from '@/lib/supabase-server'

import {
  isAccountingRole,
  isFranchiseeRole,
  isManagerRole,
  isOfficeRole,
} from '@/lib/permissions'
import { userCanAccessEmployeeStore } from '@/lib/admin-employee-store-access'
import { getVerifiedAuth } from '@/lib/verify-auth'
import type { JwtPayload } from '@/lib/jwt-auth'
import { normalizeEmployeeNameForGradeMatch } from '@/lib/employee-display-name'
import { EVAL_RESULTS_ORDER } from '@/lib/evaluation-postgrest-filters'

function roleMaySaveEvaluation(auth: JwtPayload): boolean {
  return (
    isOfficeRole(auth.role) ||
    isAccountingRole(auth.role) ||
    isManagerRole(auth.role) ||
    isFranchiseeRole(auth.role)
  )
}

function canModifyEvaluationForStore(auth: JwtPayload, targetStore: string): boolean {
  if (!roleMaySaveEvaluation(auth)) return false
  const jwtRole = String(auth.role || '')
  const jwtStore = String(auth.store || '')
  return userCanAccessEmployeeStore(jwtRole, jwtStore, targetStore, { allowedStores: auth.allowedStores })
}

/** 삭제 후 남은 평가 기준으로 employees.grade 동기화(없으면 비움) — saveEvaluationResult/updateEmployeeGrade 와 동일 패턴 */
async function refreshEmployeeGradeAfterEvalDelete(store: string, employeeName: string) {
  const raw = String(employeeName || '').trim()
  if (!raw) return
  const candidates = [...new Set([raw, normalizeEmployeeNameForGradeMatch(raw)].filter(Boolean))]
  let latestGrade = ''
  for (const name of candidates) {
    const encName = encodeURIComponent(name)
    const encStore = encodeURIComponent(store)
    try {
      const rows = (await supabaseSelectFilter(
        'evaluation_results',
        `store_name=eq.${encStore}&employee_name=eq.${encName}`,
        {
          limit: 1,
          order: EVAL_RESULTS_ORDER,
          select: 'final_grade,eval_date,id',
        }
      )) as { final_grade?: string }[] | null
      const g = rows && rows[0] && String(rows[0].final_grade || '').trim()
      if (g) {
        latestGrade = g
        break
      }
    } catch {
      // try next
    }
  }
  const encStore = encodeURIComponent(store)
  for (const name of candidates) {
    const encName = encodeURIComponent(name)
    for (const field of ['name', 'nick'] as const) {
      try {
        const rows = (await supabaseSelectFilter(
          'employees',
          `store=eq.${encStore}&${field}=eq.${encName}`,
          { limit: 1 }
        )) as { id?: number }[] | null
        if (rows && rows.length > 0 && rows[0].id != null) {
          await supabaseUpdate('employees', rows[0].id, { grade: latestGrade || '' })
          return
        }
      } catch {
        // try next
      }
    }
  }
}

/** 평가 결과 1건 삭제 — JWT·매장 권한은 saveEvaluationResult 와 동일 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(req)
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다. 다시 로그인해 주세요.' }, { status: 401, headers })
    }

    const body = await req.json()
    const id = String(body?.id || '').trim()
    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400, headers })
    }

    const existing = (await supabaseSelectFilter(
      'evaluation_results',
      `id=eq.${encodeURIComponent(id)}`,
      { limit: 1, select: 'id,store_name,employee_name' }
    )) as { id?: string; store_name?: string; employee_name?: string }[] | null

    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: '해당 평가를 찾을 수 없습니다.' }, { status: 404, headers })
    }

    const storeTrim = String(existing[0].store_name || '').trim()
    const empTrim = String(existing[0].employee_name || '').trim()
    if (!storeTrim) {
      return NextResponse.json({ error: '매장 정보가 없습니다.' }, { status: 400, headers })
    }

    if (!canModifyEvaluationForStore(auth, storeTrim)) {
      return NextResponse.json({ error: '해당 평가를 삭제할 권한이 없습니다.' }, { status: 403, headers })
    }

    await supabaseDeleteByFilter('evaluation_results', `id=eq.${encodeURIComponent(id)}`)
    if (empTrim) {
      await refreshEmployeeGradeAfterEvalDelete(storeTrim, empTrim)
    }

    return NextResponse.json({ ok: true }, { headers })
  } catch (e) {
    console.error('deleteEvaluationResult:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
