import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { getOaPlusBaseUrl, oaPlusFetch } from '@/lib/oaplus-client'

export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse

  try {
    // Lightweight endpoint from public docs for connectivity check.
    const result = await oaPlusFetch('/audience/v2/group/groups', {
      method: 'GET',
      query: { page: 1, size: 1 },
    })

    return NextResponse.json(
      {
        success: result.ok,
        baseUrl: getOaPlusBaseUrl(),
        status: result.status,
        message: result.ok ? 'OA Plus API 연결 성공' : 'OA Plus API 연결 실패',
        response: result.data,
        rateLimit: {
          perSecond: result.headers['x-ratelimit-limit-second'],
          perMinute: result.headers['x-ratelimit-limit-minute'],
          remainingSecond: result.headers['x-ratelimit-remaining-second'],
          remainingMinute: result.headers['x-ratelimit-remaining-minute'],
        },
        requestId: result.headers['x-line-oap-request-id'] || null,
      },
      { headers, status: result.ok ? 200 : 502 }
    )
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        baseUrl: getOaPlusBaseUrl(),
        message: e instanceof Error ? e.message : 'OA Plus API 연결 확인 실패',
      },
      { headers, status: 500 }
    )
  }
}
