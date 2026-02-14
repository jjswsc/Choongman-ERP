import { NextResponse } from 'next/server'
import {
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdateByFilter,
  supabaseUpdate,
} from '@/lib/supabase-server'

/** 평가 결과 저장 (신규 또는 수정) */
export async function POST(req: Request) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
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

    const typeVal = type === 'service' ? 'service' : 'kitchen'
    const storeTrim = String(store || '').trim()
    const empTrim = String(employeeName || '').trim()
    const evalTrim = String(evaluator || '').trim()
    const gradeTrim = String(finalGrade || '').trim()
    const memoTrim = String(memo || '').trim()
    const jsonStr = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData || {})

    if (id && String(id).trim()) {
      const existing = (await supabaseSelectFilter(
        'evaluation_results',
        `id=eq.${encodeURIComponent(String(id))}`,
        { limit: 1 }
      )) as { id?: string }[] | null

      if (existing && existing.length > 0) {
        await supabaseUpdateByFilter('evaluation_results', `id=eq.${encodeURIComponent(String(id))}`, {
          eval_date: dateStr,
          store_name: storeTrim,
          employee_name: empTrim,
          evaluator: evalTrim,
          final_grade: gradeTrim,
          memo: memoTrim,
          json_data: jsonStr,
        })
        await updateEmployeeGrade(storeTrim, empTrim, gradeTrim)
        return NextResponse.json('UPDATED', { headers })
      }
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
    await updateEmployeeGrade(storeTrim, empTrim, gradeTrim)
    return NextResponse.json('SAVED', { headers })
  } catch (e) {
    console.error('saveEvaluationResult:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}

async function updateEmployeeGrade(store: string, employeeName: string, finalGrade: string) {
  try {
    const rows = (await supabaseSelectFilter(
      'employees',
      `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(employeeName)}`,
      { limit: 1 }
    )) as { id?: number }[] | null
    if (rows && rows.length > 0 && rows[0].id != null) {
      await supabaseUpdate('employees', rows[0].id, { grade: finalGrade })
    }
  } catch {
    // ignore
  }
}
