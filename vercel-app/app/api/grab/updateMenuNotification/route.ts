import { NextRequest, NextResponse } from 'next/server'
import { grabUpdateMenuNotification } from '@/lib/grab-partner-api'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as { merchantID?: string }
    const merchantID = String(body?.merchantID || '').trim()
    if (!merchantID) {
      return NextResponse.json({ success: false, message: 'merchantID_required' }, { status: 400, headers })
    }
    await grabUpdateMenuNotification(merchantID)
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

