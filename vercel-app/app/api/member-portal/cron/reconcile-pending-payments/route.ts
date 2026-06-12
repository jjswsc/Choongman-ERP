import { NextRequest, NextResponse } from 'next/server'
import { reconcileStaleMemberPortalQrPayments } from '@/lib/member-portal-pending-payment-reconcile'
import { requireAuth } from '@/lib/verify-auth'

function isCronAuthorized(req: NextRequest): boolean {
  const secret = String(process.env.CRON_SECRET || '').trim()
  if (!secret) return false
  const auth = String(req.headers.get('authorization') || '').trim()
  return auth === `Bearer ${secret}`
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const fromCron = isCronAuthorized(req)
  if (!fromCron) {
    const authRes = await requireAuth(req, 'manager')
    if (authRes.errorResponse) return authRes.errorResponse
  }

  try {
    const result = await reconcileStaleMemberPortalQrPayments()
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    console.error('member-portal/cron/reconcile-pending-payments:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'reconcile_failed' },
      { status: 500 }
    )
  }
}
