import { getBangkokDateTimeString, getBangkokTodayDateString } from '@/lib/bangkok-time'
import { expandTruncatedCouponCodeCandidates } from '@/lib/member-coupon-qr'
import { cancelOtherIssuedMemberCouponIssues } from '@/lib/member-portal-coupon-repair'
import { resolveMemberIdsSharingPhone } from '@/lib/members-server'
import { resolveMemberRef } from '@/lib/member-merge-server'
import { isPosCompletionStatus } from '@/lib/pos-order-policy'
import { posOrderPaymentSumFromAmounts } from '@/lib/pos-order-paid-at'
import { loadPosLoyaltySettings } from '@/lib/pos-loyalty-settings-server'
import {
  summarizeLegacyCouponFields,
  validatePosCouponCandidate,
  parseAppliedCouponsFromBody,
  parseAppliedCouponsFromOrderRow,
  type PosAppliedCouponLine,
  type PosCouponCartLine,
  type PosCouponCandidateInput,
  type PosCouponTemplate,
  type PosCouponValidationContext,
  type PosCouponValidationResult,
} from '@/lib/pos-coupon-domain'
import {
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdate,
  supabaseUpdateByFilter,
  supabaseDeleteByFilter,
} from '@/lib/supabase-server'

type CouponDbRow = {
  id?: number
  code?: string
  name?: string
  discount_type?: string
  discount_value?: number
  valid_from?: string | null
  valid_to?: string | null
  is_active?: boolean
  min_order_amt?: number
  max_per_order?: number
  redemption_mode?: string
  allow_quantity_entry?: boolean
  stack_mode?: string
  max_discount_amt?: number | null
  max_uses?: number | null
  used_count?: number
  benefit_kind?: string | null
  set_qty?: number | null
  item_scope_json?: Record<string, unknown> | null
  priority?: number | null
  combinable_with_manual_discount?: boolean | null
}

type SerialDbRow = {
  id?: number
  coupon_id?: number
  serial_code?: string
  status?: string
  order_id?: number | null
}

type MemberIssueRow = {
  id?: number
  member_id?: number
  coupon_code?: string
  status?: string
  used_at?: string | null
  order_id?: number | null
}

type MemberCouponIssueRejectReason = 'already_used' | 'issue_not_available'

type ResolveTemplateResult = {
  template: PosCouponTemplate | null
  serial: SerialDbRow | null
  memberIssue: MemberIssueRow | null
  rejectReason?: MemberCouponIssueRejectReason
}

type RedemptionDbRow = {
  id?: number
  order_id?: number
  coupon_id?: number | null
  coupon_code?: string
  quantity?: number
  serial_id?: number | null
  member_coupon_issue_id?: number | null
}

function normalizeCode(code: string): string {
  return String(code ?? '').trim().toUpperCase()
}

export function mapPosCouponDbRow(row: CouponDbRow | null | undefined): PosCouponTemplate | null {
  if (!row) return null
  const redemptionRaw = String(row.redemption_mode ?? 'reusable_code').trim()
  const stackRaw = String(row.stack_mode ?? 'fixed_only').trim()
  const benefitRaw = String(row.benefit_kind ?? '').trim()
  const discountType =
    benefitRaw === 'bogo' || benefitRaw === 'set_fixed' || benefitRaw === 'item_fixed'
      ? benefitRaw
      : row.discount_type === 'percent'
        ? 'percent'
        : 'fixed'
  const scope = row.item_scope_json && typeof row.item_scope_json === 'object'
    ? row.item_scope_json
    : null
  const menuIds = Array.isArray(scope?.menuIds) ? scope?.menuIds : []
  const categoryCodes = Array.isArray(scope?.categoryCodes) ? scope?.categoryCodes : []
  return {
    id: row.id,
    code: normalizeCode(String(row.code ?? '')),
    name: String(row.name ?? ''),
    discountType,
    discountValue: Number(row.discount_value ?? 0),
    validFrom: row.valid_from || null,
    validTo: row.valid_to || null,
    isActive: row.is_active !== false,
    minOrderAmt: Number(row.min_order_amt ?? 0),
    maxPerOrder: Math.max(1, Math.trunc(Number(row.max_per_order ?? 1) || 1)),
    redemptionMode:
      redemptionRaw === 'single_use_serial' || redemptionRaw === 'member_issue'
        ? redemptionRaw
        : 'reusable_code',
    allowQuantityEntry: Boolean(row.allow_quantity_entry),
    stackMode:
      stackRaw === 'percent_only' || stackRaw === 'any' ? stackRaw : 'fixed_only',
    maxDiscountAmt: row.max_discount_amt != null ? Number(row.max_discount_amt) : null,
    maxUses: row.max_uses != null ? Number(row.max_uses) : null,
    usedCount: Math.max(0, Number(row.used_count ?? 0) || 0),
    setQty: Number(row.set_qty ?? 0) || undefined,
    itemScope: menuIds.length || categoryCodes.length ? { menuIds, categoryCodes } : undefined,
    priority: Number(row.priority ?? 0) || 0,
    allowWithManualDiscount:
      row.combinable_with_manual_discount == null
        ? true
        : Boolean(row.combinable_with_manual_discount),
  }
}

