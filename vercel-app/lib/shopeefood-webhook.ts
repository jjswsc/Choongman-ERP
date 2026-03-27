import { NextRequest } from 'next/server'

/** ShopeeFood → 벤더 웹훅 공통 (OpenAPI 문서 Vendor API Requirements) */

export function logShopeeFoodEvent(kind: string, indicator: string, extra?: Record<string, unknown>): void {
  console.info('[shopeefood-webhook]', kind, { indicator, ...extra })
}

export function logShopeeFoodWebhook(
  kind: string,
  req: NextRequest,
  indicator: string,
  extra?: Record<string, unknown>
): void {
  logShopeeFoodEvent(kind, indicator, { path: req.nextUrl?.pathname, ...extra })
}

/** 등록한 indicator와 일치하는지 검사. SHOPEEFOOD_WEBHOOK_INDICATOR 미설정 시 개발용으로 통과 */
export function shopeeFoodIndicatorDenied(
  req: NextRequest,
  indicatorFromPath: string
): Response | null {
  const expected = process.env.SHOPEEFOOD_WEBHOOK_INDICATOR?.trim()
  if (!expected) {
    logShopeeFoodWebhook('indicator_check', req, indicatorFromPath, { skipped: true })
    return null
  }
  if (expected === String(indicatorFromPath || '').trim()) return null
  logShopeeFoodWebhook('indicator_check', req, indicatorFromPath, { rejected: true })
  return new Response(JSON.stringify({ code: 1310002, message: 'invalid indicator' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Shopee가 gettoken 이후 호출 시 사용하는 Bearer.
 * SHOPEEFOOD_PARTNER_ISSUED_ACCESS_TOKEN 미설정 시 검증 생략(개발용, 경고 로그).
 */
export function shopeeFoodBearerUnauthorized(
  req: NextRequest,
  kind: string,
  indicator: string
): Response | null {
  const expected = process.env.SHOPEEFOOD_PARTNER_ISSUED_ACCESS_TOKEN?.trim()
  if (!expected) {
    logShopeeFoodWebhook(kind, req, indicator, { auth: 'skipped_no_SHOPEEFOOD_PARTNER_ISSUED_ACCESS_TOKEN' })
    return null
  }
  const auth = req.headers.get('authorization')?.trim() ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  const token = m?.[1]?.trim()
  if (token === expected) return null
  logShopeeFoodWebhook(kind, req, indicator, { auth: 'rejected' })
  return new Response(JSON.stringify({ code: 1310001, message: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

export type ShopeeGetTokenBody = {
  client_id?: string
  client_secret?: string
}

/** Shopee가 벤더 gettoken 호출 시 보내는 client_id / client_secret (벤더가 Shopee에 발급) */
export function shopeeFoodVerifyGetTokenBody(body: ShopeeGetTokenBody): boolean {
  const id = process.env.SHOPEEFOOD_SHOPEE_CLIENT_ID?.trim()
  const secret = process.env.SHOPEEFOOD_SHOPEE_CLIENT_SECRET?.trim()
  if (id && secret) {
    return body.client_id === id && body.client_secret === secret
  }
  return true
}

export function shopeeFoodGetTokenJsonResponse(): Response {
  const accessToken =
    process.env.SHOPEEFOOD_PARTNER_ISSUED_ACCESS_TOKEN?.trim() ||
    'dev-set-SHOPEEFOOD_PARTNER_ISSUED_ACCESS_TOKEN'
  const expiresIn = Math.max(60, Number(process.env.SHOPEEFOOD_PARTNER_TOKEN_EXPIRES_SEC ?? 3600) || 3600)
  return new Response(JSON.stringify({ access_token: accessToken, expires_in: expiresIn }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 문서 예시: { "code": 0, "message": "success" } */
export function shopeeFoodVendorAckJson(code: number, message: string): Response {
  return new Response(JSON.stringify({ code, message }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
