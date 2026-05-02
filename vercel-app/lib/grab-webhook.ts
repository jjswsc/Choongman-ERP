import { NextRequest } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'

function isGrabProductionDeployment(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}

const GRAB_PARTNER_WEBHOOK_JWT_ISSUER = 'cm-erp-grab-partner-webhook'
const GRAB_PARTNER_WEBHOOK_JWT_AUDIENCE = 'grabfood-partner-webhooks'

function getGrabWebhookJwtSecretBytes(): Uint8Array | null {
  const raw =
    process.env.GRAB_PARTNER_WEBHOOK_JWT_SECRET?.trim() ||
    // backward-compatible name (older docs); treat as HS256 secret material
    process.env.GRAB_PARTNER_ISSUED_ACCESS_TOKEN?.trim()
  if (!raw) return null
  return new TextEncoder().encode(raw)
}

function looksLikeJwt(token: string): boolean {
  const parts = token.split('.')
  return parts.length === 3 && parts.every((p) => p.length > 0)
}

/** Grab 문서 권장: 응답 헤더의 요청 ID 로깅 */
export function grabRequestIds(req: NextRequest): Record<string, string | undefined> {
  return {
    'x-request-id': req.headers.get('x-request-id') ?? undefined,
    'x-grabkit-grab-requestid': req.headers.get('x-grabkit-grab-requestid') ?? undefined,
  }
}

export function logGrabWebhook(
  kind: string,
  req: NextRequest,
  extra?: Record<string, unknown>
): void {
  const ids = grabRequestIds(req)
  console.info('[grab-webhook]', kind, { ...ids, ...extra })
}

/**
 * Grab → 파트너 웹훅 Authorization 검증
 *
 * GrabFood POS 연동(Grab 답변 기준):
 * - Grab은 먼저 파트너의 `/oauth/token`에서 access_token을 받고
 * - 이후 웹훅 호출에 `Authorization: Bearer <access_token>`을 사용한다.
 *
 * 우리 구현:
 * - `GRAB_PARTNER_WEBHOOK_JWT_SECRET`(또는 구명칭 `GRAB_PARTNER_ISSUED_ACCESS_TOKEN`)로 HS256 JWT를 발급/검증
 * - 레거시(고정 opaque bearer)도 환경변수가 JWT가 아닌 문자열이면 equality로 허용
 */
