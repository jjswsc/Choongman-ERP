import { NextRequest, NextResponse } from 'next/server'
import { listMemberCouponIssues } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const rows = await listMemberCouponIssues({ limit: 2000 })
    let issued = 0
    let used = 0
    let expired = 0
    let active = 0
    for (const r of rows || []) {
      const st = String(r.status || '').toLowerCase()
      issued += 1
      if (st === 'used') used += 1
      else if (st === 'expired') expired += 1
      else if (st === 'issued') active += 1
    }
    return NextResponse.json({ success: true, stats: { issued, used, expired, active } })
  } catch {
    return NextResponse.json({ success: true, stats: { issued: 0, used: 0, expired: 0, active: 0 } })
  }
}
