import { NextRequest, NextResponse } from 'next/server'
import { expireStaleQrSessionsBatch } from '@/lib/qr-table-server'
import { requireAuth } from '@/lib/verify-auth'
import { cronAuthErrorResponse, isCronAuthorized } from '@/lib/verify-cron-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  const cronDenied = cronAuthErrorResponse(req, headers)
  if (cronDenied) return cronDenied
  if (!isCronAuthorized(req)) {
    const authRes = await requireAuth(req, 'manager')
    if (authRes.errorResponse) return authRes.errorResponse
  }

  try {
    const expired = await expireStaleQrSessionsBatch(300)
    return NextResponse.json({ success: true, expired }, { headers })
  } catch (e) {
    console.error('qr-table expire-sessions cron:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg.slice(0, 300) }, { status: 500, headers })
  }
}
