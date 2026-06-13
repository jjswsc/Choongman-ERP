import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { canReviewWorkLog } from '@/lib/permissions'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await tryVerifyBearerFromRequest(req)
    if (!auth || !canReviewWorkLog(auth.role || '')) {
      return NextResponse.json({ items: [], forbidden: true }, { status: 403, headers })
    }

    const { searchParams } = new URL(req.url)
    const startStr = searchParams.get('startStr') || ''
    const endStr = searchParams.get('endStr') || ''
    const employeeId = searchParams.get('employeeId') || ''
    const store = searchParams.get('store') || ''
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') || 100)))

    const filters: string[] = []
    if (startStr) filters.push(`changed_at=gte.${encodeURIComponent(startStr)}`)
    if (endStr) filters.push(`changed_at=lte.${encodeURIComponent(endStr + 'T23:59:59')}`)
    if (employeeId && employeeId !== 'all') {
      const eid = Math.floor(Number(employeeId))
      if (Number.isFinite(eid) && eid > 0) filters.push(`employee_id=eq.${eid}`)
    }
    if (store && store !== 'all') filters.push(`employee_store=eq.${encodeURIComponent(store)}`)

    const filterStr = filters.length > 0 ? filters.join('&') : 'id=gt.0'
    const rows =
      (await supabaseSelectFilter('work_logs_audit', filterStr, {
        order: 'changed_at.desc',
        limit,
      })) || []

    return NextResponse.json({ items: rows }, { headers })
  } catch (e) {
    console.error('getWorkLogAudit:', e)
    return NextResponse.json({ items: [] }, { headers })
  }
}
