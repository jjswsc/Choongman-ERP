import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsertMany, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import {
  clampNonNegativeMinutes,
  hasValidMinutesInput,
  resolveClockInApprovalLate,
  shouldRecordAdjustment,
} from '@/lib/attendance-adjustment-utils'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const body = await request.json()
    const id = body?.id != null ? Number(body.id) : NaN
    const decision = String(body?.decision || body?.status || '').trim()
    const userStore = String(body?.userStore || '').trim()
    const userRole = String(body?.userRole || '').toLowerCase()
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

    const rows = (await supabaseSelectFilter('attendance_logs', `id=eq.${id}`, {
      limit: 1,
      select: 'id,store_name,log_type,late_min,early_min,ot_min',
    })) as { id: number; store_name?: string; log_type?: string; late_min?: number; early_min?: number; ot_min?: number }[]
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: '해당 기록을 찾을 수 없습니다.' },
        { headers }
      )
    }

    const isManager = userRole === 'manager'
    if (isManager && userStore && String(rows[0].store_name || '').trim() !== userStore) {
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
      const inRows = (await supabaseSelectFilter('attendance_logs', `id=eq.${optionalInLogId}`, {
        limit: 1,
        select: 'id,store_name,log_type,late_min',
      })) as { id: number; store_name?: string; log_type?: string; late_min?: number }[]
      const inRow = inRows?.[0]
      if (inRow && String(inRow.log_type || '').trim() === '출근') {
        if (isManager && userStore && String(inRow.store_name || '').trim() !== userStore) {
          return NextResponse.json(
            { success: false, message: '해당 매장의 근태만 승인할 수 있습니다.' },
            { headers }
          )
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
      await supabaseInsertMany('attendance_log_adjustments', adjustmentRows)
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
