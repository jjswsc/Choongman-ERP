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
    const cardAmt = Number(body.cardAmt) ?? 0
    const qrAmt = Number(body.qrAmt) ?? 0
    const deliveryAppAmt = Number(body.deliveryAppAmt) ?? 0
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
      card_amt: cardAmt,
      qr_amt: qrAmt,
      delivery_app_amt: deliveryAppAmt,
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
