import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
} from '@/lib/supabase-server'

function toDateStr(v: string | Date | null): string {
  if (!v) return ''
  return typeof v === 'string' ? v.slice(0, 10) : String(v).slice(0, 10)
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const startStr = searchParams.get('startStr') || searchParams.get('start') || ''
    const endStr = searchParams.get('endStr') || searchParams.get('end') || ''
    const dept = searchParams.get('dept') || ''

    const filter =
      `log_date=gte.${encodeURIComponent(startStr)}&log_date=lte.${encodeURIComponent(endStr)}`
    const fullFilter = dept && dept !== 'all'
      ? filter + `&dept=eq.${encodeURIComponent(dept)}`
      : filter

    const rows =
      (await supabaseSelectFilter('work_logs', fullFilter, {
        order: 'log_date.asc',
      })) || []

    const empList = ((await supabaseSelect('employees', {
      order: 'id.asc',
    })) || []) as { name?: string; nick?: string; job?: string }[]

    const nameToRole: Record<string, string> = {}
    for (const e of empList) {
      const n = e.nick && String(e.nick).trim() ? e.nick : e.name || ''
      if (n) nameToRole[n] = e.job || ''
    }

    const byEmployee: Record<
      string,
      { total: number; completed: number; carried: number; inProgress: number; progressSum: number; count: number }
    > = {}

    for (const r of rows as {
      name: string
      dept?: string
      content?: string
      progress?: number
      status?: string
    }[]) {
      const name = r.name || ''
      if (!name) continue
      if (!byEmployee[name]) {
        byEmployee[name] = {
          total: 0,
          completed: 0,
          carried: 0,
          inProgress: 0,
          progressSum: 0,
          count: 0,
        }
      }
      const p = byEmployee[name]
      p.total++
      p.progressSum += Number(r.progress) || 0
      p.count++
      const st = String(r.status || '')
      if (st === 'Finish' || (Number(r.progress) || 0) >= 100) p.completed++
      else if (st === 'Continue' || st === 'Carry Over') p.carried++
      else p.inProgress++
    }

    const summaries = Object.entries(byEmployee).map(([employee, p]) => ({
      employee,
      role: nameToRole[employee] || '',
      totalTasks: p.total,
      completed: p.completed,
      carried: p.carried,
      inProgress: p.inProgress,
      avgProgress:
        p.count > 0 ? Math.round(p.progressSum / p.count) : 0,
    }))

    const totalTasks = summaries.reduce((a, s) => a + s.totalTasks, 0)
    const totalCompleted = summaries.reduce((a, s) => a + s.completed, 0)
    const totalCarried = summaries.reduce((a, s) => a + s.carried, 0)
    const overallAvg =
      summaries.length > 0
        ? Math.round(
            summaries.reduce((a, s) => a + s.avgProgress, 0) / summaries.length
          )
        : 0

    return NextResponse.json(
      {
        summaries,
        totalTasks,
        totalCompleted,
        totalCarried,
        overallAvg,
      },
      { headers }
    )
  } catch (e) {
    console.error('getWorkLogWeekly:', e)
    return NextResponse.json(
      {
        summaries: [],
        totalTasks: 0,
        totalCompleted: 0,
        totalCarried: 0,
        overallAvg: 0,
      },
      { headers }
    )
  }
}
