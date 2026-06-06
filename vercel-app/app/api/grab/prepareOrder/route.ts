import { NextRequest, NextResponse } from 'next/server'
import { grabPrepareOrder } from '@/lib/grab-partner-api'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as { orderID?: string; toState?: string }
    const orderID = String(body?.orderID || '').trim()
    const rawState = String(body?.toState || '').trim()
    const toState =
      rawState.toLowerCase() === 'rejected'
        ? 'Rejected'
        : rawState.toLowerCase() === 'accepted'
          ? 'Accepted'
          : ''
    if (!orderID || !toState) {
      return NextResponse.json({ success: false, message: 'orderID_toState_required' }, { status: 400, headers })
    }
    await grabPrepareOrder({ orderID, toState })
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
