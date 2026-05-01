import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'

const CASH_ACTUAL_DENOM_KEYS = ['1000', '500', '100', '50', '20', '10', '5', '2', '1'] as const

/** 요청 본문의 권종 JSON → DB용. 알 수 없는 키 제거, 음수 제거. 전부 0이면 null */
function normalizeCashActualDenoms(raw: unknown): Record<string, number> | null {
  if (raw == null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const out: Record<string, number> = {}
  let anyNonZero = false
  for (const k of CASH_ACTUAL_DENOM_KEYS) {
    const v = o[k] ?? o[String(Number(k))]
    const parsed = Number(v)
    const n = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
    out[k] = n
    if (n > 0) anyNonZero = true
  }
  return anyNonZero ? out : null
}

function numOrZero(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

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
    const cashActual = body.cashActual != null ? numOrNull(body.cashActual) : null
    const cashAmt = numOrZero(body.cashAmt)
    const cardAmt = numOrZero(body.cardAmt)
    const cardBreakdown = body.cardBreakdown && typeof body.cardBreakdown === 'object' ? body.cardBreakdown : {}
    const qrAmt = numOrZero(body.qrAmt)
    const qrBreakdown = body.qrBreakdown && typeof body.qrBreakdown === 'object' ? body.qrBreakdown : {}
    const deliveryAppAmt = numOrZero(body.deliveryAppAmt)
    const deliveryAppBreakdown = body.deliveryAppBreakdown && typeof body.deliveryAppBreakdown === 'object' ? body.deliveryAppBreakdown : {}
    const dineInDeliveryAmt = numOrZero(body.dineInDeliveryAmt)
    const dineInDeliveryBreakdown =
      body.dineInDeliveryBreakdown && typeof body.dineInDeliveryBreakdown === 'object' ? body.dineInDeliveryBreakdown : {}
    const otherAmt = numOrZero(body.otherAmt)
    const otherBreakdown = body.otherBreakdown && typeof body.otherBreakdown === 'object' ? body.otherBreakdown : {}
    const memo = String(body.memo ?? '').trim()
    const closed = !!body.closed
    const cashActualDenoms = normalizeCashActualDenoms(body.cashActualDenoms)

    if (!settleDate) {
      return NextResponse.json({ success: false, message: '결산일을 입력하세요.' }, { headers })
    }
    if (!storeCode) {
      return NextResponse.json({ success: false, message: '매장(storeCode)이 필요합니다.' }, { headers })
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
      cash_actual_denoms: cashActualDenoms,
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
        /** 클라이언트가 200+success:false 를 오프라인 큐로 위장 성공 처리하지 않도록 끈다 */
        retryAfterQueue: false,
      },
      { headers }
    )
  }
}
