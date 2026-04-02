import { NextRequest, NextResponse } from 'next/server'
import { grabCancelOrder } from '@/lib/grab-partner-api'

export async function PUT(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as {
      orderID?: string
      merchantID?: string
      cancelCode?: number
    }
    const orderID = String(body?.orderID || '').trim()
    const merchantID = String(body?.merchantID || '').trim()
    const cancelCode = Number(body?.cancelCode || 0)
    if (!orderID || !merchantID || ![1001, 1002, 1003, 1004].includes(cancelCode)) {
      return NextResponse.json(
        { success: false, message: 'orderID_merchantID_cancelCode_required' },
        { status: 400, headers }
      )
    }
    const data = await grabCancelOrder({
      orderID,
      merchantID,
      cancelCode: cancelCode as 1001 | 1002 | 1003 | 1004,
    })
    return NextResponse.json({ success: true, data }, { headers })
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

