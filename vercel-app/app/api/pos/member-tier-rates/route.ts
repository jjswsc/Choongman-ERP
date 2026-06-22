import { NextRequest, NextResponse } from 'next/server'
import { buildMemberTierDiscountRateMap } from '@/lib/member-tier-discount'
import { listMemberTiers } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

/** POS — 등급별 할인율 맵 (회원 연결 시 자동 할인) */
export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'any')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const tiers = await listMemberTiers()
    return NextResponse.json({
      success: true,
      rates: buildMemberTierDiscountRateMap(tiers),
    })
  } catch (e) {
    console.error('GET /api/pos/member-tier-rates:', e)
    return NextResponse.json({ success: false, rates: {} }, { status: 400 })
  }
}
