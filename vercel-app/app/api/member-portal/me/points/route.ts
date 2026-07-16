import { NextRequest, NextResponse } from 'next/server'
import { listMemberPoints } from '@/lib/members-server'
import { requireMemberSessionWithTenant } from '@/lib/member-portal-session'

export async function GET(req: NextRequest) {
  const { member, tenantScope, error } = await requireMemberSessionWithTenant(req)
  if (error) return error
  const rows = await listMemberPoints({ memberId: member!.id, limit: 100, tenantScope })
  return NextResponse.json({ success: true, rows })
}

