import { NextRequest } from 'next/server'
import {
  grabPartnerOauthTokenResponse,
  grabVerifyPartnerOauthBody,
  logGrabWebhook,
} from '@/lib/grab-webhook'

export const dynamic = 'force-dynamic'

/**
 * Grab → 파트너: Get partner OAuth access token
 * 등록 예: https://<host>/api/webhooks/grab/oauth/token
 */
export async function POST(req: NextRequest) {
  logGrabWebhook('oauth_token', req)
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return new Response(JSON.stringify({ reason: 'invalid_body', message: 'Expected JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const grantType = String(body.grant_type || '')
  if (grantType !== 'client_credentials') {
    return new Response(JSON.stringify({ reason: 'invalid_grant', message: 'grant_type must be client_credentials' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!grabVerifyPartnerOauthBody({
    client_id: String(body.client_id || ''),
    client_secret: String(body.client_secret || ''),
    grant_type: grantType,
    scope: String(body.scope || ''),
  })) {
    return new Response(JSON.stringify({ reason: 'unauthorized', message: 'Invalid client credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return grabPartnerOauthTokenResponse()
}
