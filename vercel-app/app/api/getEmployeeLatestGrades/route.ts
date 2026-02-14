import { NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

function normalizeNameForGradeMatch(name: string) {
  if (!name || typeof name !== 'string') return ''
  const s = String(name).trim().replace(/\s+/g, ' ')
  return s.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '').trim() || s
}

/** 직원별 최신 평가 등급 (evaluation_results에서 store+name 기준) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const out: Record<string, { grade: string; date?: Date }> = {}

    for (const type of ['kitchen', 'service']) {
      const rows = (await supabaseSelectFilter(
        'evaluation_results',
        `eval_type=eq.${encodeURIComponent(type)}`,
        { order: 'eval_date.desc', limit: 2000 }
      )) as { store_name?: string; employee_name?: string; final_grade?: string; eval_date?: string }[] | null

      for (const row of rows || []) {
        const store = String(row.store_name || '').trim().replace(/\s+/g, ' ')
        const name = String(row.employee_name || '').trim().replace(/\s+/g, ' ')
        const grade = row.final_grade ? String(row.final_grade).trim() : ''
        const dateVal = row.eval_date ? new Date(row.eval_date) : null
        if (!store || !name) continue
        const key = store + '|' + name
        const existing = out[key]
        if (!existing || (dateVal && (!existing.date || dateVal > existing.date))) {
          out[key] = { grade, date: dateVal || undefined }
        }
        const nameNorm = normalizeNameForGradeMatch(name)
        if (nameNorm && nameNorm !== name) {
          const keyNorm = store + '|' + nameNorm
          if (!out[keyNorm] || (dateVal && (!out[keyNorm].date || dateVal > (out[keyNorm].date || new Date(0))))) {
            out[keyNorm] = { grade, date: dateVal || undefined }
          }
        }
      }
    }

    const empList = (await supabaseSelect('employees', { order: 'id.asc' })) as {
      store?: string
      name?: string
      nick?: string
    }[] | null
    for (const e of empList || []) {
      const empStore = String(e.store || '').trim().replace(/\s+/g, ' ')
      const empName = String(e.name || '').trim().replace(/\s+/g, ' ')
      const empNick = String(e.nick || '').trim().replace(/\s+/g, ' ')
      if (!empStore || !empName) continue
      const keyName = empStore + '|' + empName
      const keyNick = empNick && empNick !== empName ? empStore + '|' + empNick : ''
      const info = out[keyName] || out[empStore + '|' + normalizeNameForGradeMatch(empName)]
      if (info && keyNick && !out[keyNick]) out[keyNick] = { grade: info.grade }
      if (info && !out[keyName]) out[keyName] = { grade: info.grade }
    }

    const result: Record<string, { grade: string }> = {}
    for (const [k, v] of Object.entries(out)) {
      result[k] = { grade: v.grade }
    }
    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getEmployeeLatestGrades:', e)
    return NextResponse.json({}, { headers })
  }
}
