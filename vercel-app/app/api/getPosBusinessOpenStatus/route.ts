import { NextRequest, NextResponse } from 'next/server'
import { checkPosBusinessOpenServer } from '@/lib/pos-business-open-gate-server'

/** POS 판매 게이트 — 결산 집계 없이 시재(cash_actual)만 확인 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  const storeCode = String(new URL(request.url).searchParams.get('storeCode') || '').trim()
  if (!storeCode) {
    return NextResponse.json(
      {
        success: true,
        allowed: false,
        businessDateYmd: '',
        blockReason: 'never_opened',
        settlementClosed: false,
      },
      { headers }
    )
  }
  try {
    const result = await checkPosBusinessOpenServer(storeCode)
    return NextResponse.json({ success: true, ...result }, { headers })
  } catch (e) {
    console.warn('getPosBusinessOpenStatus:', e)
    return NextResponse.json({ success: false, message: 'open_status_failed' }, { status: 500, headers })
  }
}
