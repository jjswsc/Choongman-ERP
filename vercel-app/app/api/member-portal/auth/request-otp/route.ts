import { NextRequest, NextResponse } from 'next/server'

/** @deprecated SMS OTP — LINE 로그인 / 전화번호+생년월일 사용 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      message: 'SMS OTP 로그인은 종료되었습니다. LINE 로그인 또는 전화번호+생년월일을 이용해 주세요.',
    },
    { status: 410 }
  )
}
