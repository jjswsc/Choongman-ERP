import {
  supabaseInsert,
  supabaseSelect,
  supabaseSelectAllPages,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
  supabaseUpsert,
} from '@/lib/supabase-server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import {
  loadMemberTierUpgradeBasis,
  pickTierByQualification,
  type MemberTierUpgradeBasis,
} from '@/lib/member-tier-policy'
import {
  computeMemberPointEarn,
  formatPointEarnLedgerNote,
  resolvePointEarnChannel,
} from '@/lib/member-point-earn-policy'
import { loadMemberPointEarnBonusPolicy } from '@/lib/member-point-earn-policy-server'
import {
  isPosOrderPaymentCompleteForTotal,
  posOrderPaymentSumFromAmounts,
} from '@/lib/pos-order-paid-at'
import { isPosCompletionStatus } from '@/lib/pos-order-policy'
import {
  toText,
  resolveMemberTierQualificationValue,
  type MemberRow,
  type MemberTierRow,
  type MemberPointLedgerRow,
} from './members-server-core'

async function getActiveTiers(): Promise<MemberTierRow[]> {
  const rows = (await supabaseSelect('member_tiers', { order: 'sort_order.asc,min_points.asc', limit: 1000 })) as MemberTierRow[]
  return [...rows].sort((a, b) => {
    const orderDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0)
    if (orderDiff !== 0) return orderDiff
    const pointsDiff = Number(a.min_points || 0) - Number(b.min_points || 0)
    if (pointsDiff !== 0) return pointsDiff
    return Number(a.min_amount || 0) - Number(b.min_amount || 0)
  })
}

export async function getMemberTierQualificationPoints(memberId: number): Promise<number> {
  const id = Number(memberId || 0)
  if (!id) return 0
  const rows = (await supabaseSelectFilter('members', `id=eq.${id}`, {
    limit: 1,
    select: 'tier_points,line_tier_points',
  })) as Pick<MemberRow, 'tier_points' | 'line_tier_points'>[]
  const member = rows?.[0]
  if (!member) return 0
  return resolveMemberTierQualificationValue(member, 'points')
}

export async function recalculateMemberTier(memberId: number): Promise<{
  tierCode: string
  lifetimeAmount: number
  qualificationPoints: number
  upgradeBasis: MemberTierUpgradeBasis
}> {
  const id = Number(memberId || 0)
  if (!id) throw new Error('유효한 회원 ID가 필요합니다.')
  const rows = (await supabaseSelectFilter('members', `id=eq.${id}`, { limit: 1 })) as MemberRow[]
  const member = rows?.[0]
  if (!member) throw new Error('회원을 찾을 수 없습니다.')

  const upgradeBasis = await loadMemberTierUpgradeBasis()
  const lifetimeAmount = Number(member.lifetime_amount || 0)
  const qualificationPoints = resolveMemberTierQualificationValue(member, 'points')
  const qualificationValue = resolveMemberTierQualificationValue(member, upgradeBasis)
  const prevTier = toText(member.tier_code) || 'BRONZE'
  const tiers = await getActiveTiers()
  const nextTier = pickTierByQualification(tiers, qualificationValue, upgradeBasis)
  if (nextTier !== prevTier) {
    await supabaseUpdateByFilter('members', `id=eq.${id}`, {
      tier_code: nextTier,
      updated_at: getBangkokDateTimeString(),
    })
    await supabaseInsert('member_tier_histories', {
      member_id: id,
      prev_tier_code: prevTier,
      next_tier_code: nextTier,
      reason: 'auto_recalculate',
      changed_at: getBangkokDateTimeString(),
    })
  }
  return { tierCode: nextTier, lifetimeAmount, qualificationPoints, upgradeBasis }
}

export async function recalculateAllMemberTiers(): Promise<number> {
  const members = (await supabaseSelectAllPages('members', {
    order: 'id.asc',
    select: 'id',
    pageSize: 8000,
    maxRows: 2_000_000,
  })) as { id?: number }[]
  let count = 0
  for (const member of members || []) {
    const id = Number(member.id || 0)
    if (!id) continue
    await recalculateMemberTier(id)
    count += 1
  }
  return count
}

