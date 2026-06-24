import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { loadEmployedEmployeesForWorkLog } from '@/lib/work-log-store-scope'
import { notifyWorkLogMissingDaily } from '@/lib/work-log-notifications'
import { workLogStoredNameFromEmployeeMaster } from '@/lib/work-log-name'
import { cronAuthErrorResponse, isCronAuthorized } from '@/lib/verify-cron-auth'

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const cronDenied = cronAuthErrorResponse(req, headers)
  if (cronDenied) return cronDenied
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, message: 'unauthorized' }, { status: 401, headers })
  }

  try {
    const today = getBangkokTodayDateString()
    const employees = await loadEmployedEmployeesForWorkLog()
    const loggedEmployeeIds = new Set<number>()
    const loggedNames = new Set<string>()

    const todayRows =
      (await supabaseSelectFilter('work_logs', `log_date=eq.${encodeURIComponent(today)}`, {
        select: 'employee_id,name',
        limit: 10000,
      })) || []

    for (const r of todayRows as { employee_id?: number; name?: string }[]) {
      const eid = r.employee_id != null ? Math.floor(Number(r.employee_id)) : 0
      if (Number.isFinite(eid) && eid > 0) loggedEmployeeIds.add(eid)
      const n = String(r.name || '').trim()
      if (n) loggedNames.add(n)
    }

    let reminded = 0
    for (const e of employees) {
      const id = e.id != null ? Math.floor(Number(e.id)) : 0
      const name = workLogStoredNameFromEmployeeMaster(e.name)
      const store = String(e.store || '').trim()
      if (!store || !name) continue
      const hasLog =
        (id > 0 && loggedEmployeeIds.has(id)) || loggedNames.has(name)
      if (hasLog) continue

      await notifyWorkLogMissingDaily({
        employeeStore: store,
        employeeName: name,
        logDate: today,
        notifyManager: true,
      })
      reminded++
    }

    return NextResponse.json({ success: true, date: today, reminded }, { headers })
  } catch (e) {
    console.error('work-log-reminders cron:', e)
    return NextResponse.json({ success: false, message: (e as Error).message }, { status: 500, headers })
  }
}
