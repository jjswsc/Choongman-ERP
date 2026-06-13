import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc } from '@/lib/supabase-server'
import { resolveWorkLogEmployeeById } from '@/lib/work-log-name-server'

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const startStr = searchParams.get('startStr') || searchParams.get('start') || ''
    const endStr = searchParams.get('endStr') || searchParams.get('end') || ''
    const employeeIdRaw = searchParams.get('employeeId') || searchParams.get('employee_id') || ''
    const name = searchParams.get('name') || ''

    const employeeId = Math.floor(Number(employeeIdRaw))
    const emp = Number.isFinite(employeeId) && employeeId > 0 ? await resolveWorkLogEmployeeById(employeeId) : null
    const employeeName = emp?.name || name || null

    try {
      const rows = await supabaseRpc<
        {
          log_date: string
          total_tasks: number
          completed: number
          in_progress: number
          carried: number
          avg_progress: number
          has_close: boolean
        }[]
      >('get_work_log_period_summary', {
        p_start: startStr,
        p_end: endStr,
        p_employee_id: emp?.id ?? (Number.isFinite(employeeId) && employeeId > 0 ? employeeId : null),
        p_employee_name: employeeName,
      })

      if (Array.isArray(rows)) {
        return NextResponse.json(
          {
            days: rows.map((r) => ({
              date: String(r.log_date).slice(0, 10),
              totalTasks: Number(r.total_tasks) || 0,
              completed: Number(r.completed) || 0,
              inProgress: Number(r.in_progress) || 0,
              carried: Number(r.carried) || 0,
              avgProgress: Math.round(Number(r.avg_progress) || 0),
              hasActivity: Boolean(r.has_close),
            })),
          },
          { headers }
        )
      }
    } catch {
      /* RPC 미배포 */
    }

    return NextResponse.json({ days: [] }, { headers })
  } catch (e) {
    console.error('getWorkLogPeriodSummary:', e)
    return NextResponse.json({ days: [] }, { headers })
  }
}