function parseCartLines(raw: unknown): PosCouponCartLine[] {
  if (!Array.isArray(raw)) return []
  const out: PosCouponCartLine[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const data = row as Record<string, unknown>
    const quantity = Math.max(1, Math.trunc(Number(data.quantity ?? data.qty ?? 1) || 1))
    const lineSubtotal = Math.max(
      0,
      Number(
        data.lineSubtotal ??
          data.line_subtotal ??
          ((Number(data.price ?? 0) || 0) * quantity)
      ) || 0
    )
    out.push({
      menuId: String(data.menuId ?? data.menu_id ?? '').trim() || undefined,
      menuCode: String(data.menuCode ?? data.menu_code ?? '').trim() || undefined,
      categoryCode: String(data.categoryCode ?? data.category_code ?? '').trim() || undefined,
      quantity,
      lineSubtotal,
    })
  }
  return out
}

async function loadCouponTemplateByCode(code: string): Promise<PosCouponTemplate | null> {
  const normalized = normalizeCode(code)
  if (!normalized) return null
  const rows = (await supabaseSelectFilter(
    'pos_coupons',
    `code=eq.${encodeURIComponent(normalized)}`,
    { limit: 1 }
  )) as CouponDbRow[] | null
  return mapPosCouponDbRow(rows?.[0])
}

async function loadCouponTemplateByCodeVariants(code: string): Promise<PosCouponTemplate | null> {
  for (const candidate of expandTruncatedCouponCodeCandidates(code)) {
    const template = await loadCouponTemplateByCode(candidate)
    if (template) return template
  }
  return null
}

async function loadCouponTemplateBySerial(code: string): Promise<{
  template: PosCouponTemplate | null
  serial: SerialDbRow | null
}> {
  const normalized = normalizeCode(code)
  if (!normalized) return { template: null, serial: null }
  const serialRows = (await supabaseSelectFilter(
    'pos_coupon_serials',
    `serial_code=eq.${encodeURIComponent(normalized)}`,
    { limit: 1 }
  )) as SerialDbRow[] | null
  const serial = serialRows?.[0] ?? null
  if (!serial?.coupon_id) return { template: null, serial }
  const couponRows = (await supabaseSelectFilter(
    'pos_coupons',
    `id=eq.${Number(serial.coupon_id)}`,
    { limit: 1 }
  )) as CouponDbRow[] | null
  return { template: mapPosCouponDbRow(couponRows?.[0]), serial }
}

async function loadMemberCouponIssueById(issueId: number): Promise<MemberIssueRow | null> {
  const id = Math.max(0, Math.trunc(Number(issueId) || 0))
  if (id <= 0) return null
  const nowBangkok = getBangkokDateTimeString()
  const expiryFilter = `or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(nowBangkok)})`
  const rows = (await supabaseSelectFilter(
    'member_coupon_issues',
    `id=eq.${id}&status=eq.issued&${expiryFilter}`,
    { limit: 1 }
  )) as MemberIssueRow[] | null
  return rows?.[0] ?? null
}

async function loadMemberCouponIssueRawById(issueId: number): Promise<MemberIssueRow | null> {
  const id = Math.max(0, Math.trunc(Number(issueId) || 0))
  if (id <= 0) return null
  const rows = (await supabaseSelectFilter('member_coupon_issues', `id=eq.${id}`, {
    limit: 1,
  })) as MemberIssueRow[] | null
  return rows?.[0] ?? null
}

