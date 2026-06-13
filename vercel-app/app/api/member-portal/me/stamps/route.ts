import { NextRequest, NextResponse } from 'next/server'
import { getMemberStampCardStatus } from '@/lib/member-stamp-card'
import { requireMemberSession } from '@/lib/member-portal-session'

function resolveLang(req: NextRequest): 'ko' | 'en' | 'th' {
  const fromQuery = String(req.nextUrl.searchParams.get('lang') || '').trim().slice(0, 2)
  if (fromQuery === 'ko' || fromQuery === 'en' || fromQuery === 'th') return fromQuery
  const cookie = String(req.cookies.get('member_portal_lang')?.value || '').trim().slice(0, 2)
  if (cookie === 'ko' || cookie === 'en' || cookie === 'th') return cookie
  return 'ko'
}

export async function GET(req: NextRequest) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  try {
    const lang = resolveLang(req)
    const status = await getMemberStampCardStatus(member!.id, lang)
    return NextResponse.json({ success: true, status })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '스탬프 조회 실패' },
      { status: 400 }
    )
  }
}
