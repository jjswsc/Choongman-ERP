import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'
import { normalizeVendorCode } from '@/lib/vendor-code-policy'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantContext,
} from '@/lib/interior-tenant-guard'
import { stampSaasTenantId } from '@/lib/saas-tenant-scope'

/** 비용 항목 추가/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  const guard = await requireInteriorTenantContext(request)
  if (!guard.ok) {
    guard.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    guard.errorResponse.headers.set('Content-Type', 'application/json')
    return guard.errorResponse
  }

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const projectId = Number(body.projectId ?? body.project_id)
    const category = String(body.category ?? '').trim()
    const description = String(body.description ?? '').trim()
    const vendorCode = normalizeVendorCode(body.vendorCode ?? body.vendor_code)
    const quote = Number(body.quote ?? body.quote) || 0
    const paid = Number(body.paid ?? body.paid) || 0
    const balance = Number((body.balance ?? body.balance) ?? 0)
    const paymentSchedule = Array.isArray(body.paymentSchedule ?? body.payment_schedule) ? (body.paymentSchedule ?? body.payment_schedule) : []
    const sortOrder = Number(body.sortOrder ?? body.sort_order) || 0

    if (!projectId || isNaN(projectId)) {
      return NextResponse.json({ success: false, message: 'projectId가 필요합니다.' }, { status: 400, headers })
    }
    if (!description) {
      return NextResponse.json({ success: false, message: '설명을 입력하세요.' }, { status: 400, headers })
    }

    const access = await assertInteriorProjectAccess(projectId, guard.scope)
    if (access !== 'ok') return interiorForbiddenResponse(headers)

    const row = {
      project_id: projectId,
      category: category || '기타',
      description,
      vendor_code: vendorCode || null,
      quote,
      paid,
      balance,
      payment_schedule: paymentSchedule,
      sort_order: sortOrder,
    }

    if (id && !isNaN(id)) {
      await supabaseUpdate('interior_expense_items', id, row)
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const inserted = await supabaseInsert(
      'interior_expense_items',
      stampSaasTenantId(row, guard.scope, 'interior_expense_items')
    )
    const insertedRow = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (insertedRow as { id?: number })?.id
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveInteriorExpenseItem:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
