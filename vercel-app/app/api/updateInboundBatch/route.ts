import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'

/** 입고 배치 수정 (거래처, 인보이스 등) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const batchId = Number(body.batchId ?? body.id ?? 0)
    if (!batchId || isNaN(batchId)) {
      return NextResponse.json({ success: false, message: '배치 ID가 필요합니다.' }, { status: 400, headers })
    }

    const patch: Record<string, unknown> = {}
    if (body.vendorName !== undefined) patch.vendor_name = String(body.vendorName || '').trim() || null
    if (body.vendorCode !== undefined) patch.vendor_code = String(body.vendorCode || '').trim() || null
    if (body.poNo !== undefined) patch.po_no = String(body.poNo || '').trim() || null
    if (body.invoiceNo !== undefined) patch.invoice_no = String(body.invoiceNo || '').trim() || null
    if (body.invoicePhotoUrl !== undefined) patch.invoice_photo_url = String(body.invoicePhotoUrl || '').trim() || null
    if (typeof body.invoiceReceived === 'boolean') patch.invoice_received = body.invoiceReceived
    if (body.purchaseOrderId !== undefined) {
      const v = body.purchaseOrderId
      patch.purchase_order_id = v && !isNaN(Number(v)) ? Number(v) : null
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: true, message: '변경 사항이 없습니다.' }, { headers })
    }

    await supabaseUpdate('inbound_batches', batchId, patch)

    // payable_transactions도 업데이트 (ref_type=Inbound, ref_id=batchId)
    if (patch.vendor_name !== undefined || patch.vendor_code !== undefined) {
      const payables = (await supabaseSelectFilter('payable_transactions', `ref_type=eq.Inbound&ref_id=eq.${batchId}`, { limit: 1 })) as { id?: number }[]
      if (payables?.length && payables[0].id) {
        const payPatch: Record<string, unknown> = {}
        if (patch.vendor_code !== undefined) payPatch.vendor_code = patch.vendor_code || patch.vendor_name
        if (patch.vendor_name !== undefined && patch.vendor_code === undefined) payPatch.vendor_code = patch.vendor_name
        if (Object.keys(payPatch).length > 0) {
          await supabaseUpdate('payable_transactions', payables[0].id, payPatch)
        }
      }
    }

    return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
  } catch (e) {
    console.error('updateInboundBatch:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '수정 실패' },
      { status: 500, headers }
    )
  }
}
