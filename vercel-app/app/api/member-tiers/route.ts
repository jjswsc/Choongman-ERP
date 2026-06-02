import { NextRequest, NextResponse } from 'next/server'
import { loadMemberTierUpgradeBasis } from '@/lib/member-tier-policy'
import { listMemberTiers, saveMemberTier } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const [rows, upgradeBasis] = await Promise.all([listMemberTiers(), loadMemberTierUpgradeBasis()])
    return NextResponse.json({ tiers: rows, upgradeBasis }, { headers })
  } catch (e) {
    console.error('GET /api/member-tiers:', e)
    return NextResponse.json({ tiers: [], upgradeBasis: 'points' }, { headers })
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'office')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const body = (await req.json()) as {
      code?: string
      name?: string
      minAmount?: number
      minPoints?: number
      pointRate?: number
      sortOrder?: number
      benefitsKo?: string
      benefitsEn?: string
      benefitsTh?: string
    }
    await saveMemberTier({
      code: String(body.code || '').trim(),
      name: String(body.name || '').trim(),
      minAmount: Number(body.minAmount || 0),
      minPoints: Number(body.minPoints || 0),
      pointRate: Number(body.pointRate || 0),
      sortOrder: Number(body.sortOrder || 0),
      benefitsKo: String(body.benefitsKo || ''),
      benefitsEn: String(body.benefitsEn || ''),
      benefitsTh: String(body.benefitsTh || ''),
    })
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('POST /api/member-tiers:', e)
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '등급 저장 실패' }, { headers })
  }
}
