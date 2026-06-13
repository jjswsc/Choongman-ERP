import { NextRequest, NextResponse } from 'next/server'
import {
  loadMemberTierUpgradeBasis,
  saveMemberTierUpgradeBasis,
  type MemberTierUpgradeBasis,
} from '@/lib/member-tier-policy'
import { type MemberPointEarnBonusPolicy } from '@/lib/member-point-earn-policy'
import {
  loadMemberPointEarnBonusPolicy,
  saveMemberPointEarnBonusPolicy,
} from '@/lib/member-point-earn-policy-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const [upgradeBasis, earnBonus] = await Promise.all([
      loadMemberTierUpgradeBasis(),
      loadMemberPointEarnBonusPolicy(),
    ])
    return NextResponse.json({ success: true, upgradeBasis, earnBonus }, { headers })
  } catch (e) {
    console.error('GET /api/member-tiers/policy:', e)
    return NextResponse.json(
      {
        success: false,
        upgradeBasis: 'points' satisfies MemberTierUpgradeBasis,
        earnBonus: null as MemberPointEarnBonusPolicy | null,
      },
      { headers }
    )
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'office')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const body = (await req.json()) as { upgradeBasis?: unknown; earnBonus?: unknown }
    let upgradeBasis = await loadMemberTierUpgradeBasis()
    let earnBonus = await loadMemberPointEarnBonusPolicy()
    if (body.upgradeBasis != null) {
      upgradeBasis = await saveMemberTierUpgradeBasis(body.upgradeBasis)
    }
    if (body.earnBonus != null) {
      earnBonus = await saveMemberPointEarnBonusPolicy(body.earnBonus)
    }
    return NextResponse.json({ success: true, upgradeBasis, earnBonus }, { headers })
  } catch (e) {
    console.error('POST /api/member-tiers/policy:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '정책 저장 실패' },
      { headers }
    )
  }
}