async function findMemberCouponIssue(params: {
  memberId?: number
  code?: string
  issueId?: number
}): Promise<MemberIssueRow | null> {
  const memberId = Math.max(0, Math.trunc(Number(params.memberId ?? 0) || 0))
  const code = normalizeCode(params.code ?? '')
  const issueId = Math.max(0, Math.trunc(Number(params.issueId ?? 0) || 0))
  const nowBangkok = getBangkokDateTimeString()
  const expiryFilter = `or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(nowBangkok)})`

  if (issueId > 0) {
    const byIssueId = await loadMemberCouponIssueById(issueId)
    if (!byIssueId) return null
    if (memberId > 0) {
      const issueMemberId = Number(byIssueId.member_id || 0)
      if (issueMemberId > 0 && issueMemberId !== memberId) {
        const sharing = await resolveMemberIdsSharingPhone(memberId)
        if (!sharing.includes(issueMemberId)) return null
      }
    }
    if (code) {
      const issueCode = normalizeCode(byIssueId.coupon_code || '')
      const codeMatches = expandTruncatedCouponCodeCandidates(code).some(
        (candidate) => candidate === issueCode || expandTruncatedCouponCodeCandidates(issueCode).includes(candidate)
      )
      if (issueCode && !codeMatches) return null
    }
    return byIssueId
  }
  if (!memberId || !code) return null

  for (const candidate of expandTruncatedCouponCodeCandidates(code)) {
    const rows = (await supabaseSelectFilter(
      'member_coupon_issues',
      `member_id=eq.${memberId}&coupon_code=eq.${encodeURIComponent(candidate)}&status=eq.issued&${expiryFilter}`,
      { order: 'id.desc', limit: 1 }
    )) as MemberIssueRow[] | null
    if (rows?.[0]) return rows[0]
  }
  return null
}

async function resolveExplicitMemberIssueRejectReason(
  issueId: number,
  clientMemberId: number
): Promise<MemberCouponIssueRejectReason> {
  const raw = await loadMemberCouponIssueRawById(issueId)
  if (!raw) return 'issue_not_available'
  if (String(raw.status ?? '').toLowerCase() === 'used') return 'already_used'
  if (clientMemberId > 0 && Number(raw.member_id || 0) !== clientMemberId) return 'issue_not_available'
  return 'issue_not_available'
}

async function resolveTemplateForCandidate(
  candidate: PosCouponCandidateInput,
  memberId?: number
): Promise<ResolveTemplateResult> {
  const code = normalizeCode(candidate.code)
  const issueId = Math.max(0, Math.trunc(Number(candidate.memberIssueId ?? 0) || 0))
  const clientMemberId = Math.max(0, Math.trunc(Number(memberId ?? 0) || 0))
  let issueFromId: MemberIssueRow | null = null

  if (issueId > 0) {
    issueFromId = await findMemberCouponIssue({
      ...(clientMemberId > 0 ? { memberId: clientMemberId } : {}),
      ...(code ? { code } : {}),
      issueId,
    })
    if (issueFromId) {
      const issueCode = normalizeCode(issueFromId.coupon_code || '')
      const template = issueCode
        ? await loadCouponTemplateByCodeVariants(issueCode)
        : null
      if (template) {
        return { template, serial: null, memberIssue: issueFromId }
      }
      return { template: null, serial: null, memberIssue: null, rejectReason: 'issue_not_available' }
    }
    return {
      template: null,
      serial: null,
      memberIssue: null,
      rejectReason: await resolveExplicitMemberIssueRejectReason(issueId, clientMemberId),
    }
  }

  const effectiveMemberId = clientMemberId || undefined

  if (code) {
    const direct = await loadCouponTemplateByCodeVariants(code)
    if (direct) {
      if (direct.redemptionMode === 'member_issue') {
        const memberIssue =
          (await findMemberCouponIssue({
            memberId: effectiveMemberId,
            code,
          })) ?? null
        return { template: direct, serial: null, memberIssue }
      }
      return { template: direct, serial: null, memberIssue: null }
    }

    const serialLookup = await loadCouponTemplateBySerial(code)
    if (serialLookup.template) {
      return {
        template: serialLookup.template,
        serial: serialLookup.serial,
        memberIssue: null,
      }
    }
  }

  return { template: null, serial: null, memberIssue: null }
}

