import { NextRequest, NextResponse } from 'next/server'
import {
  buildLineAuthorizeUrl,
  buildLineOAuthStateCookie,
  createLineOAuthState,
  isLineLoginConfigured,
  resolveMemberPortalOrigin,
} from '@/lib/member-line-login'

function isProdLike(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}

export async function GET(req: NextRequest) {
  if (!isLineLoginConfigured()) {
    return NextResponse.redirect(new URL('/m?error=line_not_configured', req.url))
  }
  const origin = resolveMemberPortalOrigin(req.nextUrl.origin)
  const state = createLineOAuthState()
  const url = buildLineAuthorizeUrl({ origin, state })
  const res = NextResponse.redirect(url)
  res.headers.append('Set-Cookie', buildLineOAuthStateCookie(state, isProdLike()))
  return res
}
