import { NextRequest, NextResponse } from 'next/server'
import { getPublicPosQueueTicket } from '@/lib/pos-queue-tickets-server'

type Ctx = { params: Promise<{ token: string }> }

/** 손님 번호표 QR 상태 화면 — 로그인 없음. 번호·인원·상태·앞 팀 수만 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const headers = new Headers({ 'Cache-Control': 'no-store' })
  try {
    const token = String((await ctx.params).token || '')
    const ticket = await getPublicPosQueueTicket(token)
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'not_found' }, { status: 404, headers })
    }
    return NextResponse.json({ success: true, ticket }, { headers })
  } catch {
    return NextResponse.json({ success: false, message: 'server_error' }, { status: 500, headers })
  }
}
