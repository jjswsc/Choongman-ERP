import { NextRequest } from 'next/server'
import {
  logShopeeFoodWebhook,
  shopeeFoodGetTokenJsonResponse,
  shopeeFoodIndicatorDenied,
  shopeeFoodVerifyGetTokenBody,
} from '@/lib/shopeefood-webhook'

export const dynamic = 'force-dynamic'

/**
 * ShopeeFood → 벤더: 토큰 발급
 * 등록 URL 예: https://&lt;host&gt;/api/webhooks/shopeefood/&lt;indicator&gt;/gettoken
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ indicator: string }> }
) {
  const { indicator } = await context.params
  const denied = shopeeFoodIndicatorDenied(req, indicator)
  if (denied) return denied

  logShopeeFoodWebhook('gettoken', req, indicator)

  const ct = req.headers.get('content-type') || ''
  let client_id = ''
  let client_secret = ''
  try {
    if (ct.includes('application/x-www-form-urlencoded')) {
      const text = await req.text()
      const sp = new URLSearchParams(text)
      client_id = String(sp.get('client_id') ?? '')
      client_secret = String(sp.get('client_secret') ?? '')
    } else {
      const body = (await req.json()) as Record<string, unknown>
      client_id = String(body.client_id ?? '')
      client_secret = String(body.client_secret ?? '')
    }
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!shopeeFoodVerifyGetTokenBody({ client_id, client_secret })) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return shopeeFoodGetTokenJsonResponse()
}
