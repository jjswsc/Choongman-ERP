import { NextRequest, NextResponse } from 'next/server'
import { isLinkposCardApiEnabled } from '@/lib/linkpos-card-api-enabled'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    if (!isLinkposCardApiEnabled()) {
      return NextResponse.json({ success: false, message: 'linkpos_card_api_disabled' }, { status: 400, headers })
    }
    const relayUrl = String(process.env.LINKPOS_RELAY_URL || '').trim()
    if (!relayUrl) {
      return NextResponse.json({ success: false, message: 'relay_not_configured' }, { status: 503, headers })
    }
    const body = await req.json()
    const res = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': res.headers.get('content-type') || 'application/json; charset=utf-8',
      },
    })
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 503, headers })
  }
}
