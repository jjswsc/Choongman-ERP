import { NextRequest } from 'next/server'

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
 * Grab이 파트너 토큰 웹훅으로 받은 Bearer와 동일한 값이어야 함.
 * 설정 시에만 검증; 미설정이면 스텁(경고 로그) — 연동 전 개발용.
 */
export function grabWebhookUnauthorized(req: NextRequest, kind: string): Response | null {
  const expected = process.env.GRAB_PARTNER_ISSUED_ACCESS_TOKEN?.trim()
  if (!expected) {
    logGrabWebhook(kind, req, { auth: 'skipped_no_GRAB_PARTNER_ISSUED_ACCESS_TOKEN' })
    return null
  }
  const auth = req.headers.get('authorization')?.trim() ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  const token = m?.[1]?.trim()
  if (token === expected) return null
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

/**
 * POST /oauth/token (Grab → 파트너)
 * GRAB_OAUTH_CLIENT_ID / GRAB_OAUTH_CLIENT_SECRET 이 있으면 반드시 일치해야 함.
 * 없으면 스텁으로 어떤 client_id도 허용(개발용).
 */
export function grabVerifyPartnerOauthBody(body: PartnerOauthBody): boolean {
  const id = process.env.GRAB_OAUTH_CLIENT_ID?.trim()
  const secret = process.env.GRAB_OAUTH_CLIENT_SECRET?.trim()
  if (id && secret) {
    return body.client_id === id && body.client_secret === secret
  }
  return true
}

export function grabPartnerOauthTokenResponse(): Response {
  const accessToken =
    process.env.GRAB_PARTNER_ISSUED_ACCESS_TOKEN?.trim() || 'dev-stub-token-set-GRAB_PARTNER_ISSUED_ACCESS_TOKEN'
  const payload = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 604799,
  }
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** GET menu 스텁 — Grab 검증용 최소 구조(실연동 시 DB에서 조립). */
export function grabStubMenuJson(merchantID: string, partnerMerchantID: string): unknown {
  const sellingTimeId = 'grab-stub-selling-time'
  const openAllDay = {
    openPeriodType: 'OpenAllDay' as const,
    periods: [] as { startTime: string; endTime: string }[],
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
    sellingTimes: [
      {
        startTime: '2022-01-01 00:00:00',
        endTime: '2035-12-31 23:59:59',
        id: sellingTimeId,
        name: 'Default',
        serviceHours,
      },
    ],
    categories: [
      {
        id: 'grab-stub-category',
        name: 'Stub',
        nameTranslation: {},
        availableStatus: 'AVAILABLE',
        sellingTimeID: sellingTimeId,
        sequence: 1,
        items: [
          {
            id: 'grab-stub-item',
            name: 'POS 연동 전 스텁 메뉴',
            nameTranslation: {},
            availableStatus: 'UNAVAILABLE',
            description: 'Replace with real menu from POS.',
            descriptionTranslation: {},
            price: 100,
            photos: [] as string[],
            specialType: null,
            taxable: false,
            sellingTimeID: sellingTimeId,
            maxStock: 0,
            sequence: 1,
            modifierGroups: [] as unknown[],
          },
        ],
      },
    ],
  }
}
