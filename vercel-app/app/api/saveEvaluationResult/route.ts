import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdateByFilter,
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
import { normalizeEvalItemType } from '@/lib/eval-item-type'
import { normalizeEmployeeNameForGradeMatch } from '@/lib/employee-display-name'
import { EVAL_RESULTS_ORDER } from '@/lib/evaluation-postgrest-filters'

/** Staff 등 일반 권한은 제외 (userCanAccessEmployeeStore 단독 사용 시 매장 일치만으로 통과할 수 있음) */
function roleMaySaveEvaluation(auth: JwtPayload): boolean {
  return (
    isOfficeRole(auth.role) ||
    isAccountingRole(auth.role) ||
    isManagerRole(auth.role) ||
    isFranchiseeRole(auth.role)
  )
}

function canSaveEvaluationForStore(
  auth: JwtPayload,
  targetStore: string
): boolean {
  if (!roleMaySaveEvaluation(auth)) return false
  const jwtRole = String(auth.role || '')
  const jwtStore = String(auth.store || '')
  return userCanAccessEmployeeStore(jwtRole, jwtStore, targetStore, { allowedStores: auth.allowedStores })
}

/** 평가 결과 저장 (신규 또는 수정). JWT 기준 본사·회계 또는 해당 매장 매니저/가맹점주 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(req)
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다. 다시 로그인해 주세요.' }, { status: 401, headers })
    }

    const body = await req.json()
    const {
      type = 'kitchen',
      id = '',
      date,
      store,
      employeeName,
      evaluator,
      finalGrade,
      memo,
      jsonData,
    } = body

    const dateStr = date && typeof date === 'string' ? date.slice(0, 10) : ''
    if (!dateStr || dateStr.length < 10) {
      return NextResponse.json({ error: '날짜 형식 오류' }, { status: 400, headers })
    }

    const typeVal = normalizeEvalItemType(type)
    const storeTrim = String(store || '').trim()
    const empTrim = String(employeeName || '').trim()
    const evalTrim = String(evaluator || '').trim()
    const gradeTrim = String(finalGrade || '').trim()
    const memoTrim = String(memo || '').trim()
    const jsonStr = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData || {})

    if (!storeTrim) {
      return NextResponse.json({ error: '매장을 지정해 주세요.' }, { status: 400, headers })
    }

    if (id && String(id).trim()) {
      const existing = (await supabaseSelectFilter(
        'evaluation_results',
        `id=eq.${encodeURIComponent(String(id))}`,
        { limit: 1, select: 'id,store_name' }
      )) as { id?: string; store_name?: string }[] | null

      if (existing && existing.length > 0) {
        const prevStore = String(existing[0].store_name || '').trim()
        if (prevStore && !canSaveEvaluationForStore(auth, prevStore)) {
          return NextResponse.json({ error: '해당 평가를 수정할 권한이 없습니다.' }, { status: 403, headers })
        }
        if (!canSaveEvaluationForStore(auth, storeTrim)) {
          return NextResponse.json({ error: '해당 매장에 대한 권한이 없습니다.' }, { status: 403, headers })
        }
        await supabaseUpdateByFilter('evaluation_results', `id=eq.${encodeURIComponent(String(id))}`, {
          eval_date: dateStr,
          store_name: storeTrim,
          employee_name: empTrim,
          evaluator: evalTrim,
          final_grade: gradeTrim,
          memo: memoTrim,
          json_data: jsonStr,
        })
        await updateEmployeeGrade(storeTrim, empTrim)
        return NextResponse.json('UPDATED', { headers })
      }
    }

    if (!canSaveEvaluationForStore(auth, storeTrim)) {
      return NextResponse.json(
        { error: '직원 평가 등록은 본사·회계 또는 해당 매장 매니저/가맹점주만 가능합니다.' },
        { status: 403, headers }
      )
    }

    const newId =
      new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').replace(/\..*/, '') +
      '_' +
      storeTrim +
      '_' +
      empTrim.replace(/\s/g, '')

    await supabaseInsert('evaluation_results', {
      id: newId,
      eval_type: typeVal,
      eval_date: dateStr,
      store_name: storeTrim,
      employee_name: empTrim,
      evaluator: evalTrim,
      final_grade: gradeTrim,
      memo: memoTrim,
      json_data: jsonStr,
    })
    await updateEmployeeGrade(storeTrim, empTrim)
    return NextResponse.json('SAVED', { headers })
  } catch (e) {
    console.error('saveEvaluationResult:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}

async function updateEmployeeGrade(store: string, employeeName: string) {
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
  if (!latestGrade) return
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
          await supabaseUpdate('employees', rows[0].id, { grade: latestGrade })
          return
        }
      } catch {
        // try next
      }
    }
  }
}
