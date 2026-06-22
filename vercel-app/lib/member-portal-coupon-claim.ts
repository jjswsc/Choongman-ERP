import { getBangkokDateTimeString, getBangkokTodayDateString } from '@/lib/bangkok-time'
import { issueMemberCoupon } from '@/lib/members-server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

export type PortalCouponClaimMode = 'none' | 'free' | 'points'

export type PortalCouponOfferStatus =
  | 'claimable'
  | 'active_in_wallet'
  | 'max_claims_reached'
  | 'insufficient_points'

export type PortalCouponOfferRow = {
  couponCode: string
  couponName: string
  discountType: string
  discountValue: number
  minOrderAmt: number
  maxDiscountAmt: number | null
  validFrom: string
  validTo: string
  portalImageUrl: string
  claimMode: 'free' | 'points'
  pointCost: number
  maxClaimsPerMember: number
  claimCount: number
  status: PortalCouponOfferStatus
  pointsNeeded: number
  activeIssueId: number | null
  sortOrder: number
}

type CouponPortalRow = {
  id?: number
  code?: string
  name?: string
  discount_type?: string
  benefit_kind?: string | null
  discount_value?: number
  min_order_amt?: number
  max_discount_amt?: number | null
  valid_from?: string | null
  valid_to?: string | null
  is_active?: boolean
  redemption_mode?: string | null
  portal_image_url?: string | null
  portal_visible?: boolean | null
  portal_claim_mode?: string | null
  portal_point_cost?: number | null
  portal_max_claims_per_member?: number | null
  portal_sort_order?: number | null
}

function toText(v: unknown): string {
  return String(v || '').trim()
}

function normalizeClaimMode(raw: unknown): PortalCouponClaimMode {
  const s = toText(raw).toLowerCase()
  if (s === 'free' || s === 'points') return s
  return 'none'
}

function resolveDiscountType(row: CouponPortalRow): string {
  const benefitRaw = toText(row.benefit_kind)
  if (benefitRaw === 'bogo' || benefitRaw === 'set_fixed' || benefitRaw === 'item_fixed') return benefitRaw
  return row.discount_type === 'percent' ? 'percent' : 'fixed'
}

function isCouponInValidPeriod(row: CouponPortalRow, todayYmd: string): boolean {
  const from = toText(row.valid_from)
  const to = toText(row.valid_to)
  if (from && from > todayYmd) return false
  if (to && to < todayYmd) return false
  return true
}

function isPortalClaimColumnMissing(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '')
  return (
    /PGRST204/i.test(msg) ||
    (/column/i.test(msg) &&
      (/portal_visible/i.test(msg) ||
        /portal_claim_mode/i.test(msg) ||
        /portal_point_cost/i.test(msg) ||
        /portal_max_claims/i.test(msg) ||
        /portal_sort_order/i.test(msg)))
  )
}

async function loadPortalCouponRows(): Promise<CouponPortalRow[]> {
  try {
    return (await supabaseSelectFilter('pos_coupons', 'portal_visible=eq.true', {
      order: 'portal_sort_order.asc,code.asc',
      limit: 200,
    })) as CouponPortalRow[]
  } catch (e) {
    if (!isPortalClaimColumnMissing(e)) throw e
    return []
  }
}

async function loadPortalCouponByCode(code: string): Promise<CouponPortalRow | null> {
  const upper = toText(code).toUpperCase()
  if (!upper) return null
  try {
    const rows = (await supabaseSelectFilter('pos_coupons', `code=eq.${encodeURIComponent(upper)}`, {
      limit: 1,
    })) as CouponPortalRow[]
    return rows?.[0] ?? null
  } catch {
    return null
  }
}

async function loadMemberClaimContext(memberId: number) {
  const memberRows = (await supabaseSelectFilter('members', `id=eq.${memberId}`, {
    limit: 1,
    select: 'id,point_balance',
  })) as Array<{ id?: number; point_balance?: number | null }>
  const member = memberRows?.[0]
  if (!member?.id) throw new Error('member_not_found')

  const issueRows = (await supabaseSelectFilter('member_coupon_issues', `member_id=eq.${memberId}`, {
    limit: 500,
    order: 'id.desc',
    select: 'id,coupon_code,status',
  })) as Array<{ id?: number; coupon_code?: string; status?: string }>

  return {
    pointBalance: Math.max(0, Math.trunc(Number(member.point_balance || 0))),
    issues: issueRows || [],
  }
}

function countMemberClaimsForCoupon(
  issues: Array<{ coupon_code?: string; status?: string }>,
  couponCode: string
): number {
  const code = couponCode.toUpperCase()
  return issues.filter((row) => {
    if (toText(row.coupon_code).toUpperCase() !== code) return false
    const status = toText(row.status).toLowerCase()
    return status !== 'cancelled'
  }).length
}

