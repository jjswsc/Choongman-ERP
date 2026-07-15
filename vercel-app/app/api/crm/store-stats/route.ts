import { NextRequest, NextResponse } from 'next/server'
import { getCrmStoreMemberStats } from '@/lib/member-crm-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  const { searchParams } = new URL(req.url)
  const rows = await getCrmStoreMemberStats({
    recentDays: Number(searchParams.get('recentDays') || 30),
    dormantDays: Number(searchParams.get('dormantDays') || 90),
  })
  return NextResponse.json({ success: true, rows })
}
