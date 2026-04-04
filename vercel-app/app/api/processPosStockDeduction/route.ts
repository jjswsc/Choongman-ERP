import { NextRequest, NextResponse } from 'next/server'
import { processPosStockDeduction } from '@/lib/pos-stock-deduction'
import { reserveRequestIdempotencyKey } from '@/lib/request-idempotency'

/** POS 주문 완료 시 재고 차감 API (수동 호출용) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const idempotencyKey = String(
      req.headers.get('x-idempotency-key') ??
        body?.idempotencyKey ??
        body?.idempotency_key ??
        ''
    ).trim()
    if (idempotencyKey) {
      const duplicate = await reserveRequestIdempotencyKey({
        scope: 'processPosStockDeduction',
        key: idempotencyKey,
        payload: { orderId: body?.orderId ?? body?.id ?? null },
      })
      if (duplicate) {
        return NextResponse.json({ success: true, duplicate: true, deductedCount: 0 }, { headers })
      }
    }

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
