import { NextRequest, NextResponse } from 'next/server'
import { buildMemberTierDiscountRateMap } from '@/lib/member-tier-discount'
import { loadMemberTierDiscountPolicy } from '@/lib/member-tier-discount-policy-server'
import { listMemberTiers } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

/** POS — 등급별 할인율 맵 + 적용 범위 정책 */
export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'any')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const [tiers, discountPolicy] = await Promise.all([listMemberTiers(), loadMemberTierDiscountPolicy()])
    return NextResponse.json({
      success: true,
      rates: buildMemberTierDiscountRateMap(tiers),
      discountPolicy,
    })
  } catch (e) {
    console.error('GET /api/pos/member-tier-rates:', e)
    return NextResponse.json({ success: false, rates: {} }, { status: 400 })
  }
}
