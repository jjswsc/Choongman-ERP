import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc } from '@/lib/supabase-server'
import { resolveWorkLogEmployeeById } from '@/lib/work-log-name-server'

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const startStr = searchParams.get('startStr') || ''
    const endStr = searchParams.get('endStr') || ''
    const employeeIdRaw = searchParams.get('employeeId') || searchParams.get('employee') || ''
    const store = searchParams.get('store') || ''

    const employeeId = Math.floor(Number(employeeIdRaw))
    const emp =
      employeeIdRaw && employeeIdRaw !== 'all' && Number.isFinite(employeeId) && employeeId > 0
        ? await resolveWorkLogEmployeeById(employeeId)
        : null

    try {
      const payload = await supabaseRpc<Record<string, unknown>>('get_work_log_employee_insights', {
        p_start: startStr,
        p_end: endStr,
        p_employee_id: emp?.id ?? null,
        p_employee_name: emp?.name ?? null,
        p_store: store && store !== 'all' ? store : null,
      })
      if (payload && typeof payload === 'object') {
        return NextResponse.json(payload, { headers })
      }
    } catch {
      /* RPC 미배포 */
    }

    return NextResponse.json(
      { employeeName: emp?.name || '', employeeStore: emp?.store || '', work: [], attendance: [], evaluations: [] },
      { headers }
    )
  } catch (e) {
    console.error('getWorkLogEmployeeInsights:', e)
    return NextResponse.json(
      { employeeName: '', employeeStore: '', work: [], attendance: [], evaluations: [] },
      { headers }
    )
  }
}
