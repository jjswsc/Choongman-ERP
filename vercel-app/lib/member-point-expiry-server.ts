import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import {
  computeMemberPointExpiryState,
  getMemberPointRetentionCutoffIso,
  planLineOpeningLedgerRows,
  resolveLineOpeningCreatedAt,
  type MemberPointLedgerEntry,
} from '@/lib/member-point-expiry'
import {
  loadMemberPointExpiryBatchCursor,
  loadMemberPointRetentionYears,
  resetMemberPointExpiryBatchCursor,
  saveMemberPointExpiryBatchCursor,
} from '@/lib/member-point-expiry-policy-server'
import {
  buildMembersWithPointsBatchFilter,
  MEMBER_POINT_EXPIRY_BATCH_DEFAULT_MAX,
  MEMBER_POINT_EXPIRY_BATCH_PAGE_SIZE,
} from '@/lib/member-point-expiry-batch'
import { roundMemberPointsEarn } from '@/lib/member-points-math'
import { recalculateMemberTier } from '@/lib/members-server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

type MemberRow = {
  id?: number
  status?: string | null
  point_balance?: number | null
  tier_points?: number | null
  line_current_points?: number | null
  line_total_points?: number | null
  line_tier_points?: number | null
  line_exported_at?: string | null
}

type LedgerRow = MemberPointLedgerEntry & { note?: string | null }

async function loadLedger(memberId: number): Promise<LedgerRow[]> {
  return ((await supabaseSelectFilter('member_points_ledger', `member_id=eq.${memberId}`, {
    order: 'created_at.asc,id.asc',
    limit: 50000,
    select: 'id,kind,points,note,created_at',
  })) || []) as LedgerRow[]
}

/** LINE CRM 이월 포인트가 원장에 없으면 추가 — 없으면 아래 원장 재생이 이월분을 지운다 */
async function syncLineOpeningLedger(
  member: MemberRow,
  ledger: LedgerRow[],
  cutoffIso: string
): Promise<boolean> {
  const id = Number(member.id || 0)
  if (!id) return false
  const lineTier = Number(member.line_tier_points || 0) > 0 ? member.line_tier_points : member.line_total_points
  const rows = planLineOpeningLedgerRows({
    lineCurrentPoints: member.line_current_points,
    lineTierPoints: lineTier,
    ledger,
  })
  if (rows.length === 0) return false
  const createdAt = resolveLineOpeningCreatedAt({
    lineExportedAt: member.line_exported_at,
    earliestLedgerAt: ledger[0]?.created_at,
    cutoffIso,
    now: getBangkokDateTimeString(),
  })
  for (const row of rows) {
    await supabaseInsert('member_points_ledger', {
      member_id: id,
      order_id: null,
      kind: 'adjust',
      points: row.points,
      amount: 0,
      note: row.note,
      created_at: createdAt,
    })
  }
  return true
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
  if (String(member.status || '').trim() === 'inactive') {
    return { expired: 0, tierPoints: 0, pointBalance: 0, tierRecalculated: false }
  }

  let ledger = await loadLedger(id)
  if (await syncLineOpeningLedger(member, ledger, resolvedCutoff)) {
    ledger = await loadLedger(id)
  }

  const { tierPoints, pointBalance, expirePoints } = computeMemberPointExpiryState(ledger, resolvedCutoff)
  const prevBalance = roundMemberPointsEarn(member.point_balance)
  const prevTierPoints = roundMemberPointsEarn(member.tier_points)

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
  /** 이번 cron 호출에서 처리할 회원 수 상한 (전체 순회는 커서로 며칠에 나눠 진행) */
  limit?: number
  cutoffIso?: string
}): Promise<{ processed: number; expiredTotal: number; recalculated: number; hasMore: boolean }> {
  const maxMembers = Math.max(
    1,
    Math.min(Number(params?.limit || MEMBER_POINT_EXPIRY_BATCH_DEFAULT_MAX), 50_000)
  )
  const years = await loadMemberPointRetentionYears()
  const cutoffIso = params?.cutoffIso || getMemberPointRetentionCutoffIso(new Date(), years)

  let afterId = await loadMemberPointExpiryBatchCursor()
  let processed = 0
  let expiredTotal = 0
  let recalculated = 0
  let hasMore = false

  while (processed < maxMembers) {
    const pageSize = Math.min(MEMBER_POINT_EXPIRY_BATCH_PAGE_SIZE, maxMembers - processed)
    const rows = (await supabaseSelectFilter('members', buildMembersWithPointsBatchFilter(afterId), {
      order: 'id.asc',
      limit: pageSize,
      select: 'id',
    })) as Array<{ id?: number }>

    if (!rows?.length) {
      await resetMemberPointExpiryBatchCursor()
      hasMore = false
      break
    }

    for (const row of rows) {
      const id = Number(row.id || 0)
      if (!id) continue
      afterId = id
      const result = await expireMemberPointsForMember(id, cutoffIso)
      processed += 1
      expiredTotal += result.expired
      if (result.tierRecalculated) recalculated += 1
      if (processed >= maxMembers) break
    }

    await saveMemberPointExpiryBatchCursor(afterId)

    if (processed >= maxMembers) {
      hasMore = rows.length >= pageSize
      break
    }

    if (rows.length < pageSize) {
      await resetMemberPointExpiryBatchCursor()
      hasMore = false
      break
    }
  }

  return { processed, expiredTotal, recalculated, hasMore }
}
