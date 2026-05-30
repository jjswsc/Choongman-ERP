import { NextRequest, NextResponse } from 'next/server'
import { buildMemberSessionCookie, verifyMemberOtp } from '@/lib/member-portal-auth'

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    ''
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      phone?: string
      otpCode?: string
      deviceLabel?: string
    }
    const verified = await verifyMemberOtp({
      phone: String(body.phone || '').trim(),
      otpCode: String(body.otpCode || '').trim(),
      deviceLabel: String(body.deviceLabel || '').trim(),
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
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : '인증에 실패했습니다.',
      },
      { status: 400 }
    )
  }
}

