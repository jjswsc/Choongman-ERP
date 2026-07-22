import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'
import { normalizeVendorCode } from '@/lib/vendor-code-policy'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantContext,
} from '@/lib/interior-tenant-guard'
import { stampSaasTenantId } from '@/lib/saas-tenant-scope'

/** 직매입 품목 추가/수정 */
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
    const category = String((body.category ?? '') || '').trim()
    const itemNo = Number(body.itemNo ?? body.item_no) || 0
    const description = String((body.description ?? '') || '').trim()
    const qty = Number(body.qty ?? 1) || 1
    const unit = String((body.unit ?? 'set') || 'set').trim()
    const price = Number(body.price ?? 0) || 0
    const sumAmount = Number(body.sumAmount ?? body.sum_amount) ?? qty * price
    const supplierCode = normalizeVendorCode(body.supplierCode ?? body.supplier_code)
    const status = String((body.status ?? 'pending') || 'pending').trim()
    const remark = String((body.remark ?? '') || '').trim()

    if (!projectId || isNaN(projectId)) {
      return NextResponse.json({ success: false, message: 'projectId가 필요합니다.' }, { status: 400, headers })
    }
    if (!description) {
      return NextResponse.json({ success: false, message: '품목명을 입력하세요.' }, { status: 400, headers })
    }

    const access = await assertInteriorProjectAccess(projectId, guard.scope)
    if (access !== 'ok') return interiorForbiddenResponse(headers)

    const row = {
      project_id: projectId,
      category: category || 'M&E',
      item_no: itemNo,
      description,
      qty,
      unit: unit || 'set',
      price,
      sum_amount: sumAmount || qty * price,
      supplier_code: supplierCode || null,
      status: status || 'pending',
      remark: remark || null,
    }

    if (id && !isNaN(id)) {
      await supabaseUpdate('interior_direct_purchases', id, row)
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const inserted = await supabaseInsert(
      'interior_direct_purchases',
      stampSaasTenantId(row, guard.scope, 'interior_direct_purchases')
    )
    const insertedRow = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (insertedRow as { id?: number })?.id
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveInteriorDirectPurchase:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