export async function recalculateMemberTierBatch(params?: {
  afterId?: number
  limit?: number
}): Promise<{ processed: number; nextAfterId: number | null }> {
  const limit = Math.max(1, Math.min(Number(params?.limit || 500), 5000))
  const afterId = Number(params?.afterId || 0) || null
  const rows = (await supabaseSelectFilter(
    'members',
    afterId ? `id=lt.${afterId}` : 'id=gt.0',
    { order: 'id.desc', limit, select: 'id' }
  )) as { id?: number }[]
  let processed = 0
  let nextAfterId: number | null = null
  for (const row of rows || []) {
    const id = Number(row.id || 0)
    if (!id) continue
    await recalculateMemberTier(id)
    processed += 1
    nextAfterId = id
  }
  return { processed, nextAfterId }
}

export async function listMemberTiers(): Promise<MemberTierRow[]> {
  return getActiveTiers()
}

export async function saveMemberTier(params: {
  code: string
  name: string
  minAmount: number
  minPoints?: number
  pointRate: number
  sortOrder?: number
  discountRate?: number
  benefitsKo?: string
  benefitsEn?: string
  benefitsTh?: string
}) {
  const code = toText(params.code).toUpperCase()
  if (!code) throw new Error('등급 코드가 필요합니다.')
  await supabaseUpsert(
    'member_tiers',
    [
      {
        code,
        name: toText(params.name) || code,
        min_amount: Math.max(0, Number(params.minAmount || 0)),
        min_points: Math.max(0, Math.trunc(Number(params.minPoints || 0))),
        point_rate: Math.max(0, Number(params.pointRate || 0)),
        discount_rate: Math.max(0, Number(params.discountRate ?? 0)),
        sort_order: Math.max(0, Math.trunc(Number(params.sortOrder || 0))),
        benefits_ko: toText(params.benefitsKo) || null,
        benefits_en: toText(params.benefitsEn) || null,
        benefits_th: toText(params.benefitsTh) || null,
        updated_at: getBangkokDateTimeString(),
      },
    ],
    'code'
  )
}

export async function listMemberPoints(params?: {
  memberId?: number
  limit?: number
  startStr?: string
  endStr?: string
  offset?: number
}) {
  const memberId = Number(params?.memberId || 0)
  const limit = Math.max(1, Math.min(Number(params?.limit || 100), 500))
  const offset = Math.max(0, Number(params?.offset || 0))
  const filters: string[] = []
  if (memberId) filters.push(`member_id=eq.${memberId}`)
  const startStr = toText(params?.startStr).slice(0, 10)
  const endStr = toText(params?.endStr).slice(0, 10)
  if (startStr) {
    filters.push(`created_at=gte.${encodeURIComponent(`${startStr}T00:00:00`)}`)
  }
  if (endStr) {
    filters.push(`created_at=lte.${encodeURIComponent(`${endStr}T23:59:59`)}`)
  }
  const filter = filters.join('&')
  const opts = { order: 'id.desc' as const, limit, offset }
  const rows = filter
    ? ((await supabaseSelectFilter('member_points_ledger', filter, opts)) as MemberPointLedgerRow[])
    : ((await supabaseSelect('member_points_ledger', opts)) as MemberPointLedgerRow[])
  return (rows || []).map((row) => ({
    id: Number(row.id || 0),
    memberId: Number(row.member_id || 0),
    orderId: Number(row.order_id || 0) || null,
    kind: toText(row.kind),
    points: Number(row.points || 0),
    amount: Number(row.amount || 0),
    note: toText(row.note),
    createdAt: toText(row.created_at),
  }))
}