export async function grabWebhookUnauthorized(req: NextRequest, kind: string): Promise<Response | null> {
  const secretBytes = getGrabWebhookJwtSecretBytes()
  const legacyOpaque = process.env.GRAB_PARTNER_ISSUED_ACCESS_TOKEN?.trim()

  if (!secretBytes && !legacyOpaque) {
    if (isGrabProductionDeployment()) {
      logGrabWebhook(kind, req, { auth: 'rejected_missing_webhook_token_secret' })
      return new Response(
        JSON.stringify({
          reason: 'misconfigured',
          message:
            'Missing webhook token signing secret. Set GRAB_PARTNER_WEBHOOK_JWT_SECRET (recommended) or legacy GRAB_PARTNER_ISSUED_ACCESS_TOKEN.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    }
    logGrabWebhook(kind, req, { auth: 'skipped_no_GRAB_PARTNER_WEBHOOK_JWT_SECRET' })
    return null
  }

  const auth = req.headers.get('authorization')?.trim() ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  const token = m?.[1]?.trim()
  if (!token) {
    logGrabWebhook(kind, req, { auth: 'rejected_missing_bearer' })
    return new Response(JSON.stringify({ reason: 'unauthorized', message: 'Missing bearer token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Legacy mode: static opaque bearer (older integration notes)
  if (legacyOpaque && token === legacyOpaque) return null

  // Preferred mode: JWT issued by our /oauth/token handler
  if (secretBytes) {
    if (!looksLikeJwt(token)) {
      logGrabWebhook(kind, req, { auth: 'rejected_non_jwt' })
      return new Response(JSON.stringify({ reason: 'unauthorized', message: 'Invalid bearer token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    try {
      await jwtVerify(token, secretBytes, {
        issuer: GRAB_PARTNER_WEBHOOK_JWT_ISSUER,
        audience: GRAB_PARTNER_WEBHOOK_JWT_AUDIENCE,
      })
      return null
    } catch {
      logGrabWebhook(kind, req, { auth: 'rejected_jwt_verify_failed' })
      return new Response(JSON.stringify({ reason: 'unauthorized', message: 'Invalid bearer token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  logGrabWebhook(kind, req, { auth: 'rejected' })
  return new Response(JSON.stringify({ reason: 'unauthorized', message: 'Invalid bearer token' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

type PartnerOauthBody = {
  client_id?: string
  client_secret?: string
  grant_type?: string
  scope?: string
}

export type GrabInboundOauthVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing_inbound_oauth_env' | 'client_credentials_mismatch' }

/**
 * POST /oauth/token (Grab → 파트너)
 * Grab 답변 기준: Developer Portal OAuth client와 별도의 "partner /oauth/token credentials"를 사용한다.
 *
 * 우리 환경변수(우선순위):
 * - `GRAB_INBOUND_OAUTH_CLIENT_ID` / `GRAB_INBOUND_OAUTH_CLIENT_SECRET` (권장)
 * - 없으면 레거시 `GRAB_OAUTH_CLIENT_ID` / `GRAB_OAUTH_CLIENT_SECRET`
 *
 * 로컬에서만 미설정 시 스텁 허용; 운영에서는 클라이언트 자격 증명 필수.
 */
export function verifyGrabInboundOauthBody(body: PartnerOauthBody): GrabInboundOauthVerifyResult {
  const id =
    process.env.GRAB_INBOUND_OAUTH_CLIENT_ID?.trim() || process.env.GRAB_OAUTH_CLIENT_ID?.trim()
  const secret =
    process.env.GRAB_INBOUND_OAUTH_CLIENT_SECRET?.trim() || process.env.GRAB_OAUTH_CLIENT_SECRET?.trim()
  if (id && secret) {
    const ok = String(body.client_id || '') === id && String(body.client_secret || '') === secret
    return ok ? { ok: true } : { ok: false, reason: 'client_credentials_mismatch' }
  }
  if (isGrabProductionDeployment()) {
    return { ok: false, reason: 'missing_inbound_oauth_env' }
  }
  return { ok: true }
}

/** @deprecated 호환용 — `verifyGrabInboundOauthBody` 사용 권장 */
export function grabVerifyPartnerOauthBody(body: PartnerOauthBody): boolean {
  return verifyGrabInboundOauthBody(body).ok
}

export async function grabPartnerOauthTokenResponse(): Promise<Response> {
  const secretBytes = getGrabWebhookJwtSecretBytes()
  const legacyOpaque = process.env.GRAB_PARTNER_ISSUED_ACCESS_TOKEN?.trim()

  if (!secretBytes && !legacyOpaque) {
    if (isGrabProductionDeployment()) {
      return new Response(
        JSON.stringify({
          reason: 'misconfigured',
          message:
            'Missing webhook token signing secret. Set GRAB_PARTNER_WEBHOOK_JWT_SECRET (recommended) or legacy GRAB_PARTNER_ISSUED_ACCESS_TOKEN.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  const expiresInSec = 604800
  const token =
    secretBytes != null
      ? await new SignJWT({ typ: 'grab_partner_webhook' })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuer(GRAB_PARTNER_WEBHOOK_JWT_ISSUER)
          .setAudience(GRAB_PARTNER_WEBHOOK_JWT_AUDIENCE)
          .setIssuedAt()
          .setExpirationTime(`${expiresInSec}s`)
          .sign(secretBytes)
      : legacyOpaque || 'dev-stub-token-set-GRAB_PARTNER_WEBHOOK_JWT_SECRET'

  const payload = {
    access_token: token,
    token_type: 'Bearer',
    expires_in: expiresInSec,
  }
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** GET menu 스텁 — Grab 검증용 최소 구조(실연동 시 DB에서 조립). `sections` 형(메뉴 시뮬레이터 샘플)과 맞춤. */
export function grabStubMenuJson(merchantID: string, partnerMerchantID: string): unknown {
  const openAllDay = {
    openPeriodType: 'OpenAllDay' as const,
  }
  const serviceHours = {
    mon: openAllDay,
    tue: openAllDay,
    wed: openAllDay,
    thu: openAllDay,
    fri: openAllDay,
    sat: openAllDay,
    sun: openAllDay,
  }
  return {
    merchantID,
    partnerMerchantID,
    currency: { code: 'THB', symbol: '฿', exponent: 2 },
    sections: [
      {
        id: 'SECTION-01',
        name: 'Menu',
        sequence: 1,
        serviceHours,
        categories: [
          {
            id: 'grab-stub-category',
            name: 'Stub',
            nameTranslation: {} as Record<string, string>,
            sequence: 1,
            availableStatus: 'AVAILABLE' as const,
            items: [
              {
                id: 'grab-stub-item',
                name: 'POS 연동 전 스텁 메뉴',
                nameTranslation: {} as Record<string, string>,
                sequence: 1,
                availableStatus: 'UNAVAILABLE' as const,
                price: 100,
                campaignInfo: null,
                description: 'Replace with real menu from POS.',
                photos: [] as string[],
                modifierGroups: [] as unknown[],
              },
            ],
          },
        ],
      },
    ],
  }
}
