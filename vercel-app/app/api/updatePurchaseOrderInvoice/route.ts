import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdate, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { syncPayableFromApprovedPo } from '@/lib/receivable-payable'

/** 발주(PO) 인보이스 수령·원천징수세 수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const poId = Number(body.poId ?? body.id ?? body.purchaseOrderId)
    const invoiceReceived = body.invoiceReceived ?? body.invoice_received
    const invoiceNo = body.invoiceNo ?? body.invoice_no
    const withholdingTaxAmount = body.withholdingTaxAmount ?? body.withholding_tax_amount
    const withholdingTaxRate = body.withholdingTaxRate ?? body.withholding_tax_rate

    if (!poId || isNaN(poId)) {
      return NextResponse.json({ success: false, message: '발주 번호가 필요합니다.' }, { status: 400, headers })
    }

    const existing = (await supabaseSelectFilter('purchase_orders', `id=eq.${poId}`, { limit: 1 })) as { id?: number }[]
    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '해당 발주가 없습니다.' }, { status: 404, headers })
    }

    const patch: Record<string, unknown> = {}
    if (typeof invoiceReceived === 'boolean') patch.invoice_received = invoiceReceived
    if (invoiceNo !== undefined) patch.invoice_no = String(invoiceNo || '').trim() || null
    if (withholdingTaxAmount !== undefined) {
      const amt = Number(withholdingTaxAmount)
      patch.withholding_tax_amount = !isNaN(amt) && amt >= 0 ? amt : 0
    }
    if (withholdingTaxRate !== undefined) {
      const rate = Number(withholdingTaxRate)
      patch.withholding_tax_rate = !isNaN(rate) && rate >= 0 ? rate : null
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: true, message: '변경 사항 없음' }, { headers })
    }

    await supabaseUpdate('purchase_orders', poId, patch)
    await syncPayableFromApprovedPo(poId)

    // 연동: 이 발주에 연결된 통장 거래도 인보이스 상태 동기화
    if (typeof invoiceReceived === 'boolean') {
      try {
        await supabaseUpdateByFilter(
          'bank_transactions',
          `purchase_order_id=eq.${poId}`,
          { invoice_received: invoiceReceived }
        )
      } catch {
        /* bank_transactions에 purchase_order_id 컬럼 없을 수 있음 */
      }
    }

    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('updatePurchaseOrderInvoice:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