export async function adjustMemberPoints(params: {
  memberId: number
  points: number
  note?: string
}) {
  const memberId = Number(params.memberId || 0)
  const points = Math.trunc(Number(params.points || 0))
  if (!memberId) throw new Error('유효한 memberId가 필요합니다.')
  if (!points) throw new Error('포인트 변경값이 필요합니다.')
  const rows = (await supabaseSelectFilter('members', `id=eq.${memberId}`, { limit: 1 })) as MemberRow[]
  if (!rows?.length) throw new Error('회원을 찾을 수 없습니다.')
  const member = rows[0]
  const nextBalance = Number(member.point_balance || 0) + points
  if (nextBalance < 0) throw new Error('포인트가 부족합니다.')
  await supabaseInsert('member_points_ledger', {
    member_id: memberId,
    kind: 'adjust',
    points,
    amount: 0,
    note: toText(params.note) || 'manual_adjust',
    created_at: getBangkokDateTimeString(),
  })
  await supabaseUpdateByFilter('members', `id=eq.${memberId}`, {
    point_balance: nextBalance,
    updated_at: getBangkokDateTimeString(),
    ...(points > 0 ? { tier_points: Math.max(0, Math.trunc(Number(member.tier_points || 0))) + points } : {}),
  })
  await recalculateMemberTier(memberId)
}

export async function computeMemberPointEarnForOrder(params: {
  memberId: number
  totalAmount: number
  orderType?: string | null
  createdBy?: string | null
  orderAtYmd?: string
}) {
  const memberId = Number(params.memberId || 0)
  if (!memberId) {
    return {
      pointEarned: 0,
      baseEarn: 0,
      effectiveMultiplier: 1,
      tierCode: 'BRONZE' as string,
      pointRate: 0,
      birthdayApplied: false,
      periodPromoApplied: false,
      channel: 'dine_in' as const,
      channelMultiplier: 1,
    }
  }
  const rows = (await supabaseSelectFilter('members', `id=eq.${memberId}`, { limit: 1 })) as MemberRow[]
  const member = rows?.[0]
  if (!member) {
    return {
      pointEarned: 0,
      baseEarn: 0,
      effectiveMultiplier: 1,
      tierCode: 'BRONZE' as string,
      pointRate: 0,
      birthdayApplied: false,
      periodPromoApplied: false,
      channel: 'dine_in' as const,
      channelMultiplier: 1,
    }
  }
  const tiers = await getActiveTiers()
  const { tierCode: currentTierCode, pointRate } = resolveMemberTierPointRate(tiers, toText(member.tier_code))
  const policy = await loadMemberPointEarnBonusPolicy()
  const channel = resolvePointEarnChannel({
    createdBy: params.createdBy,
    orderType: params.orderType,
  })
  const breakdown = computeMemberPointEarn({
    totalAmount: params.totalAmount,
    pointRate,
    policy,
    channel,
    birthDate: toText(member.birth_date) || null,
    todayYmd: params.orderAtYmd,
  })
  return {
    ...breakdown,
    tierCode: currentTierCode,
    pointRate,
  }
}

function resolveMemberTierPointRate(
  tiers: MemberTierRow[],
  tierCodeRaw: string
): { tierCode: string; pointRate: number } {
  const tierCode = (toText(tierCodeRaw) || 'BRONZE').toUpperCase()
  const currentTier = tiers.find((x) => toText(x.code).toUpperCase() === tierCode)
  return { tierCode, pointRate: Number(currentTier?.point_rate || 0.01) }
}

type PosOrderLoyaltyRow = {
  id?: number
  order_no?: string | null
  store_code?: string | null
  status?: string | null
  total?: number | null
  member_id?: number | null
  point_used?: number | null
  point_earned?: number | null
  coupon_code?: string | null
  created_by?: string | null
  order_type?: string | null
  payment_cash?: number | null
  payment_card?: number | null
  payment_qr?: number | null
  payment_other?: number | null
  payment_delivery_app?: number | null
}

