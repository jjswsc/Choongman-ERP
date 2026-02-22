import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdate, supabaseSelectFilter } from '@/lib/supabase-server'

/** 통장 거래 인보이스 수령 체크 (매입 대금 건)
 * purchase_order_id가 있으면 발주서와 동기화 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const bankTxId = Number(body.bankTransactionId ?? body.id ?? body.bankTxId)
    const invoiceReceived = body.invoiceReceived ?? body.invoice_received
    const invoiceNo = body.invoiceNo ?? body.invoice_no
    const purchaseOrderId = body.purchaseOrderId ?? body.purchase_order_id

    if (!bankTxId || isNaN(bankTxId)) {
      return NextResponse.json({ success: false, message: '통장 거래 ID가 필요합니다.' }, { status: 400, headers })
    }

    const existing = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTxId}`, { limit: 1 })) as {
      id?: number
      category?: string
      purchase_order_id?: number
    }[]
    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '해당 통장 거래가 없습니다.' }, { status: 404, headers })
    }

    const patch: Record<string, unknown> = {}
    if (typeof invoiceReceived === 'boolean') patch.invoice_received = invoiceReceived
    if (invoiceNo !== undefined) patch.invoice_no = String(invoiceNo || '').trim() || null
    if (purchaseOrderId !== undefined) {
      const poId = purchaseOrderId ? Number(purchaseOrderId) : null
      patch.purchase_order_id = poId && !isNaN(poId) ? poId : null
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: true, message: '변경 사항 없음' }, { headers })
    }

    await supabaseUpdate('bank_transactions', bankTxId, patch)

    // 연동: purchase_order_id가 있으면 발주서 인보이스도 동기화
    const poIdRaw = patch.purchase_order_id !== undefined ? patch.purchase_order_id : existing[0].purchase_order_id
    const poId = typeof poIdRaw === 'number' && !isNaN(poIdRaw) ? poIdRaw : null
    if (poId != null && typeof invoiceReceived === 'boolean') {
      await supabaseUpdate('purchase_orders', poId, { invoice_received: invoiceReceived })
    }

    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('updateBankTransactionInvoice:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
