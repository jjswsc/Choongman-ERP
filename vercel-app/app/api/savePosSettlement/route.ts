import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'

/** POS 결산 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
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
    const otherAmt = Number(body.otherAmt) ?? 0
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
      other_amt: otherAmt,
      memo,
      closed,
      updated_at: new Date().toISOString(),
    }

    await supabaseUpsert('pos_settlements', [row], 'store_code,settle_date')
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosSettlement:', e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}
