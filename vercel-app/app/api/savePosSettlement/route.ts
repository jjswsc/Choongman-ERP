import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'

/** POS 결산 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { headers })
    }
    const storeCode = String(body.storeCode ?? '').trim()
    const settleDate = String(body.settleDate ?? '').trim()
    const cashActual = body.cashActual != null ? Number(body.cashActual) : null
    const cashAmt = Number(body.cashAmt) ?? 0
    const cardAmt = Number(body.cardAmt) ?? 0
    const cardBreakdown = body.cardBreakdown && typeof body.cardBreakdown === 'object' ? body.cardBreakdown : {}
    const qrAmt = Number(body.qrAmt) ?? 0
    const qrBreakdown = body.qrBreakdown && typeof body.qrBreakdown === 'object' ? body.qrBreakdown : {}
    const deliveryAppAmt = Number(body.deliveryAppAmt) ?? 0
    const deliveryAppBreakdown = body.deliveryAppBreakdown && typeof body.deliveryAppBreakdown === 'object' ? body.deliveryAppBreakdown : {}
    const dineInDeliveryAmt = Number(body.dineInDeliveryAmt) ?? 0
    const dineInDeliveryBreakdown =
      body.dineInDeliveryBreakdown && typeof body.dineInDeliveryBreakdown === 'object' ? body.dineInDeliveryBreakdown : {}
    const otherAmt = Number(body.otherAmt) ?? 0
    const otherBreakdown = body.otherBreakdown && typeof body.otherBreakdown === 'object' ? body.otherBreakdown : {}
    const memo = String(body.memo ?? '').trim()
    const closed = !!body.closed

    if (!settleDate) {
      return NextResponse.json({ success: false, message: '결산일을 입력하세요.' }, { headers })
    }

    const row = {
      store_code: storeCode,
      settle_date: settleDate,
      cash_actual: cashActual,
      cash_amt: cashAmt,
      card_amt: cardAmt,
      card_breakdown: cardBreakdown,
      qr_amt: qrAmt,
      qr_breakdown: qrBreakdown,
      delivery_app_amt: deliveryAppAmt,
      delivery_app_breakdown: deliveryAppBreakdown,
      dine_in_delivery_amt: dineInDeliveryAmt,
      dine_in_delivery_breakdown: dineInDeliveryBreakdown,
      other_amt: otherAmt,
      other_breakdown: otherBreakdown,
      memo,
      closed,
      updated_at: new Date().toISOString(),
    }

    await supabaseUpsert('pos_settlements', [row], 'store_code,settle_date')
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosSettlement:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        success: false,
        message: msg.slice(0, 500),
        retryAfterQueue: true,
      },
      { headers }
    )
  }
}
