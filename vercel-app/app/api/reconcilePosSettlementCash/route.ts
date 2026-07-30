import { NextRequest, NextResponse } from 'next/server'
import { posApiCorsHeaders, requirePosStoreWriteAuth } from '@/lib/pos-api-write-auth'
import { reconcilePosSettlementCashAmtToLive } from '@/lib/pos-settlement-sync-after-pay-correct'

/** 결산 현금을 완료 주문 payment_cash 합에 맞춤(시재·마감 플래그는 유지). 명시적 POST만. */
export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers })
    }
    const storeCode = String(body.storeCode ?? '').trim()
    const settleDate = String(body.settleDate ?? '').trim().slice(0, 10)
    const authGate = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!authGate.ok) return authGate.response
    if (!storeCode || !/^\d{4}-\d{2}-\d{2}$/.test(settleDate)) {
      return NextResponse.json(
        { success: false, message: 'storeCode and settleDate required' },
        { status: 400, headers }
      )
    }
    const who = [authGate.auth?.name, authGate.auth?.employeeCode].filter(Boolean).join(' ') || 'pos'
    const result = await reconcilePosSettlementCashAmtToLive({
      storeCode,
      settleDateYmd: settleDate,
      who,
    })
    return NextResponse.json({ success: true, result }, { headers })
  } catch (e) {
    console.error('reconcilePosSettlementCash:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg.slice(0, 500) }, { status: 500, headers })
  }
}
