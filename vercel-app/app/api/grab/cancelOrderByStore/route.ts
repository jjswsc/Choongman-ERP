import { NextRequest, NextResponse } from 'next/server'
import { grabCancelOrder } from '@/lib/grab-partner-api'

function resolveMerchantIdByStore(storeCode: string): string {
  const raw = String(process.env.GRAB_STORE_MAP_JSON ?? '').trim()
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const target = storeCode.trim().toLowerCase()
    for (const [merchantLike, mappedStore] of Object.entries(parsed)) {
      const mapped = String(mappedStore ?? '').trim().toLowerCase()
      if (mapped && mapped === target) return String(merchantLike || '').trim()
    }
    return ''
  } catch {
    return ''
  }
}

export async function PUT(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as {
      orderID?: string
      storeCode?: string
      merchantID?: string
      cancelCode?: number
    }
    const orderID = String(body.orderID || '').trim()
    const storeCode = String(body.storeCode || '').trim()
    const merchantID = String(body.merchantID || '').trim() || resolveMerchantIdByStore(storeCode)
    const cancelCode = Number(body.cancelCode || 1002)
    if (!orderID || !merchantID || ![1001, 1002, 1003, 1004].includes(cancelCode)) {
      return NextResponse.json(
        { success: false, message: 'orderID_and_storeCode_or_merchantID_required' },
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
