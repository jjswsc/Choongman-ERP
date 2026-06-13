import { NextRequest, NextResponse } from 'next/server'
import { getSegmentCounts } from '@/lib/member-crm-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  const counts = await getSegmentCounts()
  return NextResponse.json({ success: true, counts })
}
