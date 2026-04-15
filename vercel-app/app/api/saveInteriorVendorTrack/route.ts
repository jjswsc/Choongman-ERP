import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'

const ALLOWED_STATUS = new Set(['planned', 'ordered', 'paid', 'received', 'done', 'delayed', 'cancelled'])

/** 업체 결제/입고/완료 트래킹 추가/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const projectId = Number(body.projectId ?? body.project_id)
    const vendorName = String(body.vendorName ?? body.vendor_name ?? '').trim()
    const vendorCode = String(body.vendorCode ?? body.vendor_code ?? '').trim()
    const workPackageIdRaw = body.workPackageId ?? body.work_package_id
    const workPackageId = workPackageIdRaw != null && workPackageIdRaw !== '' ? Number(workPackageIdRaw) : null
    const paymentDueDate = body.paymentDueDate ?? body.payment_due_date
    const paymentPaidDate = body.paymentPaidDate ?? body.payment_paid_date
    const materialEtaDate = body.materialEtaDate ?? body.material_eta_date
    const materialReceivedDate = body.materialReceivedDate ?? body.material_received_date
    const workCompletedDate = body.workCompletedDate ?? body.work_completed_date
    const rawStatus = String(body.status ?? 'planned').trim()
    const amount = Number(body.amount ?? 0) || 0
    const note = String(body.note ?? '').trim()
    const sortOrder = Number(body.sortOrder ?? body.sort_order) || 0

    if (!projectId || Number.isNaN(projectId)) {
      return NextResponse.json({ success: false, message: 'projectId가 필요합니다.' }, { status: 400, headers })
    }
    if (!vendorName) {
      return NextResponse.json({ success: false, message: '업체명을 입력하세요.' }, { status: 400, headers })
    }

    const status = ALLOWED_STATUS.has(rawStatus) ? rawStatus : 'planned'
    const row = {
      project_id: projectId,
      vendor_name: vendorName,
      vendor_code: vendorCode || null,
      work_package_id: workPackageId && !Number.isNaN(workPackageId) ? workPackageId : null,
      payment_due_date: paymentDueDate ? String(paymentDueDate).slice(0, 10) : null,
      payment_paid_date: paymentPaidDate ? String(paymentPaidDate).slice(0, 10) : null,
      material_eta_date: materialEtaDate ? String(materialEtaDate).slice(0, 10) : null,
      material_received_date: materialReceivedDate ? String(materialReceivedDate).slice(0, 10) : null,
      work_completed_date: workCompletedDate ? String(workCompletedDate).slice(0, 10) : null,
      status,
      amount,
      note: note || null,
      sort_order: sortOrder,
    }

    if (id && !Number.isNaN(id)) {
      await supabaseUpdate('interior_vendor_tracks', id, row)
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const inserted = await supabaseInsert('interior_vendor_tracks', row)
    const insertedRow = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (insertedRow as { id?: number })?.id
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveInteriorVendorTrack:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
