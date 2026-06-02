import { NextRequest, NextResponse } from 'next/server'
import {
  loadMemberTierUpgradeBasis,
  saveMemberTierUpgradeBasis,
  type MemberTierUpgradeBasis,
} from '@/lib/member-tier-policy'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const upgradeBasis = await loadMemberTierUpgradeBasis()
    return NextResponse.json({ success: true, upgradeBasis }, { headers })
  } catch (e) {
    console.error('GET /api/member-tiers/policy:', e)
    return NextResponse.json(
      { success: false, upgradeBasis: 'points' satisfies MemberTierUpgradeBasis },
      { headers }
    )
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'office')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const body = (await req.json()) as { upgradeBasis?: unknown }
    const upgradeBasis = await saveMemberTierUpgradeBasis(body.upgradeBasis)
    return NextResponse.json({ success: true, upgradeBasis }, { headers })
  } catch (e) {
    console.error('POST /api/member-tiers/policy:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '승급 기준 저장 실패' },
      { headers }
    )
  }
}
