import { NextRequest, NextResponse } from 'next/server'
import { listMemberSignupStoreOptions, MEMBER_SIGNUP_OFFICE_STORE_CODE } from '@/lib/member-signup-store'

export async function GET(req: NextRequest) {
  try {
    const lang = String(req.nextUrl.searchParams.get('lang') || 'ko').trim()
    const stores = await listMemberSignupStoreOptions(lang, { request: req })
    return NextResponse.json({
      success: true,
      officeStoreCode: MEMBER_SIGNUP_OFFICE_STORE_CODE,
      stores,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '매장 목록을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}
