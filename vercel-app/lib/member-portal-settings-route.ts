import { NextResponse } from 'next/server'

/** CMS·회원앱 설정 API — CDN/Next 정적 캐시 금지 */
export function memberPortalSettingsJsonResponse(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}

export const MEMBER_PORTAL_SETTINGS_ROUTE_DYNAMIC = 'force-dynamic' as const
export const MEMBER_PORTAL_SETTINGS_ROUTE_REVALIDATE = 0
