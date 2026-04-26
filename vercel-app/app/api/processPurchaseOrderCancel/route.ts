/**
 * 본사 발주(PO) 취소 API
 * - Draft → Cancelled
 * - Approved → Cancelled (미수·미지급 연동 제거, 입고·통장 연결 시 불가)
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { deletePayableFromPO, deleteReceivableFromAccountingPo } from '@/lib/receivable-payable'
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
    }[]
    if (!rows?.length) {
      return NextResponse.json({ success: false, message: '해당 발주가 없습니다.' }, { headers })
    }

    const po = rows[0]
    if (po.status === 'Cancelled') {
      return NextResponse.json({ success: true, message: '이미 취소된 발주입니다.' }, { headers })
    }

    if (po.status === 'Approved') {
      const inboundLinked = (await supabaseSelectFilter(
        'inbound_batches',
        `purchase_order_id=eq.${poId}`,
        { limit: 1 }
      )) as unknown[]
      if (inboundLinked?.length) {
        return NextResponse.json(
          { success: false, message: '이미 입고가 등록된 발주는 취소할 수 없습니다.' },
          { headers }
        )
      }
      const bankLinked = (await supabaseSelectFilter(
        'bank_transactions',
        `purchase_order_id=eq.${poId}`,
        { limit: 1 }
      )) as unknown[]
      if (bankLinked?.length) {
        return NextResponse.json(
          { success: false, message: '통장 거래와 연결된 발주는 취소할 수 없습니다.' },
          { headers }
        )
      }
    }

    await supabaseUpdate('purchase_orders', poId, { status: 'Cancelled' })
    await deletePayableFromPO(poId)
    await deleteReceivableFromAccountingPo(poId)
    await syncTaxWithholdingLedgerForPurchaseOrder(poId)
    return NextResponse.json({ success: true, message: '취소되었습니다.' }, { headers })
  } catch (e) {
    console.error('processPurchaseOrderCancel:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { headers }
    )
  }
}
