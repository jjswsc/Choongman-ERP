import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { signToken, type JwtPayload } from '@/lib/jwt-auth'
import { buildSetAuthCookieHeader } from '@/lib/auth-cookie'

function corsHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return headers
}

function signPayloadFromAuth(auth: JwtPayload): JwtPayload {
  return {
    store: auth.store,
    name: auth.name,
    role: auth.role,
    ...(auth.tenantId ? { tenantId: auth.tenantId } : {}),
    ...(auth.company ? { company: auth.company } : {}),
    ...(auth.employeeId != null && auth.employeeId > 0 ? { employeeId: auth.employeeId } : {}),
    ...(auth.employeeCode ? { employeeCode: auth.employeeCode } : {}),
    ...(auth.allowedStores && auth.allowedStores.length > 0 ? { allowedStores: auth.allowedStores } : {}),
    ...(auth.canManageOfficePayroll ? { canManageOfficePayroll: true } : {}),
  }
}

/** 유효한 세션이면 JWT·쿠키를 다시 발급해 만료를 밀어 준다. */
export async function POST(request: NextRequest) {
  const headers = corsHeaders()
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const token = await signToken(signPayloadFromAuth(authResult.auth))
  headers.append('Set-Cookie', buildSetAuthCookieHeader(token))
  return NextResponse.json({ success: true, token }, { headers })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}
