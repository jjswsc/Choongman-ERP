import { NextRequest, NextResponse } from 'next/server'
import {
  buildLineJoinStoreClearCookie,
  buildLineOAuthStateClearCookie,
  exchangeLineAuthCode,
  loginMemberWithLineProfile,
  readLineJoinStoreCookie,
  readLineOAuthStateCookie,
  resolveMemberPortalOrigin,
} from '@/lib/member-line-login'
import {
  buildMemberSessionCookie,
  createMemberPortalSessionForMember,
} from '@/lib/member-portal-auth'

function isProdLike(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    ''
  )
}

function redirectWithError(req: NextRequest, code: string): NextResponse {
  const res = NextResponse.redirect(new URL(`/m?error=${encodeURIComponent(code)}`, req.url))
  res.headers.append('Set-Cookie', buildLineOAuthStateClearCookie(isProdLike()))
  res.headers.append('Set-Cookie', buildLineJoinStoreClearCookie(isProdLike()))
  return res
}

function buildSuccessRedirect(req: NextRequest, params: { friendshipStatusChanged?: boolean; friendFlag?: boolean | null }) {
  const url = new URL('/m', req.url)
  if (params.friendshipStatusChanged) {
    url.searchParams.set('line_friend', 'added')
  } else if (params.friendFlag) {
    url.searchParams.set('line_friend', 'connected')
  }
  return url
}

export async function GET(req: NextRequest) {
  const secure = isProdLike()
  const state = String(req.nextUrl.searchParams.get('state') || '').trim()
  const code = String(req.nextUrl.searchParams.get('code') || '').trim()
  const oauthError = String(req.nextUrl.searchParams.get('error') || '').trim()
  const friendshipStatusChanged = String(req.nextUrl.searchParams.get('friendship_status_changed') || '').trim() === 'true'
  const cookieState = readLineOAuthStateCookie(req.headers.get('cookie'))

  if (oauthError) return redirectWithError(req, oauthError)
  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectWithError(req, 'line_state_mismatch')
  }

  try {
    const origin = resolveMemberPortalOrigin(req.nextUrl.origin)
    const joinStoreCode = readLineJoinStoreCookie(req.headers.get('cookie'))
    const { profile, friendFlag } = await exchangeLineAuthCode({ code, origin })
    const member = await loginMemberWithLineProfile(profile, {
      friendFlag,
      friendshipStatusChanged,
      joinStoreCode,
    })
    const session = await createMemberPortalSessionForMember({
      member,
      deviceLabel: 'line-login',
      userAgent: req.headers.get('user-agent') || '',
      ip: clientIp(req),
    })
    const res = NextResponse.redirect(buildSuccessRedirect(req, { friendshipStatusChanged, friendFlag }))
    res.headers.append('Set-Cookie', buildMemberSessionCookie(session.sessionToken))
    res.headers.append('Set-Cookie', buildLineOAuthStateClearCookie(secure))
    res.headers.append('Set-Cookie', buildLineJoinStoreClearCookie(secure))
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'line_login_failed'
    if (msg === 'missing_store' || msg === 'invalid_store') {
      return redirectWithError(req, msg)
    }
    return redirectWithError(req, msg.slice(0, 120))
  }
}
