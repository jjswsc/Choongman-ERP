import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { addMemberNote } from '@/lib/member-crm-server'
import {
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

function toText(v: unknown): string {
  return String(v ?? '').trim()
}

type MemberRow = {
  id?: number
  member_no?: string | null
  name?: string | null
  full_name?: string | null
  birth_date?: string | null
  gender?: string | null
  nationality?: string | null
  join_channel?: string | null
  line_display_name?: string | null
  phone?: string | null
  email?: string | null
  consent_marketing?: boolean | null
  consent_privacy?: boolean | null
  consent_at?: string | null
  line_oa_friend?: boolean | null
  line_oa_friend_at?: string | null
  referral_code?: string | null
  status?: string | null
  tier_code?: string | null
  point_balance?: number | null
  tier_points?: number | null
  line_tier_points?: number | null
  lifetime_amount?: number | null
  last_visited_at?: string | null
}

type MemberIdentityRow = {
  id?: number
  member_id?: number
  provider?: string
  provider_user_id?: string
  status?: string | null
}

type MemberCouponIssueRow = {
  id?: number
  member_id?: number
  coupon_code?: string
  campaign_id?: number | null
  status?: string
}

export type MergeMembersResult = {
  targetMemberId: number
  targetMemberNo: string
  sourceMemberId: number
  sourceMemberNo: string
  transferred: {
    coupons: number
    couponDuplicatesCancelled: number
    pointLedgerRows: number
    orders: number
    identitiesMoved: number
    identitiesDeactivated: number
    notes: number
    events: number
    tierHistories: number
    campaignRunMembers: number
    referralEventsUpdated: number
    referredByUpdated: number
  }
}

export class MemberMergeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MemberMergeError'
  }
}

async function loadMemberById(id: number): Promise<MemberRow | null> {
  const rows = (await supabaseSelectFilter('members', `id=eq.${id}`, { limit: 1 })) as MemberRow[]
  return rows?.[0] ?? null
}

/** 회원번호(M004719) 또는 숫자 ID로 회원 조회 */
export async function resolveMemberRef(refRaw: string): Promise<MemberRow | null> {
  const ref = toText(refRaw)
  if (!ref) return null
  const asId = Number(ref.replace(/^M/i, '').replace(/^0+/, '') || ref)
  if (/^M?\d+$/i.test(ref.replace(/\s/g, ''))) {
    if (ref.toUpperCase().startsWith('M')) {
      const byNo = (await supabaseSelectFilter(
        'members',
        `member_no=eq.${encodeURIComponent(ref.toUpperCase())}`,
        { limit: 1 }
      )) as MemberRow[]
      if (byNo?.[0]) return byNo[0]
    }
    if (Number.isFinite(asId) && asId > 0) {
      const byId = await loadMemberById(asId)
      if (byId) return byId
    }
  }
  const byNoLoose = (await supabaseSelectFilter(
    'members',
    `member_no=eq.${encodeURIComponent(ref.toUpperCase())}`,
    { limit: 1 }
  )) as MemberRow[]
  return byNoLoose?.[0] ?? null
}

function couponIssueKey(couponCode: string, campaignId: number | null, status: string): string {
  return `${toText(couponCode).toUpperCase()}|${campaignId ?? 0}|${toText(status)}`
}

async function countRows(table: string, filter: string): Promise<number> {
  const rows = (await supabaseSelectFilter(table, filter, {
    limit: 10000,
    select: 'id',
  })) as Array<{ id?: number }>
  return (rows || []).length
}

/**
 * 중복 회원(source)을 유지 회원(target)으로 병합합니다.
 * source는 inactive 처리되며 포인트·쿠폰·주문·LINE 연결 등이 target으로 이전됩니다.
 */
