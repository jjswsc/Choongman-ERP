import { NextRequest, NextResponse } from 'next/server'
import { listMemberCouponIssuesForPortalMember } from '@/lib/members-server'
import { requireMemberSession } from '@/lib/member-portal-session'

export async function GET(req: NextRequest) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  const rows = await listMemberCouponIssuesForPortalMember(member!.id, 100)
  return NextResponse.json({ success: true, rows })
}