/** 결제 완료 주문에 대해 등급별 포인트 적립 멱등 보장 (POS·회원앱 공통) */
export async function ensurePosOrderLoyaltyApplied(orderId: number): Promise<number> {
  const id = Number(orderId || 0)
  if (!id) return 0

  const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${id}`, {
    limit: 1,
    select:
      'id,order_no,store_code,status,total,member_id,point_used,point_earned,coupon_code,created_by,order_type,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app',
  })) as PosOrderLoyaltyRow[]
  const order = rows?.[0]
  if (!order?.id) return 0

  const memberId = Number(order.member_id || 0)
  if (!memberId) return 0

  const total = Math.max(0, Number(order.total || 0))
  const paymentSum = posOrderPaymentSumFromAmounts({
    paymentCash: Number(order.payment_cash || 0),
    paymentCard: Number(order.payment_card || 0),
    paymentQr: Number(order.payment_qr || 0),
    paymentOther: Number(order.payment_other || 0),
    paymentDeliveryApp: Number(order.payment_delivery_app || 0),
  })
  const status = String(order.status || '').trim().toLowerCase()
  const paymentComplete = isPosOrderPaymentCompleteForTotal(total, paymentSum)
  const paidLike = status === 'paid' || status === 'completed' || isPosCompletionStatus(status)
  if (!paymentComplete && !paidLike) return 0

  const priorEarned = Math.max(0, Math.trunc(Number(order.point_earned || 0)))
  if (priorEarned > 0) return priorEarned

  try {
    const ledger = (await supabaseSelectFilter(
      'member_points_ledger',
      `member_id=eq.${memberId}&order_id=eq.${id}&kind=eq.earn`,
      { limit: 1, select: 'points' }
    )) as Array<{ points?: number | null }>
    const ledgerPts = Math.max(0, Math.trunc(Number(ledger?.[0]?.points || 0)))
    if (ledgerPts > 0) {
      await supabaseUpdateByFilter('pos_orders', `id=eq.${id}`, { point_earned: ledgerPts })
      return ledgerPts
    }
  } catch {
    /* ledger 미배포 환경 */
  }

  const loyalty = await applyLoyaltyOnOrder({
    memberId,
    orderId: id,
    storeCode: String(order.store_code || '').trim(),
    totalAmount: total,
    pointUsed: Math.max(0, Math.trunc(Number(order.point_used || 0))),
    orderNo: String(order.order_no || ''),
    couponCode: String(order.coupon_code || '').trim() || undefined,
    orderType: String(order.order_type || ''),
    createdBy: String(order.created_by || ''),
  })
  const earned = Math.max(0, Math.trunc(Number(loyalty.pointEarned || 0)))
  if (earned > 0) {
    await supabaseUpdateByFilter('pos_orders', `id=eq.${id}`, { point_earned: earned })
  }
  try {
    const { redeemMemberCouponIssuesForPaidOrder } = await import('@/lib/pos-coupon-server')
    await redeemMemberCouponIssuesForPaidOrder(id)
  } catch (redeemErr) {
    console.error('ensurePosOrderLoyaltyApplied coupon redeem:', redeemErr)
  }
  return earned
}

export async function applyLoyaltyOnOrder(params: {
  memberId?: number
  orderId?: number
  storeCode?: string
  totalAmount: number
  pointUsed: number
  pointEarned?: number
  orderNo?: string
  couponCode?: string
  orderType?: string | null
  createdBy?: string | null
  orderAtYmd?: string
}) {
  const memberId = Number(params.memberId || 0)
  if (!memberId) return { pointEarned: 0, tierCode: 'BRONZE' }
  const orderId = Number(params.orderId || 0)
  let stamp: import('@/lib/member-stamp-card').MemberStampRecordResult | null = null
  if (orderId > 0) {
    try {
      const { recordMemberStampOnVisit } = await import('@/lib/member-stamp-card')
      stamp = await recordMemberStampOnVisit({
        memberId,
        orderId,
        storeCode: toText(params.storeCode),
        totalAmount: Number(params.totalAmount || 0),
        orderAtYmd: params.orderAtYmd,
        createdBy: params.createdBy,
        orderType: params.orderType,
      })
    } catch {
      /* stamp tables may not be migrated yet */
    }
  }
  const rows = (await supabaseSelectFilter('members', `id=eq.${memberId}`, { limit: 1 })) as MemberRow[]
  const member = rows?.[0]
  if (!member) return { pointEarned: 0, tierCode: 'BRONZE', stamp }
  const tiers = await getActiveTiers()
  const { tierCode: currentTierCode, pointRate } = resolveMemberTierPointRate(tiers, toText(member.tier_code))
  const pointUsed = Math.max(0, Math.trunc(Number(params.pointUsed || 0)))
  const earnBreakdown = computeMemberPointEarn({
    totalAmount: params.totalAmount,
    pointRate,
    policy: await loadMemberPointEarnBonusPolicy(),
    channel: resolvePointEarnChannel({
      createdBy: params.createdBy,
      orderType: params.orderType,
    }),
    birthDate: toText(member.birth_date) || null,
    todayYmd: params.orderAtYmd,
  })
  const explicitEarn = params.pointEarned != null ? Math.trunc(Number(params.pointEarned)) : null
  const pointEarned =
    explicitEarn != null && explicitEarn > 0 ? explicitEarn : earnBreakdown.pointEarned
  const earnNote = formatPointEarnLedgerNote(toText(params.orderNo), earnBreakdown)
  const orderIdForLedger = orderId || null
  const existingByOrder = orderIdForLedger
    ? ((await supabaseSelectFilter(
        'member_points_ledger',
        `member_id=eq.${memberId}&order_id=eq.${orderIdForLedger}`,
        { select: 'kind', limit: 20 }
      )) as Array<{ kind?: string }>)
    : []
  const existingKinds = new Set((existingByOrder || []).map((x) => toText(x.kind)))
  const balanceBefore = Math.max(0, Math.trunc(Number(member.point_balance || 0)))
  const shouldInsertUse = pointUsed > 0 && !existingKinds.has('use')
  const shouldInsertEarn = pointEarned > 0 && !existingKinds.has('earn')
  const appliedUse = shouldInsertUse ? Math.min(pointUsed, balanceBefore) : 0
  const appliedEarn = shouldInsertEarn ? pointEarned : 0
  const nextBalance = Math.max(0, balanceBefore - appliedUse + appliedEarn)
  const shouldApplyLifetime = shouldInsertUse || shouldInsertEarn
  const nextLifetime =
    Number(member.lifetime_amount || 0) + (shouldApplyLifetime ? Math.max(0, Number(params.totalAmount || 0)) : 0)

  if (shouldInsertUse && appliedUse > 0) {
    await supabaseInsert('member_points_ledger', {
      member_id: memberId,
      order_id: orderId,
      kind: 'use',
      points: -appliedUse,
      amount: Number(params.totalAmount || 0),
      note: toText(params.orderNo) || 'order_use',
      created_at: getBangkokDateTimeString(),
    })
  }
  if (shouldInsertEarn) {
    await supabaseInsert('member_points_ledger', {
      member_id: memberId,
      order_id: orderId,
      kind: 'earn',
      points: pointEarned,
      amount: Number(params.totalAmount || 0),
      note: earnNote,
      created_at: getBangkokDateTimeString(),
    })
  }
  // 쿠폰 사용(issued→used) 처리는 redemption 기록을 남기는
  // persistPosOrderCouponRedemptions 한 곳에서만 수행한다. 여기서 중복 처리하면
  // 결제·재처리마다 phantom used 행이 쌓여 회원앱에 중복 쿠폰이 남는다.

  const nextTierPoints =
    Math.max(0, Math.trunc(Number(member.tier_points || 0)), Math.trunc(Number(member.line_tier_points || 0))) +
    (appliedEarn > 0 ? appliedEarn : 0)

  if (!shouldInsertUse && !shouldInsertEarn) {
    return { pointEarned: 0, tierCode: currentTierCode, stamp }
  }

  await supabaseUpdateByFilter('members', `id=eq.${memberId}`, {
    point_balance: nextBalance,
    lifetime_amount: nextLifetime,
    tier_points: nextTierPoints,
    last_visited_at: getBangkokDateTimeString(),
    updated_at: getBangkokDateTimeString(),
  })
  const recalc = await recalculateMemberTier(memberId)
  return { pointEarned: appliedEarn, tierCode: recalc.tierCode, stamp }
}
