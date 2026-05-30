import { NextRequest, NextResponse } from 'next/server'
import {
  buildLineAuthorizeUrl,
  buildLineOAuthStateCookie,
  createLineOAuthState,
  getLineLoginConfigIssue,
  resolveMemberPortalOrigin,
} from '@/lib/member-line-login'

function isProdLike(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}

export async function GET(req: NextRequest) {
  const issue = getLineLoginConfigIssue()
  if (issue) {
    const code = issue === 'invalid_channel_id' ? 'line_bad_channel_id' : 'line_not_configured'
    return NextResponse.redirect(new URL(`/m?error=${code}`, req.url))
  }
  const origin = resolveMemberPortalOrigin(req.nextUrl.origin)
  const state = createLineOAuthState()
  const url = buildLineAuthorizeUrl({ origin, state })
  const res = NextResponse.redirect(url)
  res.headers.append('Set-Cookie', buildLineOAuthStateCookie(state, isProdLike()))
  return res
}