export async function validatePosCouponApplication(params: {
  storeCode?: string
  subtotal: number
  manualDiscountAmt?: number
  collabDiscountAmt?: number
  tierDiscountAmt?: number
  cartLines?: PosCouponCartLine[]
  applied?: PosAppliedCouponLine[]
  candidate: PosCouponCandidateInput
  memberId?: number
}): Promise<PosCouponValidationResult> {
  const loyalty = await loadPosLoyaltySettings()
  const ctx: PosCouponValidationContext = {
    subtotal: Math.max(0, Number(params.subtotal) || 0),
    manualDiscountAmt: Math.max(0, Number(params.manualDiscountAmt ?? 0) || 0),
    collabDiscountAmt: Math.max(0, Number(params.collabDiscountAmt ?? 0) || 0),
    tierDiscountAmt: Math.max(0, Number(params.tierDiscountAmt ?? 0) || 0),
    cartLines: Array.isArray(params.cartLines) ? params.cartLines : [],
    applied: Array.isArray(params.applied) ? params.applied : [],
    todayYmd: getBangkokTodayDateString(),
    loyalty,
  }

  const { template, serial, memberIssue, rejectReason } = await resolveTemplateForCandidate(
    params.candidate,
    params.memberId
  )

  if (rejectReason === 'already_used') {
    return { valid: false, message: '이미 사용된 쿠폰입니다.' }
  }
  if (rejectReason === 'issue_not_available' && params.candidate.memberIssueId) {
    return { valid: false, message: '사용 가능한 회원 쿠폰이 없습니다.' }
  }

  const resolvedCandidateCode = normalizeCode(
    memberIssue?.coupon_code || template?.code || params.candidate.code
  )
  const candidate =
    resolvedCandidateCode && resolvedCandidateCode !== normalizeCode(params.candidate.code)
      ? { ...params.candidate, code: resolvedCandidateCode }
      : params.candidate

  const result = validatePosCouponCandidate(template, ctx, candidate, {
    serialAlreadyRedeemed: serial ? String(serial.status ?? '') === 'redeemed' : false,
    memberIssueAvailable: template?.redemptionMode === 'member_issue' ? Boolean(memberIssue) : undefined,
    memberIssueId: memberIssue?.id,
    serialId: serial?.id,
  })

  const resolvedMemberId =
    Math.max(
      0,
      Math.trunc(Number(memberIssue?.member_id ?? params.memberId ?? 0) || 0)
    ) || undefined

  return {
    ...result,
    ...(resolvedMemberId ? { resolvedMemberId } : {}),
  }
}

async function revalidateAppliedPosCouponsAsync(
  params: {
    subtotal: number
    manualDiscountAmt?: number
    collabDiscountAmt?: number
    tierDiscountAmt?: number
    cartLines?: PosCouponCartLine[]
    memberId?: number
  },
  applied: PosAppliedCouponLine[]
): Promise<PosAppliedCouponLine[]> {
  const sorted = [...applied].sort((a, b) => {
    const aPriority = Number(a.priority ?? 0)
    const bPriority = Number(b.priority ?? 0)
    if (aPriority === bPriority) return 0
    return bPriority - aPriority
  })
  const kept: PosAppliedCouponLine[] = []
  for (const row of sorted) {
    const memberIssueId =
      Math.max(0, Math.trunc(Number(row.memberCouponIssueId ?? 0) || 0)) || undefined
    const result = await validatePosCouponApplication({
      subtotal: params.subtotal,
      manualDiscountAmt: params.manualDiscountAmt,
      collabDiscountAmt: params.collabDiscountAmt,
      tierDiscountAmt: params.tierDiscountAmt,
      cartLines: params.cartLines,
      applied: kept,
      memberId: params.memberId,
      candidate: {
        code: row.code,
        quantity: row.quantity ?? 1,
        ...(memberIssueId ? { memberIssueId } : {}),
      },
    })
    if (result.valid && result.appliedCoupons?.length) {
      const next = result.appliedCoupons[result.appliedCoupons.length - 1]!
      kept.push({
        ...next,
        memberCouponIssueId: next.memberCouponIssueId ?? memberIssueId,
        serialId: next.serialId ?? row.serialId,
        itemScope: next.itemScope ?? row.itemScope,
        discountType: next.discountType ?? row.discountType,
      })
    }
  }
  return kept
}

