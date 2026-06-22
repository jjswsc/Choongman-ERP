import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import {
  computeMemberPointExpiryState,
  getMemberPointRetentionCutoffIso,
  type MemberPointLedgerEntry,
} from '@/lib/member-point-expiry'
import { loadMemberPointRetentionYears } from '@/lib/member-point-expiry-policy-server'
import { recalculateMemberTier } from '@/lib/members-server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

type MemberRow = {
  id?: number
  point_balance?: number | null
  tier_points?: number | null
}

export async function expireMemberPointsForMember(
  memberId: number,
  cutoffIso?: string
): Promise<{ expired: number; tierPoints: number; pointBalance: number; tierRecalculated: boolean }> {
  const id = Math.max(0, Math.trunc(Number(memberId || 0)))
  if (!id) return { expired: 0, tierPoints: 0, pointBalance: 0, tierRecalculated: false }

  const years = await loadMemberPointRetentionYears()
  const resolvedCutoff = cutoffIso || getMemberPointRetentionCutoffIso(new Date(), years)

  const members = (await supabaseSelectFilter('members', `id=eq.${id}`, { limit: 1 })) as MemberRow[]
  const member = members?.[0]
  if (!member) return { expired: 0, tierPoints: 0, pointBalance: 0, tierRecalculated: false }

  const ledger = (await supabaseSelectFilter('member_points_ledger', `member_id=eq.${id}`, {
    order: 'created_at.asc,id.asc',
    limit: 50000,
    select: 'id,kind,points,created_at',
  })) as MemberPointLedgerEntry[]

  const { tierPoints, pointBalance, expirePoints } = computeMemberPointExpiryState(ledger || [], resolvedCutoff)
  const prevBalance = Math.max(0, Math.trunc(Number(member.point_balance || 0)))
  const prevTierPoints = Math.max(0, Math.trunc(Number(member.tier_points || 0)))

  const needsExpireLedger = expirePoints > 0
  const needsMemberUpdate = prevBalance !== pointBalance || prevTierPoints !== tierPoints

  if (!needsExpireLedger && !needsMemberUpdate) {
    return { expired: 0, tierPoints, pointBalance, tierRecalculated: false }
  }

  if (needsExpireLedger) {
    await supabaseInsert('member_points_ledger', {
      member_id: id,
      order_id: null,
      kind: 'expire',
      points: -expirePoints,
      amount: 0,
      note: `auto_expire_${years}y`,
      created_at: getBangkokDateTimeString(),
    })
  }

  if (needsMemberUpdate) {
    await supabaseUpdateByFilter('members', `id=eq.${id}`, {
      point_balance: pointBalance,
      tier_points: tierPoints,
      updated_at: getBangkokDateTimeString(),
    })
    await recalculateMemberTier(id)
    return { expired: expirePoints, tierPoints, pointBalance, tierRecalculated: true }
  }

  return { expired: expirePoints, tierPoints, pointBalance, tierRecalculated: false }
}

export async function expireMemberPointsBatch(params?: {
  limit?: number
  cutoffIso?: string
}): Promise<{ processed: number; expiredTotal: number; recalculated: number }> {
  const limit = Math.max(1, Math.min(Number(params?.limit || 500), 5000))
  const years = await loadMemberPointRetentionYears()
  const cutoffIso = params?.cutoffIso || getMemberPointRetentionCutoffIso(new Date(), years)

  const rows = (await supabaseSelectFilter(
    'members',
    `or=(point_balance.gt.0,tier_points.gt.0)`,
    { order: 'id.asc', limit, select: 'id' }
  )) as Array<{ id?: number }>

  let processed = 0
  let expiredTotal = 0
  let recalculated = 0

  for (const row of rows || []) {
    const id = Number(row.id || 0)
    if (!id) continue
    const result = await expireMemberPointsForMember(id, cutoffIso)
    processed += 1
    expiredTotal += result.expired
    if (result.tierRecalculated) recalculated += 1
  }

  return { processed, expiredTotal, recalculated }
}
