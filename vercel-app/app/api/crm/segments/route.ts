import { NextRequest, NextResponse } from 'next/server'
import { listSegmentMembers, type CrmSegmentType } from '@/lib/member-crm-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  const { searchParams } = new URL(req.url)
  const segment = String(searchParams.get('segment') || 'recent30') as CrmSegmentType
  const limit = Number(searchParams.get('limit') || 500)
  const rows = await listSegmentMembers({ segment, limit })
  return NextResponse.json({ success: true, rows })
}

