import { NextRequest, NextResponse } from 'next/server'
import { grabCreateSelfServeJourney } from '@/lib/grab-partner-api'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as { partnerMerchantID?: string }
    const partnerMerchantID = String(body?.partnerMerchantID || '').trim()
    if (!partnerMerchantID) {
      return NextResponse.json(
        { success: false, message: 'partnerMerchantID_required' },
        { status: 400, headers }
      )
    }
    const data = await grabCreateSelfServeJourney(partnerMerchantID)
    return NextResponse.json({ success: true, data }, { headers })
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

