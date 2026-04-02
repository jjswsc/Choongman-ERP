import { NextRequest, NextResponse } from 'next/server'
import { grabPauseStore } from '@/lib/grab-partner-api'

export async function PUT(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as {
      merchantID?: string
      isPause?: boolean
      duration?: '30m' | '1h' | '24h'
    }
    const merchantID = String(body?.merchantID || '').trim()
    const isPause = Boolean(body?.isPause)
    const duration = body?.duration
    if (!merchantID) {
      return NextResponse.json({ success: false, message: 'merchantID_required' }, { status: 400, headers })
    }
    if (isPause && !duration) {
      return NextResponse.json({ success: false, message: 'duration_required_when_pause' }, { status: 400, headers })
    }
    await grabPauseStore({ merchantID, isPause, duration })
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

