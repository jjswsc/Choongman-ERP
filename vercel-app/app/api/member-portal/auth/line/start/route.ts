import { NextRequest, NextResponse } from 'next/server'
import {
  buildLineAuthorizeUrl,
  buildLineJoinStoreCookie,
  buildLineOAuthStateCookie,
  createLineOAuthState,
  getLineLoginConfigIssue,
  resolveMemberPortalOrigin,
} from '@/lib/member-line-login'
import { isAllowedMemberSignupStoreCode } from '@/lib/member-signup-store'

function isProdLike(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}

export async function GET(req: NextRequest) {
  const issue = getLineLoginConfigIssue()
  if (issue) {
    const code = issue === 'invalid_channel_id' ? 'line_bad_channel_id' : 'line_not_configured'
    return NextResponse.redirect(new URL(`/m?error=${code}`, req.url))
  }

  const joinStore = String(req.nextUrl.searchParams.get('joinStore') || '').trim()
  if (joinStore && !(await isAllowedMemberSignupStoreCode(joinStore))) {
    return NextResponse.redirect(new URL('/m?error=invalid_store', req.url))
  }

  const origin = resolveMemberPortalOrigin(req.nextUrl.origin)
  const state = createLineOAuthState(joinStore || undefined)
  const url = buildLineAuthorizeUrl({ origin, state })
  const secure = isProdLike()
  const res = NextResponse.redirect(url)
  res.headers.append('Set-Cookie', buildLineOAuthStateCookie(state, secure))
  if (joinStore) {
    res.headers.append('Set-Cookie', buildLineJoinStoreCookie(joinStore, secure))
  }
  return res
}
