import { NextRequest, NextResponse } from 'next/server'
import {
  LinkLinePhoneBirthError,
  buildMemberSessionCookie,
  linkLineMemberToPhoneBirth,
} from '@/lib/member-portal-auth'
import { requireMemberSession } from '@/lib/member-portal-session'

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    ''
  )
}

export async function POST(req: NextRequest) {
  const session = await requireMemberSession(req)
  if (session.error) return session.error
  try {
    const body = (await req.json()) as { phone?: string; birthDate?: string }
    const result = await linkLineMemberToPhoneBirth({
      lineMemberId: Number(session.member?.id || 0),
      phone: String(body.phone || '').trim(),
      birthDate: String(body.birthDate || '').trim(),
      deviceLabel: 'line-phone-link',
      userAgent: req.headers.get('user-agent') || '',
      ip: clientIp(req),
    })
    const res = NextResponse.json({
      success: true,
      member: result.member,
      merged: result.merged,
    })
    res.headers.append('Set-Cookie', buildMemberSessionCookie(result.sessionToken))
    return res
  } catch (e) {
    if (e instanceof LinkLinePhoneBirthError) {
      return NextResponse.json({ success: false, code: e.code, message: e.message }, { status: 400 })
    }
    const msg = e instanceof Error ? e.message : 'save_failed'
    return NextResponse.json({ success: false, code: 'save_failed', message: msg }, { status: 500 })
  }
}
