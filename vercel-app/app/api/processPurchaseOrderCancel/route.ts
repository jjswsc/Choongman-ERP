/**
 * 본사 발주(PO) 취소 API
 * - status: Draft -> Cancelled
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'

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
      return NextResponse.json({ success: false, message: '승인된 발주는 취소할 수 없습니다.' }, { headers })
    }

    await supabaseUpdate('purchase_orders', poId, { status: 'Cancelled' })
    return NextResponse.json({ success: true, message: '취소되었습니다.' }, { headers })
  } catch (e) {
    console.error('processPurchaseOrderCancel:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { headers }
    )
  }
}
