import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import { requireAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  stampSaasTenantId,
} from '@/lib/saas-tenant-scope'

/** 고정비 추가/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Content-Type', 'application/json')
      return authResult.errorResponse
    }
    const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
    const tenantError = assertSaasTenantWritable(tenantScope, {
      tableHint: 'fixed_expenses',
      label: '고정비',
    })
    if (tenantError) {
      return NextResponse.json({ success: false, message: tenantError }, { status: 400, headers })
    }
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const name = String(body.name || '').trim()
    const monthlyAmount = Number(body.monthlyAmount ?? body.monthly_amount) || 0
    const store = String(body.store || '').trim()
    const startYearMonth = body.startYearMonth ?? body.start_year_month
    const endYearMonth = body.endYearMonth ?? body.end_year_month
    const memo = String(body.memo || '').trim()
    const accountSubjectId = body.accountSubjectId ?? body.account_subject_id

    if (!name) {
      return NextResponse.json({ success: false, message: '항목명을 입력하세요.' }, { status: 400, headers })
    }

    if (accountSubjectId != null) {
      const asid = Number(accountSubjectId)
      if (!isNaN(asid)) {
        const hdr = await assertAccountSubjectNotHeader(asid)
        if (!hdr.ok) {
          return NextResponse.json({ success: false, message: hdr.message }, { status: hdr.status, headers })
        }
      }
    }

    if (id && !isNaN(id)) {
      const patch: Record<string, unknown> = {
        name,
        monthly_amount: monthlyAmount,
        store: store || null,
        start_year_month: startYearMonth ? String(startYearMonth).trim() || null : null,
        end_year_month: endYearMonth ? String(endYearMonth).trim() || null : null,
        memo: memo || null,
      }
      if (accountSubjectId != null) {
        const asid = Number(accountSubjectId)
        patch.account_subject_id = isNaN(asid) ? null : asid
      }
      await supabaseUpdateByFilter(
        'fixed_expenses',
        appendSaasTenantFilter(`id=eq.${id}`, tenantScope, 'fixed_expenses'),
        patch
      )
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const insertRow: Record<string, unknown> = {
      name,
      monthly_amount: monthlyAmount,
      store: store || null,
      start_year_month: startYearMonth ? String(startYearMonth).trim() || null : null,
      end_year_month: endYearMonth ? String(endYearMonth).trim() || null : null,
      memo: memo || null,
    }
    if (accountSubjectId != null) {
      const asid = Number(accountSubjectId)
      if (!isNaN(asid)) insertRow.account_subject_id = asid
    }
    const inserted = await supabaseInsert(
      'fixed_expenses',
      stampSaasTenantId(insertRow, tenantScope, 'fixed_expenses')
    )

    const row = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (row as { id?: number })?.id
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveFixedExpense:', e)
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('fixed_expenses')
      return NextResponse.json(
        { success: false, message: '고정비 tenant_id 스키마가 없습니다. Omni DB 마이그레이션 SQL을 실행해 주세요.' },
        { status: 400, headers }
      )
    }
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
