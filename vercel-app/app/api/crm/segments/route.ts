import { NextRequest, NextResponse } from 'next/server'
import { listSegmentMembers, type CrmSegmentType } from '@/lib/member-crm-server'
import { requireAuth } from '@/lib/verify-auth'

const VALID: CrmSegmentType[] = [
  'recent30',
  'dormant90',
  'new30',
  'vip',
  'atRisk',
  'birthday7',
  'pointsIdle',
]

export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  const { searchParams } = new URL(req.url)
  const segmentRaw = String(searchParams.get('segment') || 'recent30') as CrmSegmentType
  const segment = VALID.includes(segmentRaw) ? segmentRaw : 'recent30'
  const limit = Number(searchParams.get('limit') || 500)
  const rows = await listSegmentMembers({
    segment,
    limit,
    recentDays: Number(searchParams.get('recentDays') || 30),
    dormantDays: Number(searchParams.get('dormantDays') || 90),
    storeCode: searchParams.get('storeCode') || undefined,
    pointsMin: Number(searchParams.get('pointsMin') || 100),
  })
  return NextResponse.json({ success: true, rows })
}
