import { NextRequest, NextResponse } from 'next/server'
import { grabUpdateMenuRecord, isGrabMenuField } from '@/lib/grab-partner-api'

export async function PUT(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as Record<string, unknown>
    const merchantID = String(body?.merchantID || '').trim()
    const field = String(body?.field || '').trim().toUpperCase()
    const id = String(body?.id || '').trim()

    if (!merchantID || !field || !id || !isGrabMenuField(field)) {
      return NextResponse.json(
        { success: false, message: 'merchantID_field_id_required' },
        { status: 400, headers }
      )
    }

    await grabUpdateMenuRecord(body as never)
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

