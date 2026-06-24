import { NextRequest, NextResponse } from 'next/server'

export function isVercelCronRequest(req: NextRequest): boolean {
  return String(req.headers.get('user-agent') || '')
    .toLowerCase()
    .includes('vercel-cron')
}

export function readCronBearerToken(req: NextRequest): string {
  const auth = String(req.headers.get('authorization') || '').trim()
  if (!auth) return ''
  return auth.replace(/^Bearer\s+/i, '').trim()
}

export function isCronAuthorized(req: NextRequest): boolean {
  const secret = String(process.env.CRON_SECRET || '').trim()
  if (!secret) return false
  return readCronBearerToken(req) === secret
}

/**
 * Vercel Cron(UA vercel-cron)인데 Bearer 인증이 실패하면 원인별 응답.
 * 통과(또는 Cron이 아님)면 null.
 */
export function cronAuthErrorResponse(
  req: NextRequest,
  headers?: HeadersInit
): NextResponse | null {
  if (!isVercelCronRequest(req)) return null
  if (isCronAuthorized(req)) return null

  const secret = String(process.env.CRON_SECRET || '').trim()
  if (!secret) {
    return NextResponse.json(
      {
        success: false,
        message:
          'CRON_SECRET is not set for this deployment. Add it in Vercel → Project Settings → Environment Variables (Production), then redeploy.',
      },
      { status: 503, headers }
    )
  }

  return NextResponse.json(
    {
      success: false,
      message:
        'Cron authorization failed. CRON_SECRET must match Authorization Bearer (redeploy after changing the variable; avoid special characters in the secret).',
    },
    { status: 401, headers }
  )
}
