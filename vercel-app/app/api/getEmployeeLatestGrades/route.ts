import { NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import {
  formatEmployeeDisplayName,
  normalizeEmployeeNameFields,
  normalizeEmployeeNameForGradeMatch,
} from '@/lib/employee-display-name'
import { expandStoreVariantsForGrade } from '@/lib/grade-store-key-variants'
import { EVAL_RESULTS_ORDER, postgrestEvalTypeInFilter } from '@/lib/evaluation-postgrest-filters'

type GradeEntry = { grade: string; date?: Date }
type EvalType = 'kitchen' | 'service' | 'manager'
type GradeBucket = Partial<Record<EvalType | 'latestAny', GradeEntry>>

/** 평가 행 1건에 대해 직원 목록·평가 분석(buildEvaluatedEmployeeKeys)과 동일한 키 변형 */
function gradeLookupKeysForEvalRow(store: string, employeeName: string): string[] {
  const en = String(employeeName || '').trim().replace(/\s+/g, ' ')
  if (!en) return []
  const stripped = normalizeEmployeeNameForGradeMatch(en)
  const set = new Set<string>()
  for (const st of expandStoreVariantsForGrade(store)) {
    if (!st) continue
    set.add(`${st}|${en}`)
    if (stripped && stripped !== en) set.add(`${st}|${stripped}`)
    set.add(`${st.toLowerCase()}|${en.toLowerCase()}`)
    if (stripped) set.add(`${st.toLowerCase()}|${stripped.toLowerCase()}`)
    set.add(`${st}|${en.toLowerCase()}`)
    set.add(`${st.toLowerCase()}|${en}`)
    if (stripped) {
      set.add(`${st}|${stripped.toLowerCase()}`)
      set.add(`${st.toLowerCase()}|${stripped}`)
    }
  }
  return Array.from(set)
}

function mergeGrade(
  out: Record<string, GradeBucket>,
  store: string,
  name: string,
  evalType: EvalType,
  grade: string,
  dateVal: Date | null
) {
  const g = grade ? String(grade).trim() : ''
  if (!g) return
  for (const key of gradeLookupKeysForEvalRow(store, name)) {
    const bucket = out[key] || {}
    const existing = bucket[evalType]
    if (!existing || (dateVal && (!existing.date || dateVal > existing.date))) {
      bucket[evalType] = { grade: g, date: dateVal || undefined }
    }
    const latest = bucket.latestAny
    if (!latest || (dateVal && (!latest.date || dateVal > latest.date))) {
      bucket.latestAny = { grade: g, date: dateVal || undefined }
    }
    out[key] = bucket
  }
}

function pickLatestGrade(
  out: Record<string, GradeBucket>,
  keys: string[],
  evalType: EvalType | 'latestAny'
): GradeEntry | undefined {
  let best: GradeEntry | undefined
  let bestT = -Infinity
  for (const k of keys) {
    const hit = out[k]?.[evalType]
    if (!hit) continue
    const t = hit.date && !isNaN(hit.date.getTime()) ? hit.date.getTime() : 0
    if (t >= bestT) {
      bestT = t
      best = hit
    }
  }
  return best
}

/** 직원 마스터 행 → 등급 조회 후보 키 (직원 코드 작업 후 name/name_title 정규화·표시명·대소문자) */
function gradeLookupKeysForEmployee(
  empStore: string,
  bareName: string,
  displayName: string,
  nick: string
): string[] {
  const s = String(empStore || '').trim().replace(/\s+/g, ' ')
  const n = String(bareName || '').trim().replace(/\s+/g, ' ')
  const nk = String(nick || '').trim().replace(/\s+/g, ' ')
  const disp = String(displayName || '').trim().replace(/\s+/g, ' ')
  const keys = new Set<string>()
  const add = (storePart: string, namePart: string) => {
    const sp = storePart.trim().replace(/\s+/g, ' ')
    const np = namePart.trim().replace(/\s+/g, ' ')
    if (!sp || !np) return
    for (const k of gradeLookupKeysForEvalRow(sp, np)) keys.add(k)
  }
  if (n) {
    add(s, n)
    add(s, normalizeEmployeeNameForGradeMatch(n))
  }
  if (disp && disp !== n) add(s, disp)
  if (nk && nk !== n) {
    add(s, nk)
    add(s, normalizeEmployeeNameForGradeMatch(nk))
  }
  return Array.from(keys)
}

/** 직원별 최신 평가 등급 (evaluation_results에서 store+name 기준, 키 변형·전량 조회) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const out: Record<string, GradeBucket> = {}

    for (const type of ['kitchen', 'service', 'manager'] as const) {
      // eval_date.desc 전역 상위 N행만 가져오면, 다른 매장의 최신 평가에 밀려 오래된 행만 있는 매장이 통째로 빠질 수 있음 → 상한 넉넉히
      /** 타임아웃 방지: 유형당 최대 ~5페이지(8000×5) + 대소문 eval_type or 필터 */
      const rows = (await supabaseSelectFilterAllPages(
        'evaluation_results',
        postgrestEvalTypeInFilter(type),
        {
          order: EVAL_RESULTS_ORDER,
          select: 'store_name,employee_name,final_grade,eval_date',
          pageSize: 8000,
          maxRows: 40_000,
        }
      )) as { store_name?: string; employee_name?: string; final_grade?: string; eval_date?: string }[]

      for (const row of rows || []) {
        const store = String(row.store_name || '').trim().replace(/\s+/g, ' ')
        const name = String(row.employee_name || '').trim().replace(/\s+/g, ' ')
        const grade = row.final_grade ? String(row.final_grade).trim() : ''
        const dateVal = row.eval_date ? new Date(row.eval_date) : null
        if (!store || !name || !grade) continue
        mergeGrade(out, store, name, type, grade, dateVal && !isNaN(dateVal.getTime()) ? dateVal : null)
      }
    }

    type EmpRow = { store?: string; name?: string; name_title?: string | null; nick?: string }
    let empList: EmpRow[] = []
    try {
      empList = (await supabaseSelect('employees', {
        order: 'id.asc',
        select: 'store,name,name_title,nick',
        limit: 8000,
      })) as EmpRow[]
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (!/name_title|42703|column/i.test(em)) throw e
      empList = (await supabaseSelect('employees', {
        order: 'id.asc',
        select: 'store,name,nick',
        limit: 8000,
      })) as EmpRow[]
    }

    for (const e of empList || []) {
      const empStore = String(e.store || '').trim().replace(/\s+/g, ' ')
      const rawName = String(e.name || '').trim().replace(/\s+/g, ' ')
      const rawTitle = e.name_title != null ? String(e.name_title).trim() : ''
      const { name: bareName, nameTitle } = normalizeEmployeeNameFields(rawName, rawTitle)
      const empName = (bareName || rawName).trim()
      const empNick = String(e.nick || '').trim().replace(/\s+/g, ' ')
      if (!empStore || !empName) continue
      const display = formatEmployeeDisplayName(empName, nameTitle).trim().replace(/\s+/g, ' ')
      const candidateKeys = gradeLookupKeysForEmployee(empStore, empName, display, empNick)
      const kitchenInfo = pickLatestGrade(out, candidateKeys, 'kitchen')
      const serviceInfo = pickLatestGrade(out, candidateKeys, 'service')
      const managerInfo = pickLatestGrade(out, candidateKeys, 'manager')
      const latestAnyInfo = pickLatestGrade(out, candidateKeys, 'latestAny')
      if (!kitchenInfo && !serviceInfo && !managerInfo && !latestAnyInfo) continue
      const keyName = empStore + '|' + empName
      const keyNick = empNick && empNick !== empName ? empStore + '|' + empNick : ''
      const packed: GradeBucket = {}
      if (kitchenInfo) packed.kitchen = { grade: kitchenInfo.grade, date: kitchenInfo.date }
      if (serviceInfo) packed.service = { grade: serviceInfo.grade, date: serviceInfo.date }
      if (managerInfo) packed.manager = { grade: managerInfo.grade, date: managerInfo.date }
      if (latestAnyInfo) packed.latestAny = { grade: latestAnyInfo.grade, date: latestAnyInfo.date }
      if (Object.keys(packed).length === 0) continue
      out[keyName] = packed
      if (keyNick) {
        out[keyNick] = packed
      }
    }

    const result: Record<
      string,
      {
        grade: string
        kitchenGrade?: string
        serviceGrade?: string
        managerGrade?: string
        latestAny?: string
      }
    > = {}
    for (const [k, v] of Object.entries(out)) {
      const latest = v.latestAny?.grade || ''
      result[k] = {
        // 하위 호환: 기존 단일 grade 소비처
        grade: latest,
        latestAny: latest || undefined,
        kitchenGrade: v.kitchen?.grade || undefined,
        serviceGrade: v.service?.grade || undefined,
        managerGrade: v.manager?.grade || undefined,
      }
    }
    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getEmployeeLatestGrades:', e)
    return NextResponse.json({}, { headers })
  }
}
