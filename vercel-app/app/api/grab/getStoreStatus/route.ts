import { NextRequest, NextResponse } from 'next/server'
import { grabGetStoreStatus } from '@/lib/grab-partner-api'

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(req.url)
    const merchantID = String(searchParams.get('merchantID') || '').trim()
    if (!merchantID) {
      return NextResponse.json({ success: false, message: 'merchantID_required' }, { status: 400, headers })
    }
    const data = await grabGetStoreStatus(merchantID)
    return NextResponse.json({ success: true, data }, { headers })
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

