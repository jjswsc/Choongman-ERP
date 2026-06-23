import { getBangkokDateTimeString, getBangkokTodayDateString } from '@/lib/bangkok-time'
import { expandTruncatedCouponCodeCandidates } from '@/lib/member-coupon-qr'
import { loadPosLoyaltySettings } from '@/lib/pos-loyalty-settings-server'
import {
  summarizeLegacyCouponFields,
  validatePosCouponCandidate,
  parseAppliedCouponsFromBody,
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

  if (issueId > 0 && (!memberId || !code)) {
    return loadMemberCouponIssueById(issueId)
  }
  if (!memberId || !code) return null

  if (issueId > 0) {
    const rows = (await supabaseSelectFilter(
      'member_coupon_issues',
      `id=eq.${issueId}&member_id=eq.${memberId}&coupon_code=eq.${encodeURIComponent(code)}&status=eq.issued&${expiryFilter}`,
      { limit: 1 }
    )) as MemberIssueRow[] | null
    if (rows?.[0]) return rows[0]
    const byIssueId = await loadMemberCouponIssueById(issueId)
    if (!byIssueId) return null
    if (memberId > 0 && Number(byIssueId.member_id || 0) !== memberId) return null
    const issueCode = normalizeCode(byIssueId.coupon_code || '')
    if (code && issueCode) {
      const codeMatches =
        issueCode === code || expandTruncatedCouponCodeCandidates(code).includes(issueCode)
      if (!codeMatches) return null
    }
    return byIssueId
  }
  const rows = (await supabaseSelectFilter(
    'member_coupon_issues',
    `member_id=eq.${memberId}&coupon_code=eq.${encodeURIComponent(code)}&status=eq.issued&${expiryFilter}`,
    { order: 'expires_at.asc,id.asc', limit: 1 }
  )) as MemberIssueRow[] | null
  return rows?.[0] ?? null
}

async function resolveTemplateForCandidate(
  candidate: PosCouponCandidateInput,
  memberId?: number
): Promise<{
  template: PosCouponTemplate | null
  serial: SerialDbRow | null
  memberIssue: MemberIssueRow | null
}> {
  const code = normalizeCode(candidate.code)
  const issueId = Math.max(0, Math.trunc(Number(candidate.memberIssueId ?? 0) || 0))
  const issueFromId = issueId > 0 ? await loadMemberCouponIssueById(issueId) : null

  const codeCandidates = [
    ...(issueFromId?.coupon_code ? [normalizeCode(issueFromId.coupon_code)] : []),
    ...expandTruncatedCouponCodeCandidates(code),
  ].filter(Boolean)
  const uniqueCodes = [...new Set(codeCandidates)]

  let direct: PosCouponTemplate | null = null
  let resolvedCode = code
  for (const candidateCode of uniqueCodes) {
    direct = await loadCouponTemplateByCode(candidateCode)
    if (direct) {
      resolvedCode = candidateCode
      break
    }
  }

  const effectiveMemberId =
    Math.max(
      0,
      Math.trunc(Number(memberId ?? 0) || 0),
      Math.trunc(Number(issueFromId?.member_id ?? 0) || 0)
    ) || undefined

  if (direct) {
    if (direct.redemptionMode === 'member_issue') {
      const memberIssue =
        (await findMemberCouponIssue({
          memberId: effectiveMemberId,
          code: resolvedCode,
          issueId: issueId || issueFromId?.id,
        })) ?? issueFromId
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

  const { template, serial, memberIssue } = await resolveTemplateForCandidate(
    params.candidate,
    params.memberId
  )

  const resolvedCandidateCode = normalizeCode(
    memberIssue?.coupon_code || template?.code || params.candidate.code
  )
  const candidate =
    resolvedCandidateCode && resolvedCandidateCode !== normalizeCode(params.candidate.code)
      ? { ...params.candidate, code: resolvedCandidateCode }
      : params.candidate

  return validatePosCouponCandidate(template, ctx, candidate, {
    serialAlreadyRedeemed: serial ? String(serial.status ?? '') === 'redeemed' : false,
    memberIssueAvailable: template?.redemptionMode === 'member_issue' ? Boolean(memberIssue) : undefined,
    memberIssueId: memberIssue?.id,
    serialId: serial?.id,
  })
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
      kept.push(result.appliedCoupons[result.appliedCoupons.length - 1]!)
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

export async function persistPosOrderCouponRedemptions(params: {
  orderId: number
  storeCode: string
  appliedCoupons: PosAppliedCouponLine[]
  memberId?: number
}): Promise<void> {
  const orderId = Number(params.orderId)
  const storeCode = String(params.storeCode ?? '').trim()
  if (!orderId || !storeCode || !params.appliedCoupons.length) return

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
    let memberCouponIssueId = row.memberCouponIssueId

    const { template, serial, memberIssue } = await resolveTemplateForCandidate(
      { code, quantity: qty, memberIssueId: memberCouponIssueId },
      params.memberId
    )
    if (!couponId && template?.id) couponId = template.id
    if (!serialId && serial?.id) serialId = serial.id
    if (!memberCouponIssueId && memberIssue?.id) memberCouponIssueId = memberIssue.id

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
      await supabaseUpdate('member_coupon_issues', memberCouponIssueId, {
        status: 'used',
        used_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        order_id: orderId,
      })
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
