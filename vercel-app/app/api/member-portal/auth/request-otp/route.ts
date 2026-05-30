import { NextRequest, NextResponse } from 'next/server'
import { issueMemberOtp } from '@/lib/member-portal-auth'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { phone?: string }
    const phone = String(body.phone || '').trim()
    const issued = await issueMemberOtp(phone)
    return NextResponse.json({ success: true, expiresAt: issued.expiresAt, debugCode: issued.debugCode })
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : '인증번호 요청에 실패했습니다.',
      },
      { status: 400 }
    )
  }
}

