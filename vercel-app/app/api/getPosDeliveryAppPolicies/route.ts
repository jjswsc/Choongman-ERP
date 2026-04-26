import { NextRequest, NextResponse } from 'next/server'
import { getPosDeliveryPolicyBundle, type DeliveryAppCode } from '@/lib/pos-delivery-policy'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  try {
    const { searchParams } = new URL(req.url)
    const storeCode = String(searchParams.get('storeCode') ?? '').trim()
    const appCode = String(searchParams.get('appCode') ?? 'grab').trim().toLowerCase() as DeliveryAppCode
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode_required' }, { status: 400, headers })
    }
    const bundle = await getPosDeliveryPolicyBundle({ storeCode, appCode })
    return NextResponse.json({ success: true, ...bundle }, { headers })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: String(e ?? 'unknown_error') },
      { status: 500, headers }
    )
  }
}