export async function validatePosCouponApplicationList(params: {
  subtotal: number
  manualDiscountAmt?: number
  collabDiscountAmt?: number
  tierDiscountAmt?: number
  cartLines?: PosCouponCartLine[]
  appliedCoupons: PosAppliedCouponLine[]
  memberId?: number
}): Promise<{
  appliedCoupons: PosAppliedCouponLine[]
  couponDiscountTotal: number
  legacy: { couponCode: string; couponDiscountAmt: number }
}> {
  const appliedCoupons = await revalidateAppliedPosCouponsAsync(
    {
      subtotal: Math.max(0, Number(params.subtotal) || 0),
      manualDiscountAmt: Math.max(0, Number(params.manualDiscountAmt ?? 0) || 0),
      collabDiscountAmt: Math.max(0, Number(params.collabDiscountAmt ?? 0) || 0),
      tierDiscountAmt: Math.max(0, Number(params.tierDiscountAmt ?? 0) || 0),
      cartLines: Array.isArray(params.cartLines) ? params.cartLines : [],
      memberId: params.memberId,
    },
    params.appliedCoupons
  )
  const legacy = summarizeLegacyCouponFields(appliedCoupons)
  return {
    appliedCoupons,
    couponDiscountTotal: legacy.couponDiscountAmt,
    legacy,
  }
}

async function findMemberCouponIssueAcrossMembers(params: {
  memberIds: number[]
  code?: string
  issueId?: number
}): Promise<MemberIssueRow | null> {
  const issueId = Math.max(0, Math.trunc(Number(params.issueId ?? 0) || 0))
  const memberIds = params.memberIds.map((id) => Number(id || 0)).filter((id) => id > 0)
  if (issueId > 0) {
    const raw = await loadMemberCouponIssueRawById(issueId)
    if (!raw) return null
    if (String(raw.status ?? '').toLowerCase() !== 'issued') return null
    if (memberIds.length && !memberIds.includes(Number(raw.member_id || 0))) return null
    return raw
  }
  const code = normalizeCode(params.code ?? '')
  if (!code || !memberIds.length) return null
  for (const memberId of memberIds) {
    const issue = await findMemberCouponIssue({ memberId, code })
    if (issue?.id) return issue
  }
  return null
}

async function markIssuedMemberCouponIssueById(issueId: number, orderId: number): Promise<boolean> {
  const id = Math.max(0, Math.trunc(Number(issueId) || 0))
  if (!id) return false
  const raw = await loadMemberCouponIssueRawById(id)
  if (!raw || String(raw.status ?? '').toLowerCase() !== 'issued') return false
  await markMemberCouponIssueUsed(id, orderId)
  return true
}

async function markMemberCouponIssueUsed(issueId: number, orderId: number): Promise<boolean> {
  const id = Math.max(0, Math.trunc(Number(issueId) || 0))
  if (!id) return false
  try {
    await supabaseUpdateByFilter('member_coupon_issues', `id=eq.${id}&status=eq.issued`, {
      status: 'used',
      used_at: getBangkokDateTimeString(),
      order_id: orderId,
    })
    return true
  } catch (e) {
    console.error('markMemberCouponIssueUsed:', { issueId: id, orderId, error: e })
    return false
  }
}

async function finalizeMemberCouponIssueRedemption(
  issueId: number,
  orderId: number,
  memberIds: number[]
): Promise<void> {
  const id = Math.max(0, Math.trunc(Number(issueId) || 0))
  if (!id) return
  const raw = await loadMemberCouponIssueRawById(id)
  if (!raw) return

  const status = String(raw.status ?? '').toLowerCase()
  const linkedOrderId = Number(raw.order_id || 0)
  const alreadyUsedOnThisOrder = status === 'used' && linkedOrderId === orderId

  if (status !== 'issued' && !alreadyUsedOnThisOrder) return

  if (status === 'issued') {
    await markMemberCouponIssueUsed(id, orderId)
  }

  const code = normalizeCode(raw.coupon_code || '')
  const issueMemberId = Math.max(0, Math.trunc(Number(raw.member_id ?? 0) || 0))
  const scopeMemberIds = memberIds.length
    ? memberIds
    : issueMemberId > 0
      ? await resolveMemberIdsSharingPhone(issueMemberId)
      : []
  if (code && scopeMemberIds.length) {
    await cancelOtherIssuedMemberCouponIssues({
      keepIssueId: id,
      memberIds: scopeMemberIds,
      couponCode: code,
      reason: 'redeemed_other_issued',
    })
  }
}