function findActiveIssueId(
  issues: Array<{ id?: number; coupon_code?: string; status?: string }>,
  couponCode: string
): number | null {
  const code = couponCode.toUpperCase()
  const row = issues.find(
    (r) => toText(r.coupon_code).toUpperCase() === code && toText(r.status).toLowerCase() === 'issued'
  )
  return row?.id ? Number(row.id) : null
}

function resolveOfferStatus(params: {
  claimMode: 'free' | 'points'
  pointCost: number
  pointBalance: number
  claimCount: number
  maxClaims: number
  activeIssueId: number | null
}): PortalCouponOfferStatus {
  if (params.activeIssueId) return 'active_in_wallet'
  if (params.claimCount >= params.maxClaims) return 'max_claims_reached'
  if (params.claimMode === 'points' && params.pointBalance < params.pointCost) return 'insufficient_points'
  return 'claimable'
}

function mapOfferRow(
  row: CouponPortalRow,
  ctx: Awaited<ReturnType<typeof loadMemberClaimContext>>,
  todayYmd: string
): PortalCouponOfferRow | null {
  if (row.is_active === false) return null
  if (!isCouponInValidPeriod(row, todayYmd)) return null
  if (toText(row.redemption_mode) !== 'member_issue') return null

  const claimMode = normalizeClaimMode(row.portal_claim_mode)
  if (claimMode !== 'free' && claimMode !== 'points') return null

  const couponCode = toText(row.code).toUpperCase()
  if (!couponCode) return null

  const pointCost = Math.max(0, Math.trunc(Number(row.portal_point_cost || 0)))
  const maxClaims = Math.max(1, Math.trunc(Number(row.portal_max_claims_per_member || 1)))
  const claimCount = countMemberClaimsForCoupon(ctx.issues, couponCode)
  const activeIssueId = findActiveIssueId(ctx.issues, couponCode)
  const status = resolveOfferStatus({
    claimMode,
    pointCost,
    pointBalance: ctx.pointBalance,
    claimCount,
    maxClaims,
    activeIssueId,
  })

  return {
    couponCode,
    couponName: toText(row.name) || couponCode,
    discountType: resolveDiscountType(row),
    discountValue: Number(row.discount_value || 0),
    minOrderAmt: Number(row.min_order_amt || 0),
    maxDiscountAmt: row.max_discount_amt != null ? Number(row.max_discount_amt) : null,
    validFrom: toText(row.valid_from),
    validTo: toText(row.valid_to),
    portalImageUrl: toText(row.portal_image_url),
    claimMode,
    pointCost,
    maxClaimsPerMember: maxClaims,
    claimCount,
    status,
    pointsNeeded: Math.max(0, pointCost - ctx.pointBalance),
    activeIssueId,
    sortOrder: Number(row.portal_sort_order || 0),
  }
}

export async function listMemberPortalCouponOffers(memberId: number): Promise<PortalCouponOfferRow[]> {
  const id = Number(memberId || 0)
  if (!id) return []

  const todayYmd = getBangkokTodayDateString()
  const [rows, ctx] = await Promise.all([loadPortalCouponRows(), loadMemberClaimContext(id)])

  return (rows || [])
    .map((row) => mapOfferRow(row, ctx, todayYmd))
    .filter((row): row is PortalCouponOfferRow => Boolean(row))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.couponCode.localeCompare(b.couponCode))
}

async function redeemMemberPointsForCouponClaim(params: {
  memberId: number
  points: number
  couponCode: string
}) {
  const memberId = Number(params.memberId || 0)
  const points = Math.max(0, Math.trunc(Number(params.points || 0)))
  if (!memberId || points <= 0) return

  const memberRows = (await supabaseSelectFilter('members', `id=eq.${memberId}`, {
    limit: 1,
    select: 'point_balance',
  })) as Array<{ point_balance?: number | null }>
  const balance = Math.max(0, Math.trunc(Number(memberRows?.[0]?.point_balance || 0)))
  const nextBalance = balance - points
  if (nextBalance < 0) throw new Error('insufficient_points')

  await supabaseInsert('member_points_ledger', {
    member_id: memberId,
    kind: 'redeem',
    points: -points,
    amount: 0,
    note: `coupon_claim:${toText(params.couponCode).toUpperCase()}`,
    created_at: getBangkokDateTimeString(),
  })
  await supabaseUpdateByFilter('members', `id=eq.${memberId}`, {
    point_balance: nextBalance,
    updated_at: getBangkokDateTimeString(),
  })
}

