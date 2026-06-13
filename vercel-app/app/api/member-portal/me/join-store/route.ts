import { NextRequest, NextResponse } from 'next/server'
import { getMemberSummaryById } from '@/lib/members-server'
import { isAllowedMemberSignupStoreCode, setMemberJoinStoreCodeOnce } from '@/lib/member-signup-store'
import { requireMemberSession } from '@/lib/member-portal-session'

export async function POST(req: NextRequest) {
  const session = await requireMemberSession(req)
  if (session.error) return session.error
  try {
    const body = (await req.json()) as { joinStoreCode?: string }
    const joinStoreCode = String(body.joinStoreCode || '').trim()
    if (!joinStoreCode) {
      return NextResponse.json({ success: false, code: 'missing_store' }, { status: 400 })
    }
    if (!(await isAllowedMemberSignupStoreCode(joinStoreCode))) {
      return NextResponse.json({ success: false, code: 'invalid_store' }, { status: 400 })
    }
    const memberId = Number(session.member?.id || 0)
    await setMemberJoinStoreCodeOnce({ memberId, joinStoreCode })
    const member = await getMemberSummaryById(memberId)
    if (!member) {
      return NextResponse.json({ success: false, code: 'member_not_found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, member })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'save_failed'
    const code =
      msg === 'join_store_already_set'
        ? 'join_store_already_set'
        : msg === 'invalid_store'
          ? 'invalid_store'
          : msg === 'member_not_found'
            ? 'member_not_found'
            : 'save_failed'
    return NextResponse.json({ success: false, code, message: msg }, { status: 400 })
  }
}
