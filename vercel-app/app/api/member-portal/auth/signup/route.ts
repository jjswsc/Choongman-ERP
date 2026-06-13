import { NextRequest, NextResponse } from 'next/server'
import {
  buildMemberSessionCookie,
  PhoneBirthSignupError,
  registerMemberByPhoneBirthDate,
} from '@/lib/member-portal-auth'

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
      name?: string
      phone?: string
      birthDate?: string
      gender?: string
      joinStoreCode?: string
      consentMarketing?: boolean
      deviceLabel?: string
    }
    const registered = await registerMemberByPhoneBirthDate({
      name: String(body.name || '').trim(),
      phone: String(body.phone || '').trim(),
      birthDate: String(body.birthDate || '').trim(),
      gender: String(body.gender || '').trim(),
      joinStoreCode: String(body.joinStoreCode || '').trim(),
      consentMarketing: Boolean(body.consentMarketing),
      deviceLabel: String(body.deviceLabel || '').trim() || 'member-web',
      userAgent: req.headers.get('user-agent') || '',
      ip: clientIp(req),
    })
    const res = NextResponse.json({
      success: true,
      created: registered.created,
      welcomeCouponIssued: registered.welcomeCouponIssued,
      member: registered.member,
      sessionExpiresAt: registered.expiresAt,
    })
    res.headers.append('Set-Cookie', buildMemberSessionCookie(registered.sessionToken))
    return res
  } catch (e) {
    const code = e instanceof PhoneBirthSignupError ? e.code : 'not_found'
    return NextResponse.json(
      {
        success: false,
        code,
        message: e instanceof Error ? e.message : '회원가입에 실패했습니다.',
      },
      { status: 400 }
    )
  }
}