export async function claimMemberPortalCoupon(params: { memberId: number; couponCode: string }) {
  const memberId = Number(params.memberId || 0)
  const couponCode = toText(params.couponCode).toUpperCase()
  if (!memberId) throw new Error('member_not_found')
  if (!couponCode) throw new Error('coupon_code_required')

  const todayYmd = getBangkokTodayDateString()
  const row = await loadPortalCouponByCode(couponCode)
  if (!row?.id) throw new Error('coupon_not_found')
  if (row.is_active === false) throw new Error('coupon_inactive')
  if (!row.portal_visible) throw new Error('coupon_not_in_catalog')
  if (!isCouponInValidPeriod(row, todayYmd)) throw new Error('coupon_not_in_period')
  if (toText(row.redemption_mode) !== 'member_issue') throw new Error('coupon_not_member_issue')

  const claimMode = normalizeClaimMode(row.portal_claim_mode)
  if (claimMode !== 'free' && claimMode !== 'points') throw new Error('coupon_not_self_claimable')

  const ctx = await loadMemberClaimContext(memberId)
  const pointCost = Math.max(0, Math.trunc(Number(row.portal_point_cost || 0)))
  const maxClaims = Math.max(1, Math.trunc(Number(row.portal_max_claims_per_member || 1)))
  const claimCount = countMemberClaimsForCoupon(ctx.issues, couponCode)
  const activeIssueId = findActiveIssueId(ctx.issues, couponCode)

  if (activeIssueId) throw new Error('coupon_already_in_wallet')
  if (claimCount >= maxClaims) throw new Error('coupon_max_claims_reached')
  if (claimMode === 'points') {
    if (pointCost <= 0) throw new Error('coupon_point_cost_invalid')
    if (ctx.pointBalance < pointCost) throw new Error('insufficient_points')
  }

  if (claimMode === 'points') {
    await redeemMemberPointsForCouponClaim({ memberId, points: pointCost, couponCode })
  }

  await issueMemberCoupon({ memberId, couponCode })

  const after = await loadMemberClaimContext(memberId)
  const newActiveIssueId = findActiveIssueId(after.issues, couponCode)

  return {
    couponCode,
    issueId: newActiveIssueId,
    pointBalance: after.pointBalance,
    pointsSpent: claimMode === 'points' ? pointCost : 0,
  }
}

export function portalCouponClaimErrorMessage(code: string, lang: 'ko' | 'en' | 'th' = 'ko'): string {
  const key = toText(code)
  const ko: Record<string, string> = {
    coupon_not_found: '쿠폰을 찾을 수 없습니다.',
    coupon_inactive: '현재 사용할 수 없는 쿠폰입니다.',
    coupon_not_in_catalog: '회원앱에서 받을 수 있는 쿠폰이 아닙니다.',
    coupon_not_in_period: '쿠폰 수령 기간이 아닙니다.',
    coupon_not_member_issue: '회원 발급 유형 쿠폰만 받을 수 있습니다.',
    coupon_not_self_claimable: '직접 수령할 수 없는 쿠폰입니다.',
    coupon_already_in_wallet: '이미 보유 중인 쿠폰입니다. 「내 쿠폰」에서 확인하세요.',
    coupon_max_claims_reached: '이 쿠폰은 더 이상 받을 수 없습니다.',
    coupon_point_cost_invalid: '포인트 교환 설정이 올바르지 않습니다.',
    insufficient_points: '포인트가 부족합니다.',
    member_not_found: '회원 정보를 찾을 수 없습니다.',
    coupon_code_required: '쿠폰 코드가 필요합니다.',
  }
  const en: Record<string, string> = {
    coupon_not_found: 'Coupon not found.',
    coupon_inactive: 'This coupon is not available.',
    coupon_not_in_catalog: 'This coupon is not available for self-collection.',
    coupon_not_in_period: 'This coupon is not within the claim period.',
    coupon_not_member_issue: 'Only member-issue coupons can be collected here.',
    coupon_not_self_claimable: 'This coupon cannot be collected from the app.',
    coupon_already_in_wallet: 'You already have this coupon. Check My coupons.',
    coupon_max_claims_reached: 'You cannot claim this coupon again.',
    coupon_point_cost_invalid: 'Point cost is not configured correctly.',
    insufficient_points: 'Not enough points.',
    member_not_found: 'Member not found.',
    coupon_code_required: 'Coupon code is required.',
  }
  const th: Record<string, string> = {
    coupon_not_found: 'ไม่พบคูปอง',
    coupon_inactive: 'คูปองนี้ใช้ไม่ได้ในขณะนี้',
    coupon_not_in_catalog: 'ไม่สามารถรับคูปองนี้ในแอปได้',
    coupon_not_in_period: 'ยังไม่ถึงช่วงรับคูปอง',
    coupon_not_member_issue: 'รับได้เฉพาะคูปองประเภทออกให้สมาชิก',
    coupon_not_self_claimable: 'ไม่สามารถกดรับคูปองนี้ได้',
    coupon_already_in_wallet: 'มีคูปองนี้อยู่แล้ว ดูที่「คูปองของฉัน」',
    coupon_max_claims_reached: 'รับคูปองนี้ครบจำนวนแล้ว',
    coupon_point_cost_invalid: 'ตั้งค่าแต้มแลกไม่ถูกต้อง',
    insufficient_points: 'แต้มไม่พอ',
    member_not_found: 'ไม่พบข้อมูลสมาชิก',
    coupon_code_required: 'ต้องระบุรหัสคูปอง',
  }
  const map = lang === 'en' ? en : lang === 'th' ? th : ko
  return map[key] || key
}
