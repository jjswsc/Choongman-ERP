/**
 * 본사 발주(PO) 승인 API
 * - status: Draft → Approved
 * - 물류·일반 매입: 미지급은 입고(Inbound) 시 생성. 발주 승인 시 PO 미지급 행은 만들지 않음(레거시 정리만).
 * - 회계 전용 cart_json: 미수(ref AccountingPO), 미지급 없음
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { syncPayableFromApprovedPo, syncReceivableFromApprovedAccountingPo } from '@/lib/receivable-payable'
import { syncTaxWithholdingLedgerForPurchaseOrder } from '@/lib/tax-ledger-auto-sync'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const body = await request.json()
    const poId = Number(body.poId ?? body.id ?? body.purchaseOrderId)

    if (!poId || isNaN(poId)) {
      return NextResponse.json(
        { success: false, message: '잘못된 발주 번호입니다.' },
        { headers }
      )
    }

    const rows = (await supabaseSelectFilter('purchase_orders', 'id=eq.' + poId, { limit: 1 })) as {
      id?: number
      status?: string
      created_at?: string
    }[]
    if (!rows?.length) {
      return NextResponse.json({ success: false, message: '해당 발주가 없습니다.' }, { headers })
    }

    const po = rows[0]
    if (po.status === 'Approved') {
      await syncPayableFromApprovedPo(poId)
      await syncReceivableFromApprovedAccountingPo(poId)
      await syncTaxWithholdingLedgerForPurchaseOrder(poId)
      return NextResponse.json({ success: true, message: '이미 승인된 발주입니다.' }, { headers })
    }

    await supabaseUpdate('purchase_orders', poId, { status: 'Approved' })
    await syncPayableFromApprovedPo(poId)
    await syncReceivableFromApprovedAccountingPo(poId)
    await syncTaxWithholdingLedgerForPurchaseOrder(poId)
    return NextResponse.json({ success: true, message: '승인되었습니다.' }, { headers })
  } catch (e) {
    console.error('processPurchaseOrderApproval:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { headers }
    )
  }
}
