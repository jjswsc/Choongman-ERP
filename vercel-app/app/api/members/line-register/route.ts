import { NextRequest, NextResponse } from 'next/server'
import { registerLineMember } from '@/lib/members-server'

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  try {
    const body = (await req.json()) as {
      lineUserId?: string
      displayName?: string
      pictureUrl?: string
      phone?: string
      email?: string
      name?: string
    }
    const lineUserId = String(body.lineUserId || '').trim()
    if (!lineUserId) {
      return NextResponse.json({ success: false, message: 'lineUserId가 필요합니다.' }, { headers })
    }
    const member = await registerLineMember({
      lineUserId,
      displayName: String(body.displayName || '').trim(),
      pictureUrl: String(body.pictureUrl || '').trim(),
      phone: String(body.phone || '').trim(),
      email: String(body.email || '').trim(),
      name: String(body.name || '').trim(),
    })
    return NextResponse.json({ success: true, member }, { headers })
  } catch (e) {
    console.error('POST /api/members/line-register:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : 'LINE 회원 등록에 실패했습니다.',
      },
      { headers }
    )
  }
}
