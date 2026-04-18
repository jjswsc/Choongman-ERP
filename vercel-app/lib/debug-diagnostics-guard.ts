/**
 * debug-sauces 등 진단 API 보호 — 운영 기본 비활성, 본사 권한 필요.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'

function isProdLike(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}

/** 통과 시 null, 차단 시 NextResponse */
export async function guardDebugDiagnosticsRoute(req: NextRequest): Promise<NextResponse | null> {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  if (isProdLike() && process.env.ALLOW_DEBUG_DIAGNOSTICS !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers })
  }
  const authResult = await requireAuth(req, 'office')
  if (authResult.errorResponse) {
    const res = authResult.errorResponse
    res.headers.set('Access-Control-Allow-Origin', '*')
    return res
  }
  return null
}