/** 결제 완료 주문의 applied_coupons·레거시 coupon_code 기준으로 회원 쿠폰 발급 건을 used 처리 */
export async function redeemMemberCouponIssuesForPaidOrder(orderId: number): Promise<number> {
  const id = Number(orderId || 0)
  if (!id) return 0

  const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${id}`, {
    limit: 1,
    select:
      'id,store_code,member_id,member_no,status,total,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app,applied_coupons,coupon_code,coupon_discount_amt,paid_at',
  })) as Array<{
    id?: number
    store_code?: string | null
    member_id?: number | null
    member_no?: string | null
    status?: string | null
    total?: number | null
    payment_cash?: number | null
    payment_card?: number | null
    payment_qr?: number | null
    payment_other?: number | null
    payment_delivery_app?: number | null
    applied_coupons?: unknown
    coupon_code?: string | null
    coupon_discount_amt?: number | null
    paid_at?: string | null
  }>
  const order = rows?.[0]
  if (!order?.id) return 0

  const storeCode = String(order.store_code ?? '').trim()
  if (!storeCode) return 0

  const total = Math.max(0, Number(order.total || 0))
  const paymentSum = posOrderPaymentSumFromAmounts({
    paymentCash: Number(order.payment_cash || 0),
    paymentCard: Number(order.payment_card || 0),
    paymentQr: Number(order.payment_qr || 0),
    paymentOther: Number(order.payment_other || 0),
    paymentDeliveryApp: Number(order.payment_delivery_app || 0),
  })
  const status = String(order.status || '').trim().toLowerCase()
  const paymentComplete = total > 0.02 ? paymentSum >= total - 0.02 : paymentSum > 0
  const paidLike =
    Boolean(String(order.paid_at || '').trim()) ||
    status === 'paid' ||
    status === 'completed' ||
    isPosCompletionStatus(status)
  if (!paymentComplete && !paidLike) return 0

  let applied = parseAppliedCouponsFromOrderRow(order.applied_coupons)
  if (!applied.length) {
    const legacyCode = String(order.coupon_code ?? '').trim().toUpperCase()
    const legacyAmt = Math.max(0, Number(order.coupon_discount_amt ?? 0))
    if (legacyCode) {
      applied = [{ code: legacyCode, name: legacyCode, discountAmt: legacyAmt, quantity: 1 }]
    }
  }
  if (!applied.length) return 0

  const memberId = Math.max(0, Math.trunc(Number(order.member_id ?? 0) || 0)) || undefined
  await persistPosOrderCouponRedemptions({
    orderId: id,
    storeCode,
    appliedCoupons: applied,
    memberId,
  })
  return applied.length
}

export async function persistPosOrderCouponRedemptions(params: {
  orderId: number
  storeCode: string
  appliedCoupons: PosAppliedCouponLine[]
  memberId?: number
}): Promise<void> {
  const orderId = Number(params.orderId)
  const storeCode = String(params.storeCode ?? '').trim()
  if (!orderId || !storeCode || !params.appliedCoupons.length) return

  let memberId = Math.max(0, Math.trunc(Number(params.memberId ?? 0) || 0)) || undefined
  let orderMemberNo = ''
  try {
    const orderRows = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
      limit: 1,
      select: 'member_id,member_no',
    })) as Array<{ member_id?: number | null; member_no?: string | null }>
    if (!memberId) {
      memberId = Math.max(0, Math.trunc(Number(orderRows?.[0]?.member_id ?? 0) || 0)) || undefined
    }
    orderMemberNo = String(orderRows?.[0]?.member_no ?? '').trim().toUpperCase()
    if (!memberId && orderMemberNo) {
      const ref = await resolveMemberRef(orderMemberNo)
      memberId = Math.max(0, Math.trunc(Number(ref?.id ?? 0) || 0)) || undefined
    }
  } catch {
    /* ignore */
  }
  const memberIdsForRedeem = memberId ? await resolveMemberIdsSharingPhone(memberId) : []

  try {
    await supabaseDeleteByFilter('pos_order_coupon_redemptions', `order_id=eq.${orderId}`)
  } catch {
    /* table may not exist yet on older DB */
  }

  for (const row of params.appliedCoupons) {
    const code = normalizeCode(row.code)
    if (!code) continue
    const qty = Math.max(1, Math.trunc(Number(row.quantity ?? 1) || 1))
    const discountAmt = Math.max(0, Number(row.discountAmt ?? 0) || 0)

    let serialId = row.serialId
    let couponId = row.couponId
    let memberCouponIssueId = Math.max(0, Math.trunc(Number(row.memberCouponIssueId ?? 0) || 0)) || undefined

    const { template, serial, memberIssue } = await resolveTemplateForCandidate(
      { code, quantity: qty, memberIssueId: memberCouponIssueId },
      memberId
    )
    if (!couponId && template?.id) couponId = template.id
    if (!serialId && serial?.id) serialId = serial.id
    if (!memberCouponIssueId && memberIssue?.id) memberCouponIssueId = memberIssue.id
    if (!memberCouponIssueId && memberIdsForRedeem.length) {
      const fallback = await findMemberCouponIssueAcrossMembers({
        memberIds: memberIdsForRedeem,
        code,
        issueId: memberCouponIssueId,
      })
      if (fallback?.id) memberCouponIssueId = fallback.id
    }

    await supabaseInsert('pos_order_coupon_redemptions', {
      order_id: orderId,
      store_code: storeCode,
      coupon_id: couponId || null,
      coupon_code: code,
      discount_amt: discountAmt,
      quantity: qty,
      serial_id: serialId || null,
      member_coupon_issue_id: memberCouponIssueId || null,
    })

    if (serialId) {
      await supabaseUpdate('pos_coupon_serials', serialId, {
        status: 'redeemed',
        order_id: orderId,
        redeemed_at: new Date().toISOString(),
      })
    }

    if (memberCouponIssueId) {
      await finalizeMemberCouponIssueRedemption(memberCouponIssueId, orderId, memberIdsForRedeem)
    } else if (memberIssue?.id) {
      await finalizeMemberCouponIssueRedemption(memberIssue.id, orderId, memberIdsForRedeem)
    } else {
      let scopeMemberIds = memberIdsForRedeem
      if (!scopeMemberIds.length && orderMemberNo) {
        const ref = await resolveMemberRef(orderMemberNo)
        if (ref?.id) {
          scopeMemberIds = await resolveMemberIdsSharingPhone(ref.id)
        }
      }
      if (scopeMemberIds.length) {
        const fallbackIssue = await findMemberCouponIssueAcrossMembers({
          memberIds: scopeMemberIds,
          code,
        })
        if (fallbackIssue?.id) {
          await finalizeMemberCouponIssueRedemption(fallbackIssue.id, orderId, scopeMemberIds)
        } else {
          console.error('persistPosOrderCouponRedemptions: no issued issue', {
            orderId,
            code,
            memberIds: scopeMemberIds,
          })
        }
      } else {
        console.error('persistPosOrderCouponRedemptions: no member scope', {
          orderId,
          code,
          orderMemberNo,
        })
      }
    }

    if (couponId) {
      const couponRows = (await supabaseSelectFilter('pos_coupons', `id=eq.${couponId}`, { limit: 1 })) as CouponDbRow[]
      const current = Math.max(0, Number(couponRows?.[0]?.used_count ?? 0) || 0)
      await supabaseUpdateByFilter('pos_coupons', `id=eq.${couponId}`, {
        used_count: current + qty,
        updated_at: new Date().toISOString(),
      })
    }
  }
}

export async function rollbackPosOrderCouponRedemptions(params: {
  orderId: number
  reason?: string
}): Promise<{
  restoredIssueCount: number
  restoredSerialCount: number
  decrementedCouponCount: number
}> {
  const orderId = Number(params.orderId || 0)
  if (!orderId) return { restoredIssueCount: 0, restoredSerialCount: 0, decrementedCouponCount: 0 }

  const redemptions = (await supabaseSelectFilter(
    'pos_order_coupon_redemptions',
    `order_id=eq.${orderId}`,
    { limit: 5000 }
  )) as RedemptionDbRow[]
  if (!redemptions?.length) {
    return { restoredIssueCount: 0, restoredSerialCount: 0, decrementedCouponCount: 0 }
  }

  let restoredIssueCount = 0
  let restoredSerialCount = 0
  const qtyByCouponId = new Map<number, number>()
  const restoredAt = new Date().toISOString().slice(0, 19).replace('T', ' ')

  for (const row of redemptions) {
    const serialId = Number(row.serial_id || 0)
    const issueId = Number(row.member_coupon_issue_id || 0)
    const couponId = Number(row.coupon_id || 0)
    const qty = Math.max(1, Math.trunc(Number(row.quantity ?? 1) || 1))

    if (serialId > 0) {
      await supabaseUpdate('pos_coupon_serials', serialId, {
        status: 'issued',
        order_id: null,
        redeemed_at: null,
      })
      restoredSerialCount += 1
    }

    if (issueId > 0) {
      await supabaseUpdate('member_coupon_issues', issueId, {
        status: 'issued',
        used_at: null,
        order_id: null,
        restored_at: restoredAt,
        restore_reason: String(params.reason || 'order_reversal').slice(0, 120),
        restored_from_order_id: orderId,
      })
      restoredIssueCount += 1
    }

    if (couponId > 0) {
      qtyByCouponId.set(couponId, (qtyByCouponId.get(couponId) || 0) + qty)
    }
  }

  let decrementedCouponCount = 0
  for (const [couponId, qty] of qtyByCouponId.entries()) {
    const couponRows = (await supabaseSelectFilter('pos_coupons', `id=eq.${couponId}`, {
      limit: 1,
      select: 'id,used_count',
    })) as Array<{ id?: number; used_count?: number }>
    const current = Math.max(0, Number(couponRows?.[0]?.used_count ?? 0) || 0)
    await supabaseUpdateByFilter('pos_coupons', `id=eq.${couponId}`, {
      used_count: Math.max(0, current - qty),
      updated_at: new Date().toISOString(),
    })
    decrementedCouponCount += 1
  }

  await supabaseDeleteByFilter('pos_order_coupon_redemptions', `order_id=eq.${orderId}`)

  return { restoredIssueCount, restoredSerialCount, decrementedCouponCount }
}

export { parseAppliedCouponsFromBody, parseAppliedCouponsFromOrderRow } from '@/lib/pos-coupon-domain'

export async function resolvePosOrderCouponsForSave(params: {
  body: Record<string, unknown>
  subtotal: number
  manualDiscountAmt: number
  collabDiscountAmt?: number
  tierDiscountAmt?: number
  cartLines?: PosCouponCartLine[]
  memberId?: number
}): Promise<{
  appliedCoupons: PosAppliedCouponLine[]
  couponCode: string
  couponDiscountAmt: number
  appliedCouponsJson: unknown[] | null
}> {
  let applied = parseAppliedCouponsFromBody(params.body.appliedCoupons ?? params.body.applied_coupons)
  const legacyCode = normalizeCode(String(params.body.couponCode ?? params.body.coupon_code ?? ''))
  const legacyAmt = Math.max(0, Number(params.body.couponDiscountAmt ?? params.body.coupon_discount_amt ?? 0))
  if (!applied.length && legacyCode) {
    applied = [
      {
        code: legacyCode,
        name: legacyCode,
        discountAmt: legacyAmt,
        quantity: 1,
      },
    ]
  }

  if (!applied.length) {
    return {
      appliedCoupons: [],
      couponCode: '',
      couponDiscountAmt: 0,
      appliedCouponsJson: null,
    }
  }

  const validated = await validatePosCouponApplicationList({
    subtotal: params.subtotal,
    manualDiscountAmt: params.manualDiscountAmt,
    collabDiscountAmt: params.collabDiscountAmt,
    tierDiscountAmt: params.tierDiscountAmt,
    cartLines:
      Array.isArray(params.cartLines) && params.cartLines.length > 0
        ? params.cartLines
        : parseCartLines(params.body.items ?? params.body.items_json),
    appliedCoupons: applied,
    memberId: params.memberId,
  })

  return {
    appliedCoupons: validated.appliedCoupons,
    couponCode: validated.legacy.couponCode,
    couponDiscountAmt: validated.legacy.couponDiscountAmt,
    appliedCouponsJson: validated.appliedCoupons,
  }
}
