import { NextRequest, NextResponse } from 'next/server'
import {
  buildMemberLogoutCookie,
  readMemberTokenFromRequest,
  revokeMemberSession,
} from '@/lib/member-portal-auth'

export async function POST(req: NextRequest) {
  const token = readMemberTokenFromRequest(req)
  await revokeMemberSession(token)
  const res = NextResponse.json({ success: true })
  res.headers.append('Set-Cookie', buildMemberLogoutCookie())
  return res
}

