import {
  ensureMemberReferralCode,
  getMemberSummaryById,
  getMemberVisits,
  listMemberCouponIssues,
  listMemberPoints,
  listMemberTiers,
} from '@/lib/members-server'

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
  }
  tierProgress: {
    currentTierCode: string
    currentTierName: string
    nextTierCode: string | null
    nextTierName: string | null
    progressPercent: number
    amountToNext: number
    pointRate: number
  }
}

export async function getMemberPortalDashboard(memberId: number): Promise<MemberPortalDashboard> {
  const member = await getMemberSummaryById(memberId)
  if (!member) throw new Error('회원을 찾을 수 없습니다.')

  const referralCode = await ensureMemberReferralCode(memberId)
  const [visits, coupons, points, tiers] = await Promise.all([
    getMemberVisits({ memberId, limit: 200 }),
    listMemberCouponIssues({ memberId, limit: 100 }),
    listMemberPoints({ memberId, limit: 200 }),
    listMemberTiers(),
  ])

  const visitCount = visits.length
  const visitTotal = visits.reduce((sum, row) => sum + Number(row.total || 0), 0)
  const lifetimeAmount = Math.max(Number(member.lifetimeAmount || 0), visitTotal)
  const avgTicket = visitCount > 0 ? Math.round(visitTotal / visitCount) : 0
  const availableCoupons = coupons.filter((c) => toText(c.status) === 'issued').length
  const pointsEarnedTotal = points.filter((p) => Number(p.points) > 0).reduce((s, p) => s + Number(p.points), 0)

  const sortedTiers = [...tiers].sort((a, b) => Number(a.min_amount || 0) - Number(b.min_amount || 0))
  const currentTierCode = toText(member.tierCode) || 'BRONZE'
  const currentIdx = Math.max(
    0,
    sortedTiers.findIndex((t) => toText(t.code).toUpperCase() === currentTierCode.toUpperCase())
  )
  const currentTier = sortedTiers[currentIdx] || sortedTiers[0]
  const nextTier = sortedTiers[currentIdx + 1] || null
  const currentMin = Number(currentTier?.min_amount || 0)
  const nextMin = nextTier ? Number(nextTier.min_amount || 0) : currentMin
  const span = Math.max(1, nextMin - currentMin)
  const progressPercent = nextTier
    ? Math.min(100, Math.max(0, ((lifetimeAmount - currentMin) / span) * 100))
    : 100
  const amountToNext = nextTier ? Math.max(0, nextMin - lifetimeAmount) : 0

  return {
    member: { ...member, referralCode, lifetimeAmount },
    referralCode,
    stats: {
      visitCount,
      lifetimeAmount,
      avgTicket,
      availableCoupons,
      pointsEarnedTotal,
    },
    tierProgress: {
      currentTierCode: toText(currentTier?.code) || currentTierCode,
      currentTierName: toText(currentTier?.name) || currentTierCode,
      nextTierCode: nextTier ? toText(nextTier.code) : null,
      nextTierName: nextTier ? toText(nextTier.name) : null,
      progressPercent: Math.round(progressPercent),
      amountToNext: Math.round(amountToNext),
      pointRate: Number(currentTier?.point_rate || 0.01),
    },
  }
}
