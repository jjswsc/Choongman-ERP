import { NextRequest, NextResponse } from 'next/server'
import { requireMemberSession } from '@/lib/member-portal-session'

export async function GET(req: NextRequest) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  return NextResponse.json({ success: true, member })
}

