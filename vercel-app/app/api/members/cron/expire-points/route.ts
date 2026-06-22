import { NextRequest, NextResponse } from 'next/server'
import { expireMemberPointsBatch } from '@/lib/member-point-expiry-server'
import { loadMemberPointRetentionYears } from '@/lib/member-point-expiry-policy-server'
import { requireAuth } from '@/lib/verify-auth'

export const maxDuration = 120

function isCronAuthorized(req: NextRequest): boolean {
  const secret = String(process.env.CRON_SECRET || '').trim()
  if (!secret) return false
  const auth = String(req.headers.get('authorization') || '').trim()
  return auth === `Bearer ${secret}`
}

/** 매일 — 관리자 설정 기간(년) 지난 포인트 자동 소멸·등급 재산정 */
export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })

  const fromCron = isCronAuthorized(req)
  if (!fromCron) {
    const authRes = await requireAuth(req, 'manager')
    if (authRes.errorResponse) return authRes.errorResponse
  }

  try {
    const limitRaw = req.nextUrl.searchParams.get('limit')
    const limit = limitRaw ? Number(limitRaw) : undefined
    const [result, retentionYears] = await Promise.all([
      expireMemberPointsBatch({ limit }),
      loadMemberPointRetentionYears(),
    ])
    return NextResponse.json(
      {
        success: true,
        retentionYears,
        ...result,
      },
      { headers }
    )
  } catch (e) {
    console.error('GET /api/members/cron/expire-points:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : '포인트 소멸 배치에 실패했습니다.',
      },
      { status: 400, headers }
    )
  }
}
