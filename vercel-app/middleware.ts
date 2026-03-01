/**
 * API 인증: /api/* 는 JWT 필수 (로그인용 API 제외)
 * - getLoginData, loginCheck → 인증 없이 허용
 * - loginCheck POST → IP당 분당 요청 제한 (무차별 대입 완화)
 * - 나머지 /api/* → Bearer 또는 cm_token 쿠키로 검증, 실패 시 401
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getVerifiedAuth } from '@/lib/verify-auth'

const PUBLIC_API_PATHS = ['/api/getLoginData', '/api/loginCheck']

const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000
const LOGIN_RATE_LIMIT_MAX = 15
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

function isLoginRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry) return false
  if (now >= entry.resetAt) {
    loginAttempts.delete(ip)
    return false
  }
  return entry.count >= LOGIN_RATE_LIMIT_MAX
}

function recordLoginAttempt(ip: string): void {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || now >= entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS })
    return
  }
  entry.count += 1
}

function corsHeaders(): Record<string, string> {
  const origin = process.env.ALLOWED_ORIGIN || '*'
  return { 'Access-Control-Allow-Origin': origin }
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  if (!path.startsWith('/api/')) {
    return NextResponse.next()
  }

  if (request.method === 'OPTIONS') {
    return NextResponse.next()
  }

  if (path === '/api/loginCheck' && request.method === 'POST') {
    const ip = getClientIp(request)
    if (isLoginRateLimited(ip)) {
      return NextResponse.json(
        { success: false, message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429, headers: corsHeaders() }
      )
    }
    recordLoginAttempt(ip)
  }

  if (PUBLIC_API_PATHS.some((p) => path === p || path.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  const auth = await getVerifiedAuth(request)
  if (!auth) {
    return NextResponse.json(
      { success: false, message: '인증이 필요합니다. 다시 로그인해 주세요.' },
      { status: 401, headers: corsHeaders() }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
