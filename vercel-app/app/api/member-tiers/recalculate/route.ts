import { NextRequest, NextResponse } from 'next/server'
import { recalculateAllMemberTiers, recalculateMemberTier } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'office')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const body = (await req.json()) as { memberId?: number }
    const memberId = Number(body.memberId || 0)
    if (memberId > 0) {
      const result = await recalculateMemberTier(memberId)
      return NextResponse.json({ success: true, updated: 1, tierCode: result.tierCode }, { headers })
    }
    const updated = await recalculateAllMemberTiers()
    return NextResponse.json({ success: true, updated }, { headers })
  } catch (e) {
    console.error('POST /api/member-tiers/recalculate:', e)
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '등급 재계산 실패' }, { headers })
  }
}
