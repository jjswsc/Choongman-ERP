import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate, supabaseDeleteByFilter } from '@/lib/supabase-server'
import { attendanceStoreNamePostgrestVariantsFilter } from '@/lib/attendance-utils'
import { requireAuth } from '@/lib/verify-auth'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      authResult.errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const tenantScope = await resolveSaasTenantScope({ auth })
    const tenantWriteErr = assertSaasTenantWritable(tenantScope, {
      tableHint: 'leave_requests',
      label: '휴가 승인',
    })
    if (tenantWriteErr) {
      return NextResponse.json({ success: false, message: tenantWriteErr }, { status: 403, headers })
    }
    const body = await request.json()
    const id = body?.id != null ? Number(body.id) : NaN
    const decision = String(body?.decision || '').trim()
    const userStore = String(auth.store || '').trim()
    const userRole = String(auth.role || '').toLowerCase()
    const allowedStores =
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(userStore)

    if (!id || isNaN(id)) {
      return NextResponse.json(
        { success: false, message: '잘못된 요청입니다.' },
        { headers }
      )
    }

    if (decision !== '승인' && decision !== 'Approved' && decision !== '반려' && decision !== 'Rejected' && decision !== '삭제') {
      return NextResponse.json(
        { success: false, message: '승인, 반려 또는 삭제를 선택해 주세요.' },
        { headers }
      )
    }

    const leaveSelectFilter = appendSaasTenantFilter(`id=eq.${id}`, tenantScope, 'leave_requests')
    let rows: {
      id: number
      store?: string
      type?: string
      name?: string
      leave_date?: string
      employee_id?: number | null
    }[] = []
    try {
      rows = (await supabaseSelectFilter('leave_requests', leaveSelectFilter, {
        limit: 1,
        select: 'id,store,type,name,leave_date,employee_id',
      })) as typeof rows
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('leave_requests')
        rows = (await supabaseSelectFilter('leave_requests', `id=eq.${id}`, {
          limit: 1,
          select: 'id,store,type,name,leave_date,employee_id',
        })) as typeof rows
      } else {
        throw e
      }
    }
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: '해당 휴가 신청을 찾을 수 없습니다.' },
        { headers }
      )
    }

    const targetStore = String(rows[0].store || '').trim()
    const isManagerLike = userRole.includes('manager') || userRole.includes('franchisee')
    if (isManagerLike && targetStore) {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, targetStore))
      if (!allowed) {
        return NextResponse.json(
          { success: false, message: '해당 매장의 휴가만 승인할 수 있습니다.' },
          { headers }
        )
      }
    } else if (isManagerLike && userStore && !storesMatchForGradeLookup(userStore, targetStore)) {
      return NextResponse.json(
        { success: false, message: '해당 매장의 휴가만 승인할 수 있습니다.' },
        { headers }
      )
    }

    if (decision === '삭제') {
      await supabaseDeleteByFilter(
        'leave_requests',
        appendSaasTenantFilter(`id=eq.${id}`, tenantScope, 'leave_requests')
      )
      return NextResponse.json(
        { success: true, message: '삭제되었습니다.' },
        { headers }
      )
    }

    const isReject = decision === '반려' || decision === 'Rejected'
    const rejectReason = body?.rejectReason != null ? String(body.rejectReason).trim() : ''

    if (isReject && !rejectReason) {
      return NextResponse.json(
        { success: false, message: '반려 사유를 입력해 주세요.' },
        { headers }
      )
    }

    const status = decision === '승인' || decision === 'Approved' ? '승인' : '반려'

    const updatePayload: Record<string, unknown> = { status }
    if (isReject) updatePayload.reject_reason = rejectReason
    await supabaseUpdate('leave_requests', id, updatePayload)

    if (status === '승인') {
      const leave = rows[0] || {}
      const leaveDate = String(leave.leave_date || '').trim().slice(0, 10)
      const leaveStore = String(leave.store || '').trim()
      const leaveName = String(leave.name || '').trim()
      const leaveEmployeeId =
        leave.employee_id != null && Number.isFinite(Number(leave.employee_id))
          ? Math.floor(Number(leave.employee_id))
          : 0
      if (leaveDate && leaveStore) {
        const storeFilter = attendanceStoreNamePostgrestVariantsFilter(leaveStore)
        const dateFilter = `schedule_date=eq.${leaveDate}`
        let deleted = false
        if (leaveEmployeeId > 0) {
          const byEmpFilter = appendSaasTenantFilter(
            `${dateFilter}&${storeFilter}&employee_id=eq.${leaveEmployeeId}`,
            tenantScope,
            'schedules'
          )
          try {
            await supabaseDeleteByFilter('schedules', byEmpFilter)
            deleted = true
          } catch (e) {
            const em = e instanceof Error ? e.message : String(e)
            if (isMissingSaasTenantColumnError(e)) {
              markSaasTenantColumnMissing('schedules')
            } else if (!/employee_id|42703|column/i.test(em)) {
              throw e
            }
          }
        }
        if (!deleted && leaveName) {
          const byNameFilter = appendSaasTenantFilter(
            `${dateFilter}&${storeFilter}&name=ilike.${encodeURIComponent(leaveName)}`,
            tenantScope,
            'schedules'
          )
          await supabaseDeleteByFilter('schedules', byNameFilter)
        }
      }
    }

    return NextResponse.json(
      { success: true, message: '처리되었습니다.' },
      { headers }
    )
  } catch (e) {
    console.error('processLeaveApproval:', e)
    return NextResponse.json(
      { success: false, message: '처리 실패: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
