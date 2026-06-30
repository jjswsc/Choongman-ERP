import {
  ensureMemberReferralCode,
  getMemberSummaryById,
  getMemberTierQualificationPoints,
  getMemberVisits,
  listMemberCouponIssuesForPortalMember,
  listMemberPoints,
  listMemberTiers,
  resolveMemberTierQualificationValue,
} from '@/lib/members-server'
import { computeTierProgress, loadMemberTierUpgradeBasis } from '@/lib/member-tier-policy'
import { isMemberPortalCouponReady } from '@/lib/member-portal-coupon-status'
import { normalizeMemberTierCode } from '@/lib/member-tier-public'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function toText(v: unknown): string {
  return String(v || '').trim()
}

export type MemberPortalDashboard = {
  member: NonNullable<Awaited<ReturnType<typeof getMemberSummaryById>>>
  referralCode: string
  stats: {
    visitCount: number
    lifetimeAmount: number
    avgTicket: number
    availableCoupons: number
    pointsEarnedTotal: number
    tierQualificationPoints: number
  }
  tierProgress: {
    currentTierCode: string
    currentTierName: string
    nextTierCode: string | null
    nextTierName: string | null
    progressPercent: number
    amountToNext: number
    pointRate: number
    upgradeBasis: 'amount' | 'points'
    qualificationValue: number
  }
}

export async function getMemberPortalDashboard(memberId: number): Promise<MemberPortalDashboard> {
  const member = await getMemberSummaryById(memberId)
  if (!member) throw new Error('회원을 찾을 수 없습니다.')

  const referralCode = await ensureMemberReferralCode(memberId)
  const [visits, coupons, points, tiers, upgradeBasis, memberRow] = await Promise.all([
    getMemberVisits({ memberId, limit: 200 }),
    listMemberCouponIssuesForPortalMember(memberId, 100),
    listMemberPoints({ memberId, limit: 200 }),
    listMemberTiers(),
    loadMemberTierUpgradeBasis(),
    supabaseSelectFilter('members', `id=eq.${memberId}`, {
      limit: 1,
      select: 'lifetime_amount,tier_points,line_tier_points',
    }) as Promise<Array<{ lifetime_amount?: number; tier_points?: number; line_tier_points?: number }>>,
  ])

  const visitCount = visits.length
  const visitTotal = visits.reduce((sum, row) => sum + Number(row.total || 0), 0)
  const lifetimeAmount = Math.max(Number(member.lifetimeAmount || 0), visitTotal)
  const avgTicket = visitCount > 0 ? Math.round(visitTotal / visitCount) : 0
  const availableCoupons = coupons.filter((c) => isMemberPortalCouponReady(toText(c.status))).length
  const pointsEarnedTotal = points.filter((p) => Number(p.points) > 0).reduce((s, p) => s + Number(p.points), 0)
  const tierQualificationPoints = await getMemberTierQualificationPoints(memberId)
  const qualificationRow = memberRow?.[0] || {}
  const qualificationValue = resolveMemberTierQualificationValue(
    {
      lifetime_amount: Math.max(Number(qualificationRow.lifetime_amount || 0), lifetimeAmount),
      tier_points: qualificationRow.tier_points,
      line_tier_points: qualificationRow.line_tier_points,
    },
    upgradeBasis
  )

  const sortedTiers = [...tiers].sort((a, b) => {
    const orderDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0)
    if (orderDiff !== 0) return orderDiff
    const pointsDiff = Number(a.min_points || 0) - Number(b.min_points || 0)
    if (pointsDiff !== 0) return pointsDiff
    return Number(a.min_amount || 0) - Number(b.min_amount || 0)
  })
  const currentTierCode = normalizeMemberTierCode(toText(member.tierCode) || 'BRONZE')
  const currentIdx = Math.max(
    0,
    sortedTiers.findIndex((t) => normalizeMemberTierCode(toText(t.code)) === currentTierCode)
  )
  const currentTier = sortedTiers[currentIdx] || sortedTiers[0]
  const progress = computeTierProgress({
    tiers: sortedTiers,
    currentTierCode,
    qualificationValue,
    basis: upgradeBasis,
  })

  return {
    member: { ...member, referralCode, lifetimeAmount },
    referralCode,
    stats: {
      visitCount,
      lifetimeAmount,
      avgTicket,
      availableCoupons,
      pointsEarnedTotal,
      tierQualificationPoints,
    },
    tierProgress: {
      currentTierCode: toText(currentTier?.code) || currentTierCode,
      currentTierName: toText(currentTier?.name) || currentTierCode,
      nextTierCode: progress.nextTierCode,
      nextTierName: progress.nextTierName,
      progressPercent: progress.progressPercent,
      amountToNext: progress.toNext,
      pointRate: Number(currentTier?.point_rate || 0.01),
      upgradeBasis,
      qualificationValue,
    },
  }
}
