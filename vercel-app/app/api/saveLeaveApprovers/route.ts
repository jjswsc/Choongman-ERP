import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseInsert } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import {
  canEditLeaveApprovers,
  normalizeLeaveApproverScope,
} from '@/lib/leave-approval-access'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  stampSaasTenantId,
} from '@/lib/saas-tenant-scope'

type SaveAction = 'add' | 'remove'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth

    if (!canEditLeaveApprovers({ role: auth.role, store: auth.store })) {
      return NextResponse.json(
        { success: false, message: '휴가 승인자 설정 권한이 없습니다.' },
        { status: 403, headers }
      )
    }

    const tenantScope = await resolveSaasTenantScope({ auth })
    const writeErr = assertSaasTenantWritable(tenantScope, {
      tableHint: 'leave_approvers',
      label: '휴가 승인자',
    })
    if (writeErr) {
      return NextResponse.json({ success: false, message: writeErr }, { status: 403, headers })
    }

    const body = await request.json()
    const action = String(body?.action || '').trim().toLowerCase() as SaveAction
    const scope = normalizeLeaveApproverScope(body?.scope)
    const employeeId =
      body?.employeeId != null && Number.isFinite(Number(body.employeeId))
        ? Math.floor(Number(body.employeeId))
        : 0
    const storeRaw = body?.store != null ? String(body.store).trim() : ''

    if (action !== 'add' && action !== 'remove') {
      return NextResponse.json(
        { success: false, message: 'add 또는 remove 를 선택해 주세요.' },
        { headers }
      )
    }
    if (!scope) {
      return NextResponse.json(
        { success: false, message: 'scope 는 all 또는 store 여야 합니다.' },
        { headers }
      )
    }
    if (!(employeeId > 0)) {
      return NextResponse.json(
        { success: false, message: '직원을 선택해 주세요.' },
        { headers }
      )
    }
    if (scope === 'store' && !storeRaw) {
      return NextResponse.json(
        { success: false, message: '매장을 선택해 주세요.' },
        { headers }
      )
    }

    const updatedBy = String(auth.name || '').trim() || String(auth.role || '')

    if (action === 'remove') {
      let filter =
        scope === 'all'
          ? `employee_id=eq.${employeeId}&scope=eq.all`
          : `employee_id=eq.${employeeId}&scope=eq.store&store=eq.${encodeURIComponent(storeRaw)}`
      filter = appendSaasTenantFilter(filter, tenantScope, 'leave_approvers')
      try {
        await supabaseDeleteByFilter('leave_approvers', filter)
      } catch (e) {
        if (isMissingSaasTenantColumnError(e)) {
          markSaasTenantColumnMissing('leave_approvers')
          const fallback =
            scope === 'all'
              ? `employee_id=eq.${employeeId}&scope=eq.all`
              : `employee_id=eq.${employeeId}&scope=eq.store&store=eq.${encodeURIComponent(storeRaw)}`
          await supabaseDeleteByFilter('leave_approvers', fallback)
        } else {
          throw e
        }
      }
      return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
    }

    // add
    const row = stampSaasTenantId(
      {
        employee_id: employeeId,
        scope,
        store: scope === 'all' ? null : storeRaw,
        updated_by: updatedBy,
      },
      tenantScope,
      'leave_approvers'
    )

    try {
      await supabaseInsert('leave_approvers', row)
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (/duplicate|unique|23505/i.test(em)) {
        return NextResponse.json(
          { success: true, message: '이미 등록된 승인자입니다.' },
          { headers }
        )
      }
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('leave_approvers')
        const { tenant_id: _t, ...withoutTenant } = row as Record<string, unknown>
        void _t
        await supabaseInsert('leave_approvers', withoutTenant)
      } else if (/PGRST205|does not exist|42P01/i.test(em)) {
        return NextResponse.json(
          {
            success: false,
            message: 'leave_approvers 테이블이 없습니다. sql/leave_approvers_01_create.sql 을 실행하세요.',
          },
          { status: 503, headers }
        )
      } else {
        throw e
      }
    }

    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveLeaveApprovers:', e)
    return NextResponse.json(
      {
        success: false,
        message: '저장 실패: ' + (e instanceof Error ? e.message : String(e)),
      },
      { status: 500, headers }
    )
  }
}

export async function OPTIONS() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return new NextResponse(null, { status: 204, headers })
}
