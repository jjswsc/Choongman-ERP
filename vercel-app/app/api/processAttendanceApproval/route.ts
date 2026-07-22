import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsertMany, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import {
  clampNonNegativeMinutes,
  hasValidMinutesInput,
  resolveClockInApprovalLate,
  shouldRecordAdjustment,
} from '@/lib/attendance-adjustment-utils'
import { requireAuth } from '@/lib/verify-auth'
import { hasOfficeStaffScope } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  stampSaasTenantId,
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
      tableHint: 'attendance_logs',
      label: '근태 승인',
    })
    if (tenantWriteErr) {
      return NextResponse.json({ success: false, message: tenantWriteErr }, { status: 403, headers })
    }
    const body = await request.json()
    const id = body?.id != null ? Number(body.id) : NaN
    const decision = String(body?.decision || body?.status || '').trim()
    const userStore = String(auth.store || '').trim()
    const userRole = String(auth.role || '').toLowerCase()
    const allowedStores =
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(userStore)
    const isOfficeLevel = hasOfficeStaffScope(userRole, userStore)
    const optOtMinutes = body?.optOtMinutes != null ? Number(body.optOtMinutes) : null
    const optEarlyMinutes = body && 'optEarlyMinutes' in body ? Number(body.optEarlyMinutes) : undefined
    const optLateMinutes = body && 'optLateMinutes' in body && body.optLateMinutes != null ? Number(body.optLateMinutes) : null
    const waiveLate = body?.waiveLate === true
    const optionalInLogId = body?.optionalInLogId != null ? Number(body.optionalInLogId) : NaN

    if (!id || isNaN(id)) {
      return NextResponse.json(
        { success: false, message: '잘못된 요청입니다.' },
        { headers }
      )
    }

    const logFilter = appendSaasTenantFilter(`id=eq.${id}`, tenantScope, 'attendance_logs')
    let rows: {
      id: number
      store_name?: string
      log_type?: string
      late_min?: number
      early_min?: number
      ot_min?: number
    }[] = []
    try {
      rows = (await supabaseSelectFilter('attendance_logs', logFilter, {
        limit: 1,
        select: 'id,store_name,log_type,late_min,early_min,ot_min',
      })) as typeof rows
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('attendance_logs')
        rows = (await supabaseSelectFilter('attendance_logs', `id=eq.${id}`, {
          limit: 1,
          select: 'id,store_name,log_type,late_min,early_min,ot_min',
        })) as typeof rows
      } else {
        throw e
      }
    }
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: '해당 기록을 찾을 수 없습니다.' },
        { headers }
      )
    }

    const targetStore = String(rows[0].store_name || '').trim()
    const isScopedRole = !isOfficeLevel && (userRole.includes('manager') || userRole.includes('franchisee'))
    if (isScopedRole && targetStore) {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, targetStore))
      if (!allowed) {
        return NextResponse.json(
          { success: false, message: '해당 매장의 근태만 승인할 수 있습니다.' },
          { headers }
        )
      }
    }
    if (isScopedRole && !targetStore) {
      return NextResponse.json(
        { success: false, message: '해당 매장의 근태만 승인할 수 있습니다.' },
        { headers }
      )
    }

    const patch: Record<string, unknown> = { approved: decision }
    const isClockOut = String(rows[0]?.log_type || '').trim() === '퇴근'
    const isClockIn = String(rows[0]?.log_type || '').trim() === '출근'

    if (decision === '승인완료') {
      const hasValidOtInput = hasValidMinutesInput(optOtMinutes)
      const hasValidEarlyInput = hasValidMinutesInput(optEarlyMinutes)

      if (isClockIn) {
        const beforeLate = Number(rows[0]?.late_min) || 0
        const lateResolved = resolveClockInApprovalLate(beforeLate, { waiveLate, optLateMinutes })
        patch.late_min = lateResolved.afterLate
        patch.status = lateResolved.status
      } else {
        patch.status = '정상(승인)'
      }

      // ot_min: 퇴근 로그에만 적용 (조정 반영)
      if (isClockOut && hasValidOtInput) {
        patch.ot_min = clampNonNegativeMinutes(Number(optOtMinutes))
      }
      // 조퇴 분은 퇴근 로그에만 저장(출근 id로 호출 시 무시)
      if (isClockOut && hasValidEarlyInput) {
        patch.early_min = clampNonNegativeMinutes(Number(optEarlyMinutes))
      }
    } else if (decision === '반려') {
      patch.status = '반려'
    }

    // 연장/조퇴 조정 원인 파악용 임시 로그 (원인 확인 후 제거)
    if (decision === '승인완료' && (body?.optOtMinutes != null || body?.optEarlyMinutes != null)) {
      console.log('[processAttendanceApproval]', {
        id,
        bodyOptOt: body?.optOtMinutes,
        bodyOptEarly: body?.optEarlyMinutes,
        patchOt: patch.ot_min,
        patchEarly: patch.early_min,
      })
    }

    const adjustmentRows: Record<string, unknown>[] = []
    const beforeLateMain = Number(rows[0]?.late_min) || 0
    const beforeEarlyMain = Number(rows[0]?.early_min) || 0
    const beforeOtMain = Number(rows[0]?.ot_min) || 0
    const afterLateMain =
      patch.late_min != null && Number.isFinite(Number(patch.late_min))
        ? clampNonNegativeMinutes(Number(patch.late_min))
        : beforeLateMain
    const afterEarlyMain =
      patch.early_min != null && Number.isFinite(Number(patch.early_min))
        ? clampNonNegativeMinutes(Number(patch.early_min))
        : beforeEarlyMain
    const afterOtMain =
      patch.ot_min != null && Number.isFinite(Number(patch.ot_min))
        ? clampNonNegativeMinutes(Number(patch.ot_min))
        : beforeOtMain
    const makeAdjRow = (
      logId: number,
      logType: string,
      metric: 'late_min' | 'early_min' | 'ot_min',
      beforeV: number,
      afterV: number
    ) => ({
      attendance_log_id: logId,
      log_type: logType,
      metric,
      before_value: beforeV,
      after_value: afterV,
      reason: 'approval-adjust',
      changed_by_role: userRole || null,
      changed_by_store: userStore || null,
      source: 'processAttendanceApproval',
    })

    await supabaseUpdate('attendance_logs', id, patch)
    const requestedLateAdjustment =
      decision === '승인완료' &&
      isClockIn &&
      ((waiveLate && patch.late_min != null) ||
        hasValidMinutesInput(optLateMinutes))
    const requestedEarlyAdjustment =
      decision === '승인완료' &&
      isClockOut &&
      hasValidMinutesInput(optEarlyMinutes)
    const requestedOtAdjustment =
      decision === '승인완료' &&
      isClockOut &&
      hasValidMinutesInput(optOtMinutes)

    if (isClockIn && shouldRecordAdjustment(beforeLateMain, afterLateMain, requestedLateAdjustment)) {
      adjustmentRows.push(makeAdjRow(id, '출근', 'late_min', beforeLateMain, afterLateMain))
    }
    if (isClockOut && shouldRecordAdjustment(beforeEarlyMain, afterEarlyMain, requestedEarlyAdjustment)) {
      adjustmentRows.push(makeAdjRow(id, '퇴근', 'early_min', beforeEarlyMain, afterEarlyMain))
    }
    if (isClockOut && shouldRecordAdjustment(beforeOtMain, afterOtMain, requestedOtAdjustment)) {
      adjustmentRows.push(makeAdjRow(id, '퇴근', 'ot_min', beforeOtMain, afterOtMain))
    }

    // 퇴근 승인 시 출근 로그의 지각 분을 같은 요청으로 조정
    if (
      decision === '승인완료' &&
      isClockOut &&
      Number.isFinite(optionalInLogId) &&
      optionalInLogId > 0 &&
      ((waiveLate && isClockOut) || hasValidMinutesInput(optLateMinutes))
    ) {
      const inFilter = appendSaasTenantFilter(`id=eq.${optionalInLogId}`, tenantScope, 'attendance_logs')
      const inRows = (await supabaseSelectFilter('attendance_logs', inFilter, {
        limit: 1,
        select: 'id,store_name,log_type,late_min',
      })) as { id: number; store_name?: string; log_type?: string; late_min?: number }[]
      const inRow = inRows?.[0]
      if (inRow && String(inRow.log_type || '').trim() === '출근') {
        if (isScopedRole) {
          const inStore = String(inRow.store_name || '').trim()
          const inAllowed = allowedStores.some((s) => storesMatchForGradeLookup(s, inStore))
          if (!inAllowed) {
            return NextResponse.json(
              { success: false, message: '해당 매장의 근태만 승인할 수 있습니다.' },
              { headers }
            )
          }
        }
        const lm = waiveLate ? 0 : clampNonNegativeMinutes(Number(optLateMinutes))
        const beforeLateIn = Number(inRow.late_min) || 0
        await supabaseUpdate('attendance_logs', optionalInLogId, {
          late_min: lm,
          status: lm > 0 ? '지각(승인)' : '정상(승인)',
        })
        if (shouldRecordAdjustment(beforeLateIn, lm, waiveLate || hasValidMinutesInput(optLateMinutes))) {
          adjustmentRows.push(makeAdjRow(optionalInLogId, '출근', 'late_min', beforeLateIn, lm))
        }
      }
    }
    if (adjustmentRows.length > 0) {
      const stamped = adjustmentRows.map((r) =>
        stampSaasTenantId(r, tenantScope, 'attendance_log_adjustments')
      )
      try {
        await supabaseInsertMany('attendance_log_adjustments', stamped)
      } catch (e) {
        if (isMissingSaasTenantColumnError(e)) {
          markSaasTenantColumnMissing('attendance_log_adjustments')
          await supabaseInsertMany(
            'attendance_log_adjustments',
            stamped.map((r) => {
              const { tenant_id: _t, ...rest } = r
              return rest
            })
          )
        } else {
          throw e
        }
      }
    }

    return NextResponse.json(
      { success: true, message: '처리가 완료되었습니다.' },
      { headers }
    )
  } catch (e) {
    console.error('processAttendanceApproval:', e)
    return NextResponse.json(
      { success: false, message: '처리 실패: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
