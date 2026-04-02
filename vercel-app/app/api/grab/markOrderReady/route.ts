import { NextRequest, NextResponse } from 'next/server'
import { grabMarkOrderReady } from '@/lib/grab-partner-api'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as { orderID?: string; markStatus?: number }
    const orderID = String(body?.orderID || '').trim()
    const markStatus = Number(body?.markStatus || 0)
    if (!orderID || ![1, 2].includes(markStatus)) {
      return NextResponse.json({ success: false, message: 'orderID_markStatus_required' }, { status: 400, headers })
    }
    await grabMarkOrderReady({ orderID, markStatus: markStatus as 1 | 2 })
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