export async function mergeMembers(params: {
  targetMemberId: number
  sourceMemberId: number
  actor?: string
}): Promise<MergeMembersResult> {
  const targetMemberId = Number(params.targetMemberId || 0)
  const sourceMemberId = Number(params.sourceMemberId || 0)
  if (!targetMemberId || !sourceMemberId) {
    throw new MemberMergeError('유지할 회원과 병합할 회원 ID가 모두 필요합니다.')
  }
  if (targetMemberId === sourceMemberId) {
    throw new MemberMergeError('같은 회원끼리는 병합할 수 없습니다.')
  }

  const [target, source] = await Promise.all([
    loadMemberById(targetMemberId),
    loadMemberById(sourceMemberId),
  ])
  if (!target?.id) throw new MemberMergeError('유지할 회원을 찾을 수 없습니다.')
  if (!source?.id) throw new MemberMergeError('병합할(중복) 회원을 찾을 수 없습니다.')
  if (toText(source.status) === 'inactive') {
    throw new MemberMergeError('이미 비활성(inactive) 상태인 회원은 병합 소스로 사용할 수 없습니다.')
  }

  const targetMemberNo = toText(target.member_no)
  const sourceMemberNo = toText(source.member_no)
  const now = getBangkokDateTimeString()
  const transferred: MergeMembersResult['transferred'] = {
    coupons: 0,
    couponDuplicatesCancelled: 0,
    pointLedgerRows: 0,
    orders: 0,
    identitiesMoved: 0,
    identitiesDeactivated: 0,
    notes: 0,
    events: 0,
    tierHistories: 0,
    campaignRunMembers: 0,
    referralEventsUpdated: 0,
    referredByUpdated: 0,
  }

  // ── 쿠폰: target에 동일 issued가 있으면 source 쪽은 cancelled ──
  const targetIssues = (await supabaseSelectFilter(
    'member_coupon_issues',
    `member_id=eq.${targetMemberId}`,
    { limit: 5000, select: 'id,coupon_code,campaign_id,status' }
  )) as MemberCouponIssueRow[]
  const targetIssueKeys = new Set(
    (targetIssues || []).map((row) =>
      couponIssueKey(toText(row.coupon_code), Number(row.campaign_id || 0) || null, toText(row.status))
    )
  )

  const sourceIssues = (await supabaseSelectFilter(
    'member_coupon_issues',
    `member_id=eq.${sourceMemberId}`,
    { limit: 5000, select: 'id,coupon_code,campaign_id,status' }
  )) as MemberCouponIssueRow[]

  for (const row of sourceIssues || []) {
    const issueId = Number(row.id || 0)
    if (!issueId) continue
    const key = couponIssueKey(
      toText(row.coupon_code),
      Number(row.campaign_id || 0) || null,
      toText(row.status)
    )
    if (toText(row.status) === 'issued' && targetIssueKeys.has(key)) {
      await supabaseUpdateByFilter('member_coupon_issues', `id=eq.${issueId}`, {
        status: 'cancelled',
        restore_reason: `merged_duplicate_into:${targetMemberNo || targetMemberId}`,
      })
      transferred.couponDuplicatesCancelled += 1
      continue
    }
    await supabaseUpdateByFilter('member_coupon_issues', `id=eq.${issueId}`, {
      member_id: targetMemberId,
    })
    transferred.coupons += 1
    if (toText(row.status) === 'issued') targetIssueKeys.add(key)
  }

  // ── 일괄 member_id 이전 ──
  const bulkTables = [
    'member_points_ledger',
    'member_notes',
    'member_events',
    'member_tier_histories',
    'crm_coupon_campaign_run_members',
  ] as const
  for (const table of bulkTables) {
    const before = await countRows(table, `member_id=eq.${sourceMemberId}`)
    if (before > 0) {
      await supabaseUpdateByFilter(table, `member_id=eq.${sourceMemberId}`, {
        member_id: targetMemberId,
      })
    }
    if (table === 'member_points_ledger') transferred.pointLedgerRows = before
    else if (table === 'member_notes') transferred.notes = before
    else if (table === 'member_events') transferred.events = before
    else if (table === 'member_tier_histories') transferred.tierHistories = before
    else if (table === 'crm_coupon_campaign_run_members') transferred.campaignRunMembers = before
  }

  const orderCount = await countRows('pos_orders', `member_id=eq.${sourceMemberId}`)
  if (orderCount > 0) {
    await supabaseUpdateByFilter('pos_orders', `member_id=eq.${sourceMemberId}`, {
      member_id: targetMemberId,
      ...(targetMemberNo ? { member_no: targetMemberNo } : {}),
    })
  }
  transferred.orders = orderCount

  // pos_tax_invoice_recipients — optional column
  try {
    await supabaseUpdateByFilter('pos_tax_invoice_recipients', `member_id=eq.${sourceMemberId}`, {
      member_id: targetMemberId,
    })
  } catch {
    // table/column may not exist in all envs
  }

  // ── 추천 관계 ──
  const referralRows = (await supabaseSelectFilter(
    'member_referral_events',
    `or=(referrer_member_id.eq.${sourceMemberId},referred_member_id.eq.${sourceMemberId})`,
    { limit: 500, select: 'id,referrer_member_id,referred_member_id' }
  )) as Array<{ id?: number; referrer_member_id?: number; referred_member_id?: number }>

  for (const row of referralRows || []) {
    const eventId = Number(row.id || 0)
    if (!eventId) continue
    const referrerId =
      Number(row.referrer_member_id || 0) === sourceMemberId ? targetMemberId : Number(row.referrer_member_id || 0)
    const referredId =
      Number(row.referred_member_id || 0) === sourceMemberId ? targetMemberId : Number(row.referred_member_id || 0)
    if (referrerId === referredId) {
      await supabaseUpdateByFilter('member_referral_events', `id=eq.${eventId}`, { status: 'rejected' })
      continue
    }
    try {
      await supabaseUpdateByFilter('member_referral_events', `id=eq.${eventId}`, {
        referrer_member_id: referrerId,
        referred_member_id: referredId,
      })
      transferred.referralEventsUpdated += 1
    } catch {
      await supabaseUpdateByFilter('member_referral_events', `id=eq.${eventId}`, { status: 'rejected' })
    }
  }

  const referredByCount = await countRows('members', `referred_by_member_id=eq.${sourceMemberId}`)
  if (referredByCount > 0) {
    await supabaseUpdateByFilter('members', `referred_by_member_id=eq.${sourceMemberId}`, {
      referred_by_member_id: targetMemberId,
    })
  }
  transferred.referredByUpdated = referredByCount

  // ── LINE 등 identity ──
  const [sourceIdentities, targetIdentities] = await Promise.all([
    supabaseSelectFilter('member_identities', `member_id=eq.${sourceMemberId}`, {
      limit: 100,
      select: 'id,provider,provider_user_id,status',
    }) as Promise<MemberIdentityRow[]>,
    supabaseSelectFilter('member_identities', `member_id=eq.${targetMemberId}`, {
      limit: 100,
      select: 'id,provider,provider_user_id,status',
    }) as Promise<MemberIdentityRow[]>,
  ])
  const targetProviderUserIds = new Set(
    (targetIdentities || []).map((row) => `${toText(row.provider)}:${toText(row.provider_user_id)}`)
  )
  for (const identity of sourceIdentities || []) {
    const identityId = Number(identity.id || 0)
    if (!identityId) continue
    const key = `${toText(identity.provider)}:${toText(identity.provider_user_id)}`
    if (targetProviderUserIds.has(key)) {
      await supabaseUpdateByFilter('member_identities', `id=eq.${identityId}`, {
        status: 'inactive',
        last_seen_at: now,
      })
      transferred.identitiesDeactivated += 1
      continue
    }
    await supabaseUpdateByFilter('member_identities', `id=eq.${identityId}`, {
      member_id: targetMemberId,
      status: 'active',
      last_seen_at: now,
    })
    targetProviderUserIds.add(key)
    transferred.identitiesMoved += 1
  }

  // ── source 세션 무효화 ──
  try {
    await supabaseUpdateByFilter(
      'member_sessions',
      `member_id=eq.${sourceMemberId}&revoked_at=is.null`,
      { revoked_at: now }
    )
  } catch {
    // ignore
  }

  // ── target 프로필·잔액 병합 ──
  const targetPatch: Record<string, unknown> = {
    updated_at: now,
    point_balance: Number(target.point_balance || 0) + Number(source.point_balance || 0),
    tier_points: Number(target.tier_points || 0) + Number(source.tier_points || 0),
    line_tier_points: Number(target.line_tier_points || 0) + Number(source.line_tier_points || 0),
    lifetime_amount: Number(target.lifetime_amount || 0) + Number(source.lifetime_amount || 0),
  }
  if (!toText(target.full_name) && toText(source.full_name)) targetPatch.full_name = source.full_name
  if (!toText(target.phone) && toText(source.phone)) targetPatch.phone = source.phone
  if (!toText(target.email) && toText(source.email)) targetPatch.email = source.email
  if (!toText(target.birth_date) && toText(source.birth_date)) targetPatch.birth_date = source.birth_date
  if (!toText(target.gender) && toText(source.gender)) targetPatch.gender = source.gender
  if (!toText(target.nationality) && toText(source.nationality)) targetPatch.nationality = source.nationality
  if (!toText(target.line_display_name) && toText(source.line_display_name)) {
    targetPatch.line_display_name = source.line_display_name
  }
  const sourceReferralToKeep =
    !toText(target.referral_code) && toText(source.referral_code) ? toText(source.referral_code) : ''
  if (!target.consent_marketing && source.consent_marketing) targetPatch.consent_marketing = true
  if (!target.consent_privacy && source.consent_privacy) targetPatch.consent_privacy = true
  if (!toText(target.consent_at) && toText(source.consent_at)) targetPatch.consent_at = source.consent_at
  if (!toText(target.last_visited_at) && toText(source.last_visited_at)) {
    targetPatch.last_visited_at = source.last_visited_at
  } else if (toText(source.last_visited_at) && toText(target.last_visited_at)) {
    const srcVisit = new Date(String(source.last_visited_at).replace(' ', 'T')).getTime()
    const tgtVisit = new Date(String(target.last_visited_at).replace(' ', 'T')).getTime()
    if (srcVisit > tgtVisit) targetPatch.last_visited_at = source.last_visited_at
  }
  if (!target.line_oa_friend && source.line_oa_friend) {
    targetPatch.line_oa_friend = true
    if (!toText(target.line_oa_friend_at) && toText(source.line_oa_friend_at)) {
      targetPatch.line_oa_friend_at = source.line_oa_friend_at
    }
  }

  // source 먼저 unique 컬럼 해제 — referral_code를 target에 옮기기 전 필수
  await supabaseUpdateByFilter('members', `id=eq.${sourceMemberId}`, {
    status: 'inactive',
    phone: null,
    email: null,
    referral_code: null,
    point_balance: 0,
    tier_points: 0,
    line_tier_points: 0,
    lifetime_amount: 0,
    updated_at: now,
  })

  if (sourceReferralToKeep) targetPatch.referral_code = sourceReferralToKeep
  await supabaseUpdateByFilter('members', `id=eq.${targetMemberId}`, targetPatch)

  const mergeNote = `회원 병합: ${sourceMemberNo || sourceMemberId} → ${targetMemberNo || targetMemberId} (쿠폰 ${transferred.coupons}건, 주문 ${transferred.orders}건, 포인트원장 ${transferred.pointLedgerRows}건)`
  try {
    await addMemberNote({
      memberId: targetMemberId,
      note: mergeNote,
      tags: ['merge'],
      createdBy: toText(params.actor) || 'erp_merge',
    })
  } catch {
    await supabaseInsert('member_notes', {
      member_id: targetMemberId,
      note: mergeNote,
      tags: ['merge'],
      created_by: toText(params.actor) || 'erp_merge',
      created_at: now,
    })
  }

  return {
    targetMemberId,
    targetMemberNo,
    sourceMemberId,
    sourceMemberNo,
    transferred,
  }
}
