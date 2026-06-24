import { NextRequest, NextResponse } from 'next/server'
import { expireStaleMemberPortalPendingPayments } from '@/lib/member-portal-pending-payment-expiry'
import { requireAuth } from '@/lib/verify-auth'
import { cronAuthErrorResponse, isCronAuthorized } from '@/lib/verify-cron-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cronDenied = cronAuthErrorResponse(req)
  if (cronDenied) return cronDenied
  if (!isCronAuthorized(req)) {
    const authRes = await requireAuth(req, 'manager')
    if (authRes.errorResponse) return authRes.errorResponse
  }

  try {
    const result = await expireStaleMemberPortalPendingPayments()
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    console.error('member-portal/cron/expire-pending-payments:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'expire_failed' },
      { status: 500 }
    )
  }
}
