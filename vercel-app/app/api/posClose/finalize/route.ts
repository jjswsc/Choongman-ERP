import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { finalizePosCloseRun } from '@/lib/pos-close-engine/finalize'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const auth = await getVerifiedAuth(req)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const storeCode = String(body.storeCode ?? '').trim()
    const businessDate = String(body.businessDate ?? body.settleDate ?? '').trim()
    const result = await finalizePosCloseRun({
      storeCode,
      businessDate,
      finalizedBy: String(auth?.name || '').trim() || null,
    })
    return NextResponse.json({ success: true, result }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg.slice(0, 300) }, { headers })
  }
}
