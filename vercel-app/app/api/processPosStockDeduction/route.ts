import { NextRequest, NextResponse } from 'next/server'
import { processPosStockDeduction } from '@/lib/pos-stock-deduction'

/** POS 주문 완료 시 재고 차감 API (수동 호출용) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const orderId = Number(body?.orderId ?? body?.id)

    if (!orderId) {
      return NextResponse.json({ success: false, message: 'orderId required' }, { headers })
    }

    const result = await processPosStockDeduction(orderId)
    return NextResponse.json({
      success: result.success,
      deductedCount: result.deductedCount,
    }, { headers })
  } catch (e) {
    console.error('processPosStockDeduction:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
