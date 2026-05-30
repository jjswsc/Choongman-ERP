import { NextRequest, NextResponse } from 'next/server'
import { getMemberBySessionToken, readMemberTokenFromRequest } from '@/lib/member-portal-auth'
import type { MemberSummary } from '@/lib/members-server'

export async function requireMemberSession(
  req: NextRequest
): Promise<{ member: MemberSummary | null; error: NextResponse | null }> {
  const token = readMemberTokenFromRequest(req)
  const member = await getMemberBySessionToken(token)
  if (!member) {
    return {
      member: null,
      error: NextResponse.json(
        { success: false, message: '로그인이 필요합니다.' },
        { status: 401 }
      ),
    }
  }
  return { member, error: null }
}

