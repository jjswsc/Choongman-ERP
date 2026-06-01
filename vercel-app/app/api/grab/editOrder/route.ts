import { NextRequest, NextResponse } from 'next/server'
import { grabEditOrderV2, type GrabEditOrderPayload } from '@/lib/grab-partner-api'

function isFiniteNumberOrUndefined(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

export async function PUT(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as GrabEditOrderPayload
    const orderID = String(body?.orderID || '').trim()
    const items = Array.isArray(body?.items) ? body.items : []

    if (!orderID || items.length === 0) {
      return NextResponse.json(
        { success: false, message: 'orderID_items_required' },
        { status: 400, headers }
      )
    }
    if (
      !isFiniteNumberOrUndefined(body.depositAmountInMin) ||
      !isFiniteNumberOrUndefined(body.offlinePOSDiscountInMin)
    ) {
      return NextResponse.json(
        { success: false, message: 'invalid_amount_fields' },
        { status: 400, headers }
      )
    }

    const data = await grabEditOrderV2({
      ...body,
      orderID,
      items,
    })
    return NextResponse.json({ success: true, data }, { headers })
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

