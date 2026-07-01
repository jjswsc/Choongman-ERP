import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { resolveCanManageOfficePayrollAuth } from '@/lib/office-payroll-auth-server'

/** 오피스 급여 담당 권한 — DB 플래그 재확인(로그인·JWT 갱신 전 세션 보강) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const resolved = await resolveCanManageOfficePayrollAuth(authResult.auth)
  return NextResponse.json(
    { success: true, canManageOfficePayroll: resolved.canManageOfficePayroll === true },
    { headers }
  )
}

export async function OPTIONS() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return new NextResponse(null, { status: 204, headers })
}
