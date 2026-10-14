import { NextRequest, NextResponse } from 'next/server'
import { getMemberBySessionToken, readMemberTokenFromRequest } from '@/lib/member-portal-auth'
import { isAllowedMemberSignupStoreCode } from '@/lib/member-signup-store'
import { buildPosQueueLinkClearCookie, buildPosQueueLinkCookie } from '@/lib/pos-queue-link-cookie'
import { getPosQueueTicketByToken, linkPosQueueTicketToMember } from '@/lib/pos-queue-tickets-server'

type Ctx = { params: Promise<{ token: string }> }

function isProdLike(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}

/**
 * 손님 번호표 → 회원(LINE) 연결.
 * 회원 세션이 있으면 바로 연결 후 /q/<token> 으로, 없으면 단기 쿠키를 남기고 LINE 로그인으로 보낸다.
 * LINE 콜백이 쿠키를 보고 이 경로로 다시 돌려보낸다.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const secure = isProdLike()
  const token = String((await ctx.params).token || '')
  const ticket = await getPosQueueTicketByToken(token).catch(() => null)
  if (!ticket) return NextResponse.redirect(new URL('/m', req.url))
  const back = new URL(`/q/${encodeURIComponent(ticket.publicToken)}`, req.url)

  const member = await getMemberBySessionToken(readMemberTokenFromRequest(req)).catch(() => null)
  if (member?.id) {
    const result = await linkPosQueueTicketToMember(ticket, Number(member.id)).catch(() => 'closed' as const)
    back.searchParams.set('linked', result === 'linked' || result === 'already' ? '1' : '0')
    const res = NextResponse.redirect(back)
    res.headers.append('Set-Cookie', buildPosQueueLinkClearCookie(secure))
    return res
  }

  const start = new URL('/api/member-portal/auth/line/start', req.url)
  if (await isAllowedMemberSignupStoreCode(ticket.storeCode).catch(() => false)) {
    start.searchParams.set('joinStore', ticket.storeCode)
  }
  const res = NextResponse.redirect(start)
  res.headers.append('Set-Cookie', buildPosQueueLinkCookie(ticket.publicToken, secure))
  return res
}
