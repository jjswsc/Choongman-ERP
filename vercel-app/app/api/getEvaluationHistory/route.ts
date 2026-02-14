import { NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export interface EvaluationHistoryItem {
  id: string
  date: string
  store: string
  employeeName: string
  evaluator: string
  finalGrade: string
  totalScore: string
  memo: string
  jsonData?: string
}

/** 평가 이력 조회. type=all이면 주방+서비스 전체 */
export async function GET(req: Request) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const type = (searchParams.get('type') || 'kitchen').trim()
    const startStr = (searchParams.get('start') || '').trim().slice(0, 10)
    const endStr = (searchParams.get('end') || '').trim().slice(0, 10)
    const filterStore = (searchParams.get('store') || 'All').trim()
    const filterEmployee = (searchParams.get('employee') || 'All').trim()
    const filterEvaluator = (searchParams.get('evaluator') || 'All').trim()

    async function getOne(
      typeVal: string,
      start: string,
      end: string,
      store: string,
      employee: string,
      evaluator: string
    ): Promise<EvaluationHistoryItem[]> {
      const filters: string[] = [
        `eval_type=eq.${encodeURIComponent(typeVal)}`,
      ]
      if (start) filters.push(`eval_date=gte.${start}`)
      if (end) filters.push(`eval_date=lte.${end}`)
      if (store && store !== 'All')
        filters.push(
          `store_name=eq.${encodeURIComponent(store)}`
        )
      if (employee && employee !== 'All' && employee !== '')
        filters.push(
          `employee_name=eq.${encodeURIComponent(employee)}`
        )
      if (evaluator && evaluator !== 'All' && evaluator !== '')
        filters.push(`evaluator=eq.${encodeURIComponent(evaluator)}`)

      const rows = (await supabaseSelectFilter(
        'evaluation_results',
        filters.join('&'),
        { order: 'eval_date.desc', limit: 2000 }
      )) as {
        id?: string
        eval_date?: string
        store_name?: string
        employee_name?: string
        evaluator?: string
        final_grade?: string
        json_data?: string
        memo?: string
      }[]

      const list: EvaluationHistoryItem[] = []
      for (const row of rows || []) {
        let totalScore = ''
        if (row.json_data) {
          try {
            const parsed =
              typeof row.json_data === 'string'
                ? JSON.parse(row.json_data)
                : row.json_data
            if (parsed?.totalScore != null)
              totalScore = String(parsed.totalScore)
          } catch {
            //
          }
        }
        list.push({
          id: String(row.id || ''),
          date: String(row.eval_date || '').slice(0, 10),
          store: String(row.store_name || '').trim(),
          employeeName: String(row.employee_name || '').trim(),
          evaluator: String(row.evaluator || '').trim(),
          finalGrade: String(row.final_grade || ''),
          totalScore,
          memo: String(row.memo || ''),
          jsonData: row.json_data,
        })
      }
      list.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      return list
    }

    let list: EvaluationHistoryItem[]
    if (
      type === 'all' ||
      type === 'All' ||
      type === ''
    ) {
      const [kitchenList, serviceList] = await Promise.all([
        getOne(
          'kitchen',
          startStr,
          endStr,
          filterStore,
          filterEmployee,
          filterEvaluator
        ),
        getOne(
          'service',
          startStr,
          endStr,
          filterStore,
          filterEmployee,
          filterEvaluator
        ),
      ])
      list = [...kitchenList, ...serviceList]
      list.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
    } else {
      list = await getOne(
        type,
        startStr,
        endStr,
        filterStore,
        filterEmployee,
        filterEvaluator
      )
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getEvaluationHistory:', e)
    return NextResponse.json([], { status: 500, headers })
  }
}
