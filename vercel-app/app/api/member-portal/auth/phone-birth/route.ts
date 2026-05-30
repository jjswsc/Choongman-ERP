import { NextRequest, NextResponse } from 'next/server'
import { isLineLoginConfigured, getLineLoginConfigIssue } from '@/lib/member-line-login'
import {
  buildMemberSessionCookie,
  PhoneBirthLoginError,
  verifyMemberByPhoneBirthDate,
} from '@/lib/member-portal-auth'

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    ''
  )
}

export async function GET() {
  const issue = getLineLoginConfigIssue()
  return NextResponse.json({
    success: true,
    lineLoginEnabled: isLineLoginConfigured(),
    lineLoginConfigIssue: issue,
    phoneBirthLoginEnabled: true,
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { phone?: string; birthDate?: string; deviceLabel?: string }
    const verified = await verifyMemberByPhoneBirthDate({
      phone: String(body.phone || '').trim(),
      birthDate: String(body.birthDate || '').trim(),
      deviceLabel: String(body.deviceLabel || '').trim() || 'member-web',
      userAgent: req.headers.get('user-agent') || '',
      ip: clientIp(req),
    })
    const res = NextResponse.json({
      success: true,
      member: verified.member,
      sessionExpiresAt: verified.expiresAt,
    })
    res.headers.append('Set-Cookie', buildMemberSessionCookie(verified.sessionToken))
    return res
  } catch (e) {
    const code = e instanceof PhoneBirthLoginError ? e.code : 'not_found'
    return NextResponse.json(
      {
        success: false,
        code,
        message: e instanceof Error ? e.message : '로그인에 실패했습니다.',
      },
      { status: 400 }
    )
  }
}
