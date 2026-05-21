import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { loadPosLoyaltySettings } from '@/lib/pos-loyalty-settings-server'
import {
  revalidateAppliedPosCoupons,
  summarizeLegacyCouponFields,
  validatePosCouponCandidate,
  parseAppliedCouponsFromBody,
  parseAppliedCouponsFromOrderRow,
  type PosAppliedCouponLine,
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
}

type SerialDbRow = {
  id?: number
  coupon_id?: number
  serial_code?: string
  status?: string
}

type MemberIssueRow = {
  id?: number
  member_id?: number
  coupon_code?: string
  status?: string
  used_at?: string | null
}

function normalizeCode(code: string): string {
  return String(code ?? '').trim().toUpperCase()
}

export function mapPosCouponDbRow(row: CouponDbRow | null | undefined): PosCouponTemplate | null {
  if (!row) return null
  const redemptionRaw = String(row.redemption_mode ?? 'reusable_code').trim()
  const stackRaw = String(row.stack_mode ?? 'fixed_only').trim()
  return {
    id: row.id,
    code: normalizeCode(String(row.code ?? '')),
    name: String(row.name ?? ''),
    discountType: row.discount_type === 'percent' ? 'percent' : 'fixed',
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
  }
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

async function findMemberCouponIssue(params: {
  memberId?: number
  code: string
}): Promise<MemberIssueRow | null> {
  const memberId = Math.max(0, Math.trunc(Number(params.memberId ?? 0) || 0))
  const code = normalizeCode(params.code)
  if (!memberId || !code) return null
  const rows = (await supabaseSelectFilter(
    'member_coupon_issues',
    `member_id=eq.${memberId}&coupon_code=eq.${encodeURIComponent(code)}&status=eq.issued`,
    { order: 'id.asc', limit: 1 }
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
  const direct = await loadCouponTemplateByCode(code)
  if (direct) {
    if (direct.redemptionMode === 'member_issue') {
      const memberIssue = await findMemberCouponIssue({ memberId, code })
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
  applied?: PosAppliedCouponLine[]
  candidate: PosCouponCandidateInput
  memberId?: number
}): Promise<PosCouponValidationResult> {
  const loyalty = await loadPosLoyaltySettings()
  const ctx: PosCouponValidationContext = {
    subtotal: Math.max(0, Number(params.subtotal) || 0),
    manualDiscountAmt: Math.max(0, Number(params.manualDiscountAmt ?? 0) || 0),
    collabDiscountAmt: Math.max(0, Number(params.collabDiscountAmt ?? 0) || 0),
    applied: Array.isArray(params.applied) ? params.applied : [],
    todayYmd: getBangkokTodayDateString(),
    loyalty,
  }

  const { template, serial, memberIssue } = await resolveTemplateForCandidate(
    params.candidate,
    params.memberId
  )

  return validatePosCouponCandidate(template, ctx, params.candidate, {
    serialAlreadyRedeemed: serial ? String(serial.status ?? '') === 'redeemed' : false,
    memberIssueAvailable: template?.redemptionMode === 'member_issue' ? Boolean(memberIssue) : undefined,
    memberIssueId: memberIssue?.id,
    serialId: serial?.id,
  })
}

export async function validatePosCouponApplicationList(params: {
  subtotal: number
  manualDiscountAmt?: number
  collabDiscountAmt?: number
  appliedCoupons: PosAppliedCouponLine[]
  memberId?: number
}): Promise<{
  appliedCoupons: PosAppliedCouponLine[]
  couponDiscountTotal: number
  legacy: { couponCode: string; couponDiscountAmt: number }
}> {
  const loyalty = await loadPosLoyaltySettings()
  const templatesByCode = new Map<string, PosCouponTemplate>()
  for (const row of params.appliedCoupons) {
    const code = normalizeCode(row.code)
    if (!code || templatesByCode.has(code)) continue
    const { template } = await resolveTemplateForCandidate({ code }, params.memberId)
    if (template) templatesByCode.set(code, template)
  }
  const ctx = {
    subtotal: Math.max(0, Number(params.subtotal) || 0),
    manualDiscountAmt: Math.max(0, Number(params.manualDiscountAmt ?? 0) || 0),
    collabDiscountAmt: Math.max(0, Number(params.collabDiscountAmt ?? 0) || 0),
    todayYmd: getBangkokTodayDateString(),
    loyalty,
  }
  const appliedCoupons = revalidateAppliedPosCoupons(templatesByCode, ctx, params.appliedCoupons)
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
      { code, quantity: qty },
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

export { parseAppliedCouponsFromBody, parseAppliedCouponsFromOrderRow } from '@/lib/pos-coupon-domain'

export async function resolvePosOrderCouponsForSave(params: {
  body: Record<string, unknown>
  subtotal: number
  manualDiscountAmt: number
  collabDiscountAmt?: number
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
