import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import {
  buildWorkLogFilterOptions,
  isOfficeStaffStore,
  loadEmployedEmployeesForWorkLog,
} from '@/lib/work-log-store-scope'

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const scope = searchParams.get('scope') || 'all'

    const employed = await loadEmployedEmployeesForWorkLog()
    const useList =
      scope === 'office'
        ? employed.filter((e) => isOfficeStaffStore(e.store || ''))
        : employed

    const { stores, depts: jobDepts, staff } = buildWorkLogFilterOptions(useList)

    const deptSet = new Set(jobDepts)
    try {
      const logRows =
        (await supabaseSelect('work_logs', { select: 'dept', limit: 5000 })) as { dept?: string }[]
      for (const r of logRows) {
        const d = String(r.dept || '').trim()
        if (d) deptSet.add(d)
      }
    } catch {
      /* ignore */
    }

    return NextResponse.json(
      {
        staff: staff.map((s) => ({
          id: s.id,
          name: s.name,
          displayName: s.displayName,
          store: s.store,
          job: s.job,
        })),
        depts: Array.from(deptSet).sort(),
        stores,
      },
      { headers }
    )
  } catch (e) {
    console.error('getWorkLogOfficeOptions:', e)
    return NextResponse.json({ staff: [], depts: [], stores: [] }, { headers })
  }
}
