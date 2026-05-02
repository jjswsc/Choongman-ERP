import { NextRequest } from 'next/server'
import {
  grabPartnerOauthTokenResponse,
  logGrabWebhook,
  verifyGrabInboundOauthBody,
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
  const inbound = verifyGrabInboundOauthBody({
    client_id: String(body.client_id || ''),
    client_secret: String(body.client_secret || ''),
    grant_type: grantType,
    scope: String(body.scope || ''),
  })
  if (!inbound.ok) {
    const detail =
      inbound.reason === 'missing_inbound_oauth_env'
        ? 'Set GRAB_INBOUND_OAUTH_CLIENT_ID and GRAB_INBOUND_OAUTH_CLIENT_SECRET on the server (same values as Grab Partner OAuth client).'
        : 'Grab client_id/client_secret do not match server env. Copy Partner OAuth credentials into Vercel and redeploy.'
    return new Response(
      JSON.stringify({
        reason: inbound.reason,
        message: 'Invalid client credentials',
        detail,
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
  return await grabPartnerOauthTokenResponse()
}
