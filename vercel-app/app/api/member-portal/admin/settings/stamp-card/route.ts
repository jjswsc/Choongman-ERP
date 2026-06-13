import { NextRequest, NextResponse } from 'next/server'
import {
  listMemberStampMilestones,
  loadMemberStampPolicy,
  normalizeMemberStampPolicy,
  saveMemberStampMilestones,
  saveMemberStampPolicy,
  type MemberStampMilestoneInput,
  type MemberStampPolicy,
} from '@/lib/member-stamp-card'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

function normalizeMilestoneInput(raw: unknown, idx: number): MemberStampMilestoneInput | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const stampCount = Math.trunc(Number(row.stampCount ?? row.stamp_count ?? 0))
  const rewardType = String(row.rewardType ?? row.reward_type ?? 'coupon').trim() === 'points' ? 'points' : 'coupon'
  const rewardPoints = Math.max(0, Math.trunc(Number(row.rewardPoints ?? row.reward_points ?? 0)))
  const couponCode = String(row.couponCode ?? row.coupon_code ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
  if (stampCount <= 0) return null
  if (rewardType === 'points' && rewardPoints <= 0) return null
  if (rewardType === 'coupon' && !couponCode) return null
  return {
    id: Number(row.id || 0) || undefined,
    stampCount,
    rewardType,
    rewardPoints,
    couponCode,
    labelKo: String(row.labelKo ?? row.label_ko ?? '').trim(),
    labelEn: String(row.labelEn ?? row.label_en ?? '').trim(),
    labelTh: String(row.labelTh ?? row.label_th ?? '').trim(),
    sortOrder: Math.trunc(Number(row.sortOrder ?? row.sort_order ?? idx + 1)),
    isActive: row.isActive !== false && row.is_active !== false,
  }
}

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const [policy, milestones] = await Promise.all([loadMemberStampPolicy(), listMemberStampMilestones(true)])
    return NextResponse.json({ success: true, policy, milestones, needsSetup: false })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '설정을 불러오지 못했습니다.'
    const needsSetup = /테이블|relation|does not exist/i.test(msg)
    return NextResponse.json(
      {
        success: false,
        needsSetup,
        message: needsSetup ? 'sql/member_stamp_card.sql 을 Supabase에 먼저 적용해 주세요.' : msg,
      },
      { status: needsSetup ? 200 : 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const body = (await req.json()) as {
      policy?: Partial<MemberStampPolicy>
      milestones?: unknown[]
    }
    const policy = await saveMemberStampPolicy(normalizeMemberStampPolicy(body.policy || {}))
    const milestoneInputs = (Array.isArray(body.milestones) ? body.milestones : [])
      .map((row, idx) => normalizeMilestoneInput(row, idx))
      .filter((row): row is MemberStampMilestoneInput => Boolean(row))
    const milestones = await saveMemberStampMilestones(milestoneInputs)
    return NextResponse.json({ success: true, policy, milestones })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '설정을 저장하지 못했습니다.' },
      { status: 400 }
    )
  }
}
