import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { parseOr400, requestLeaveSchema } from '@/lib/api-validate'
import { hasOneYearTenureAsOf } from '@/lib/annual-leave'
import {
  bareNameFuzzySameForLeaveStats,
  canReapplyLeaveOnSameDate,
  isAnnualLeaveFamilyType,
  isLeaveDuplicateConstraintError,
  LEAVE_REQUEST_ALREADY_EXISTS_KO,
  leavePersonKeyForLeaveStats,
  normalizeLeaveMatchKey,
} from '@/lib/leave-request-utils'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
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
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const body = await request.json()
    const d = body.d || body
    const bodyForValidation = {
      store: d.store || '',
      name: d.name || '',
      type: d.type || '',
      date: (d.date || d.leave_date || '').slice(0, 10),
      reason: d.reason,
      employeeId: d.employeeId ?? d.employee_id,
    }
    const validated = parseOr400(requestLeaveSchema, bodyForValidation, headers)
    if (validated.errorResponse) return validated.errorResponse
    const { store, name, type, date: leaveDate, reason, employeeId } = validated.parsed

    const auth = await tryVerifyBearerFromRequest(request)
    const tenantScope = await resolveSaasTenantScope({
      auth: auth ? { tenantId: auth.tenantId, company: auth.company } : null,
      storeCode: store,
    })
    const tenantWriteErr = assertSaasTenantWritable(tenantScope, {
      tableHint: 'leave_requests',
      label: '휴가 신청',
    })
    if (tenantWriteErr) {
      return NextResponse.json({ success: false, message: tenantWriteErr }, { status: 403, headers })
    }

    let verifiedEmployeeId: number | undefined
    if (employeeId != null && employeeId > 0) {
      const erows = (await supabaseSelectFilter(
        'employees',
        `id=eq.${employeeId}&store=ilike.${encodeURIComponent(store)}`,
        { limit: 1, select: 'id,store,name,name_title,join_date' }
      )) as {
        id?: number
        store?: string
        name?: string
        name_title?: string | null
        join_date?: string | null
      }[]
      const e = erows?.[0]
      if (!e) {
        return NextResponse.json(
          { success: false, message: '❌ 직원을 확인할 수 없습니다. 다시 로그인 후 시도해 주세요.' },
          { headers }
        )
      }
      if (normalizeLeaveMatchKey(String(e.store || '')) !== normalizeLeaveMatchKey(store)) {
        return NextResponse.json(
          { success: false, message: '❌ 매장 정보가 일치하지 않습니다.' },
          { headers }
        )
      }
      const reqKey = leavePersonKeyForLeaveStats(name, '')
      const empKey = leavePersonKeyForLeaveStats(String(e.name || ''), e.name_title)
      if (reqKey !== empKey && !bareNameFuzzySameForLeaveStats(reqKey, empKey)) {
        return NextResponse.json(
          { success: false, message: '❌ 로그인 이름과 직원 정보가 일치하지 않습니다.' },
          { headers }
        )
      }
      const vid = Math.floor(Number(e.id))
      if (!(vid > 0)) {
        return NextResponse.json(
          { success: false, message: '❌ 직원 식별에 실패했습니다. 다시 로그인해 주세요.' },
          { headers }
        )
      }
      verifiedEmployeeId = vid
    }

    let effectiveType = type.trim()

    if (isAnnualLeaveFamilyType(effectiveType)) {
      let emp: { join_date?: string | null } | null = null
      if (verifiedEmployeeId != null && verifiedEmployeeId > 0) {
        const one = (await supabaseSelectFilter('employees', `id=eq.${verifiedEmployeeId}`, {
          limit: 1,
          select: 'join_date',
        })) as { join_date?: string | null }[]
        emp = one?.[0] ?? null
      } else {
        const empRows = (await supabaseSelectFilter(
          'employees',
          `store=ilike.${encodeURIComponent(store)}&name=ilike.${encodeURIComponent(name)}`,
          { order: 'id.asc', limit: 1, select: 'join_date' }
        )) as { join_date?: string | null }[]
        emp = empRows?.[0] ?? null
      }
      if (!hasOneYearTenureAsOf(emp, leaveDate)) {
        const half = effectiveType.indexOf('반차') !== -1 || /\bhalf\b/i.test(effectiveType)
        effectiveType = half ? '무급휴가(반차)' : '무급휴가'
      }
    }

    const leaveReason = String(reason || '').trim()
    const leaveRow: Record<string, unknown> = stampSaasTenantId(
      {
        store,
        name,
        type: effectiveType,
        leave_date: leaveDate,
        reason: leaveReason,
        status: '대기',
        ...(verifiedEmployeeId != null && verifiedEmployeeId > 0
          ? { employee_id: verifiedEmployeeId }
          : {}),
      },
      tenantScope,
      'leave_requests'
    )

    const existingBaseFilter = `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}&leave_date=eq.${leaveDate}`
    let existing: { id?: number; status?: string }[] = []
    try {
      existing = (await supabaseSelectFilter(
        'leave_requests',
        appendSaasTenantFilter(existingBaseFilter, tenantScope, 'leave_requests'),
        { limit: 1, select: 'id,status' }
      )) as typeof existing
    } catch (selErr) {
      if (isMissingSaasTenantColumnError(selErr)) {
        markSaasTenantColumnMissing('leave_requests')
        existing = (await supabaseSelectFilter('leave_requests', existingBaseFilter, {
          limit: 1,
          select: 'id,status',
        })) as typeof existing
      } else {
        throw selErr
      }
    }
    const existingRow = existing?.[0]
    const existingId = existingRow?.id != null ? Math.floor(Number(existingRow.id)) : 0
    if (existingId > 0) {
      if (!canReapplyLeaveOnSameDate(String(existingRow?.status || ''))) {
        return NextResponse.json(
          { success: false, message: LEAVE_REQUEST_ALREADY_EXISTS_KO },
          { headers }
        )
      }
      const reapplyPayload: Record<string, unknown> = {
        type: effectiveType,
        reason: leaveReason,
        status: '대기',
        reject_reason: '',
        certificate_url: null,
        ...(verifiedEmployeeId != null && verifiedEmployeeId > 0
          ? { employee_id: verifiedEmployeeId }
          : {}),
      }
      try {
        await supabaseUpdate('leave_requests', existingId, reapplyPayload)
      } catch (updErr) {
        const um = updErr instanceof Error ? updErr.message : String(updErr)
        if (/employee_id|42703|column/i.test(um) && 'employee_id' in reapplyPayload) {
          const { employee_id: _eid, ...withoutEid } = reapplyPayload
          await supabaseUpdate('leave_requests', existingId, withoutEid)
        } else {
          throw updErr
        }
      }
      return NextResponse.json({ success: true, message: '✅ 신청 완료' }, { headers })
    }

    try {
      await supabaseInsert('leave_requests', leaveRow)
    } catch (insErr) {
      if (isLeaveDuplicateConstraintError(insErr)) {
        return NextResponse.json(
          { success: false, message: LEAVE_REQUEST_ALREADY_EXISTS_KO },
          { headers }
        )
      }
      const em = insErr instanceof Error ? insErr.message : String(insErr)
      if (isMissingSaasTenantColumnError(insErr) && 'tenant_id' in leaveRow) {
        markSaasTenantColumnMissing('leave_requests')
        const { tenant_id: _t, ...withoutTenant } = leaveRow
        try {
          await supabaseInsert('leave_requests', withoutTenant)
        } catch (insErr2) {
          if (isLeaveDuplicateConstraintError(insErr2)) {
            return NextResponse.json(
              { success: false, message: LEAVE_REQUEST_ALREADY_EXISTS_KO },
              { headers }
            )
          }
          const em2 = insErr2 instanceof Error ? insErr2.message : String(insErr2)
          if (/employee_id|42703|column/i.test(em2) && 'employee_id' in withoutTenant) {
            const { employee_id: _eid, ...withoutEid } = withoutTenant
            try {
              await supabaseInsert('leave_requests', withoutEid)
            } catch (insErrEid) {
              if (isLeaveDuplicateConstraintError(insErrEid)) {
                return NextResponse.json(
                  { success: false, message: LEAVE_REQUEST_ALREADY_EXISTS_KO },
                  { headers }
                )
              }
              throw insErrEid
            }
          } else {
            throw insErr2
          }
        }
      } else if (/employee_id|42703|column/i.test(em) && 'employee_id' in leaveRow) {
        const { employee_id: _eid, ...withoutEid } = leaveRow
        try {
          await supabaseInsert('leave_requests', withoutEid)
        } catch (insErr3) {
          if (isLeaveDuplicateConstraintError(insErr3)) {
            return NextResponse.json(
              { success: false, message: LEAVE_REQUEST_ALREADY_EXISTS_KO },
              { headers }
            )
          }
          throw insErr3
        }
      } else {
        throw insErr
      }
    }
    return NextResponse.json(
      { success: true, message: '✅ 신청 완료' },
      { headers }
    )
  } catch (e) {
    console.error('requestLeave:', e)
    return NextResponse.json(
      {
        success: false,
        message: '❌ 신청 실패: ' + (e instanceof Error ? e.message : String(e)),
      },
      { headers }
    )
  }
}
