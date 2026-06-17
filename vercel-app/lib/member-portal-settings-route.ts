import { NextResponse } from 'next/server'

/**
 * CMS·회원앱 설정 API 응답 — CDN/Next 정적 캐시 금지.
 * Route 파일에서는 `export const dynamic = 'force-dynamic'`, `revalidate = 0` 을
 * 리터럴로 직접 export (Next.js는 import 상수를 segment config에 쓸 수 없음).
 */
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
