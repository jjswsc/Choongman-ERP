import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'

/**
 * 비밀 값은 노출하지 않고, 서버에 LINE Messaging API용 env가 잡혀 있는지만 알려줍니다.
 */
export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse

  const channelAccessToken = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim()
  const channelSecret = String(process.env.LINE_CHANNEL_SECRET || '').trim()

  return NextResponse.json(
    {
      channelAccessTokenConfigured: channelAccessToken.length > 0,
      channelSecretConfigured: channelSecret.length > 0,
    },
    { headers }
  )
}
