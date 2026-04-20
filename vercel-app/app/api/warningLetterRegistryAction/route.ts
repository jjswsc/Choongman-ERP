import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  canReadRegistry,
  canRejectOrApprove,
  canReopenRegistryToDraft,
  canSubmitRegistry,
} from '@/lib/warning-letter-registry-permissions'
type RegistryRow = {
  id?: number
  store_name: string
  approval_status?: string
  created_by?: string | null
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(request)
    if (!auth) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401, headers })
    }
    if (!canReadRegistry(auth)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
    }

    const body = await request.json()
    const id = Number(body.id ?? body.registryId)
    const action = String(body.action || '').trim().toLowerCase()
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, message: 'id required' }, { status: 400, headers })
    }

    const rows = (await supabaseSelectFilter(
      'employee_warning_letter_registry',
      `id=eq.${id}`,
      { select: '*', limit: 1 }
    )) as RegistryRow[]
    const row = rows?.[0]
    if (!row) {
      return NextResponse.json({ success: false, message: '항목을 찾을 수 없습니다.' }, { status: 404, headers })
    }

    const user = String(auth.name || '').trim()
    const now = new Date().toISOString()

    if (action === 'submit') {
      if (!canSubmitRegistry(auth, row)) {
        return NextResponse.json({ success: false, message: '결재 요청할 수 없습니다.' }, { status: 403, headers })
      }
      await supabaseUpdate('employee_warning_letter_registry', id, {
        approval_status: 'pending',
        updated_at: now,
      })
      return NextResponse.json({ success: true, message: '결재 요청되었습니다.' }, { headers })
    }

    if (action === 'approve') {
      if (!canRejectOrApprove(auth)) {
        return NextResponse.json({ success: false, message: '승인 권한이 없습니다.' }, { status: 403, headers })
      }
      if (String(row.approval_status) !== 'pending') {
        return NextResponse.json({ success: false, message: '대기(pending) 상태만 승인할 수 있습니다.' }, { status: 400, headers })
      }
      await supabaseUpdate('employee_warning_letter_registry', id, {
        approval_status: 'approved',
        approved_by: user || null,
        approved_at: now,
        rejected_reason: null,
        updated_at: now,
      })
      return NextResponse.json({ success: true, message: '승인되었습니다.' }, { headers })
    }

    if (action === 'reject') {
      if (!canRejectOrApprove(auth)) {
        return NextResponse.json({ success: false, message: '반려 권한이 없습니다.' }, { status: 403, headers })
      }
      if (String(row.approval_status) !== 'pending') {
        return NextResponse.json({ success: false, message: '대기(pending) 상태만 반려할 수 있습니다.' }, { status: 400, headers })
      }
      const rejected_reason = String(body.rejected_reason || body.rejectedReason || '').trim().slice(0, 2000)
      await supabaseUpdate('employee_warning_letter_registry', id, {
        approval_status: 'rejected',
        approved_by: user || null,
        approved_at: now,
        rejected_reason: rejected_reason || null,
        updated_at: now,
      })
      return NextResponse.json({ success: true, message: '반려되었습니다.' }, { headers })
    }

    if (action === 'reopen') {
      if (String(row.approval_status) !== 'rejected') {
        return NextResponse.json({ success: false, message: '반려된 건만 초안으로 되돌릴 수 있습니다.' }, { status: 400, headers })
      }
      if (!canReopenRegistryToDraft(auth, row)) {
        return NextResponse.json({ success: false, message: '초안 복귀 권한이 없습니다.' }, { status: 403, headers })
      }
      await supabaseUpdate('employee_warning_letter_registry', id, {
        approval_status: 'draft',
        rejected_reason: null,
        approved_by: null,
        approved_at: null,
        updated_at: now,
      })
      return NextResponse.json({ success: true, message: '초안으로 되돌렸습니다. 내용을 수정한 뒤 다시 결재 요청하세요.' }, { headers })
    }

    return NextResponse.json({ success: false, message: 'action: submit | approve | reject | reopen' }, { status: 400, headers })
  } catch (e) {
    console.error('warningLetterRegistryAction:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
