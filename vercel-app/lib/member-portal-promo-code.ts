import { getBangkokDateTimeString, getBangkokTodayDateString } from '@/lib/bangkok-time'
import { issueMemberCoupon } from '@/lib/members-server'
import { resolveMemberPortalTenantScope } from '@/lib/member-portal-tenant-scope'
import {
  appendMembersTenantFilter,
  isMembersTenantQueryBlocked,
  isMissingMembersTenantIdColumnError,
  markMembersTenantIdColumnMissing,
  stampMembersTenantId,
  type MembersTenantScope,
} from '@/lib/members-tenant-scope'
import {
  supabaseCountFilter,
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

export type MemberCouponPromoCodeRow = {
  id: number
  code: string
  couponCode: string
  label: string
  note: string
  isActive: boolean
  validFrom: string
  validTo: string
  maxRedemptions: number | null
  maxPerMember: number
  redemptionCount: number
  createdAt: string
  updatedAt: string
}

type PromoDbRow = {
  id?: number
  code?: string
  coupon_code?: string
  label?: string | null
  note?: string | null
  is_active?: boolean | null
  valid_from?: string | null
  valid_to?: string | null
  max_redemptions?: number | null
  max_per_member?: number | null
  redemption_count?: number | null
  created_at?: string | null
  updated_at?: string | null
  tenant_id?: string | null
}

type CouponMasterRow = {
  id?: number
  code?: string
  name?: string
  is_active?: boolean
  valid_from?: string | null
  valid_to?: string | null
  redemption_mode?: string | null
}

function toText(v: unknown): string {
  return String(v || '').trim()
}

export function normalizePromoCode(raw: unknown): string {
  return toText(raw).toUpperCase()
}

function isPromoTableMissing(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '')
  return (
    /PGRST205/i.test(msg) ||
    (/relation/i.test(msg) && /member_coupon_promo/i.test(msg)) ||
    (/could not find/i.test(msg) && /member_coupon_promo/i.test(msg)) ||
    (/does not exist/i.test(msg) && /member_coupon_promo/i.test(msg))
  )
}

function mapPromoRow(row: PromoDbRow): MemberCouponPromoCodeRow {
  return {
    id: Number(row.id || 0),
    code: normalizePromoCode(row.code),
    couponCode: toText(row.coupon_code).toUpperCase(),
    label: toText(row.label),
    note: toText(row.note),
    isActive: row.is_active !== false,
    validFrom: toText(row.valid_from),
    validTo: toText(row.valid_to),
    maxRedemptions:
      row.max_redemptions == null || row.max_redemptions === undefined
        ? null
        : Math.max(1, Math.trunc(Number(row.max_redemptions))),
    maxPerMember: Math.max(1, Math.trunc(Number(row.max_per_member || 1))),
    redemptionCount: Math.max(0, Math.trunc(Number(row.redemption_count || 0))),
    createdAt: toText(row.created_at),
    updatedAt: toText(row.updated_at),
  }
}

function isDateInRange(todayYmd: string, from: string, to: string): boolean {
  if (from && from > todayYmd) return false
  if (to && to < todayYmd) return false
  return true
}

async function loadCouponMaster(
  couponCode: string,
  tenantScope: MembersTenantScope
): Promise<CouponMasterRow | null> {
  const code = toText(couponCode).toUpperCase()
  if (!code || isMembersTenantQueryBlocked(tenantScope)) return null
  const filter = appendMembersTenantFilter(`code=eq.${encodeURIComponent(code)}`, tenantScope)
  try {
    const rows = (await supabaseSelectFilter('pos_coupons', filter, {
      limit: 1,
      select: 'id,code,name,is_active,valid_from,valid_to,redemption_mode',
    })) as CouponMasterRow[]
    return rows?.[0] ?? null
  } catch (e) {
    if (tenantScope.enforce && isMissingMembersTenantIdColumnError(e)) {
      markMembersTenantIdColumnMissing()
      return null
    }
    throw e
  }
}

async function loadPromoByCode(
  code: string,
  tenantScope: MembersTenantScope
): Promise<PromoDbRow | null> {
  const upper = normalizePromoCode(code)
  if (!upper || isMembersTenantQueryBlocked(tenantScope)) return null
  const filter = appendMembersTenantFilter(`code=eq.${encodeURIComponent(upper)}`, tenantScope)
  try {
    const rows = (await supabaseSelectFilter('member_coupon_promo_codes', filter, {
      limit: 1,
    })) as PromoDbRow[]
    return rows?.[0] ?? null
  } catch (e) {
    if (isPromoTableMissing(e)) throw new Error('promo_table_missing')
    if (tenantScope.enforce && isMissingMembersTenantIdColumnError(e)) {
      markMembersTenantIdColumnMissing()
      return null
    }
    throw e
  }
}

async function countMemberPromoRedemptions(promoCodeId: number, memberId: number): Promise<number> {
  try {
    return await supabaseCountFilter(
      'member_coupon_promo_redemptions',
      `promo_code_id=eq.${promoCodeId}&member_id=eq.${memberId}`
    )
  } catch (e) {
    if (isPromoTableMissing(e)) return 0
    throw e
  }
}

async function findActiveWalletIssueId(memberId: number, couponCode: string): Promise<number | null> {
  const code = toText(couponCode).toUpperCase()
  const rows = (await supabaseSelectFilter(
    'member_coupon_issues',
    `member_id=eq.${memberId}&coupon_code=eq.${encodeURIComponent(code)}&status=eq.issued`,
    { limit: 1, select: 'id' }
  )) as Array<{ id?: number }>
  return rows?.[0]?.id ? Number(rows[0].id) : null
}

/**
 * Member-app: redeem a secret promo code → issue member_issue coupon to wallet.
 * Obfuscates missing/inactive/out-of-period promo as `invalid_code`.
 */
export async function redeemMemberPortalPromoCode(params: { memberId: number; code: string }) {
  const memberId = Number(params.memberId || 0)
  const code = normalizePromoCode(params.code)
  if (!memberId) throw new Error('member_not_found')
  if (!code) throw new Error('code_required')

  const tenantScope = await resolveMemberPortalTenantScope({ memberId })
  if (isMembersTenantQueryBlocked(tenantScope)) throw new Error('invalid_code')

  const todayYmd = getBangkokTodayDateString()
  let promo: PromoDbRow | null
  try {
    promo = await loadPromoByCode(code, tenantScope)
  } catch (e) {
    if (e instanceof Error && e.message === 'promo_table_missing') throw new Error('invalid_code')
    throw e
  }

  if (!promo?.id) throw new Error('invalid_code')
  if (promo.is_active === false) throw new Error('invalid_code')
  if (!isDateInRange(todayYmd, toText(promo.valid_from), toText(promo.valid_to))) {
    throw new Error('invalid_code')
  }

  const couponCode = toText(promo.coupon_code).toUpperCase()
  if (!couponCode) throw new Error('coupon_unavailable')

  const coupon = await loadCouponMaster(couponCode, tenantScope)
  if (!coupon?.id) throw new Error('coupon_unavailable')
  if (coupon.is_active === false) throw new Error('coupon_unavailable')
  if (toText(coupon.redemption_mode) !== 'member_issue') throw new Error('coupon_unavailable')
  if (!isDateInRange(todayYmd, toText(coupon.valid_from), toText(coupon.valid_to))) {
    throw new Error('coupon_unavailable')
  }

  const maxPerMember = Math.max(1, Math.trunc(Number(promo.max_per_member || 1)))
  const memberRedeemCount = await countMemberPromoRedemptions(Number(promo.id), memberId)
  if (memberRedeemCount >= maxPerMember) throw new Error('limit_reached')

  const maxRedemptions =
    promo.max_redemptions == null || promo.max_redemptions === undefined
      ? null
      : Math.max(1, Math.trunc(Number(promo.max_redemptions)))
  const redemptionCount = Math.max(0, Math.trunc(Number(promo.redemption_count || 0)))
  if (maxRedemptions != null && redemptionCount >= maxRedemptions) throw new Error('limit_reached')

  if (await findActiveWalletIssueId(memberId, couponCode)) {
    throw new Error('already_owned')
  }

  try {
    await issueMemberCoupon({ memberId, couponCode, tenantScope })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || '')
    if (/이미 사용 가능한 동일 쿠폰/i.test(msg) || /already/i.test(msg)) {
      throw new Error('already_owned')
    }
    throw new Error('coupon_unavailable')
  }

  const issueId = await findActiveWalletIssueId(memberId, couponCode)

  const redemptionRow = stampMembersTenantId(
    {
      promo_code_id: Number(promo.id),
      member_id: memberId,
      issue_id: issueId,
      redeemed_at: getBangkokDateTimeString(),
    },
    tenantScope
  )
  // 지갑 발급이 끝난 뒤에는 audit/카운터 실패로 수령 전체를 실패 처리하지 않음
  try {
    await supabaseInsert('member_coupon_promo_redemptions', redemptionRow)
  } catch (e) {
    if (!isPromoTableMissing(e)) {
      console.warn('[promo-code] redemption audit insert failed', e)
    }
  }

  try {
    await supabaseUpdateByFilter('member_coupon_promo_codes', `id=eq.${Number(promo.id)}`, {
      redemption_count: redemptionCount + 1,
      updated_at: getBangkokDateTimeString(),
    })
  } catch {
    /* counter is best-effort; audit row is source of truth for per-member */
  }

  return {
    code,
    couponCode,
    couponName: toText(coupon.name) || couponCode,
    issueId,
  }
}

export function portalPromoRedeemErrorMessage(code: string, lang: 'ko' | 'en' | 'th' = 'ko'): string {
  const key = toText(code)
  const ko: Record<string, string> = {
    invalid_code: '유효하지 않은 쿠폰 코드입니다.',
    limit_reached: '이 코드는 더 이상 사용할 수 없습니다.',
    already_owned: '이미 보유 중인 쿠폰입니다. 「내 쿠폰」에서 확인하세요.',
    coupon_unavailable: '연결 쿠폰을 발급할 수 없습니다. 나중에 다시 시도해 주세요.',
    code_required: '쿠폰 코드를 입력해 주세요.',
    member_not_found: '회원 정보를 찾을 수 없습니다.',
  }
  const en: Record<string, string> = {
    invalid_code: 'Invalid coupon code.',
    limit_reached: 'This code can no longer be redeemed.',
    already_owned: 'You already have this coupon. Check My coupons.',
    coupon_unavailable: 'Unable to issue the linked coupon. Please try again later.',
    code_required: 'Please enter a coupon code.',
    member_not_found: 'Member not found.',
  }
  const th: Record<string, string> = {
    invalid_code: 'รหัสคูปองไม่ถูกต้อง',
    limit_reached: 'รหัสนี้ใช้ครบจำนวนแล้ว',
    already_owned: 'มีคูปองนี้อยู่แล้ว ดูที่「คูปองของฉัน」',
    coupon_unavailable: 'ไม่สามารถออกคูปองที่เชื่อมได้ ลองใหม่ภายหลัง',
    code_required: 'กรุณากรอกรหัสคูปอง',
    member_not_found: 'ไม่พบข้อมูลสมาชิก',
  }
  const map = lang === 'en' ? en : lang === 'th' ? th : ko
  return map[key] || key
}

/* ─── Admin CRUD ─── */

export async function listMemberCouponPromoCodes(
  tenantScope: MembersTenantScope,
  limit = 200
): Promise<MemberCouponPromoCodeRow[]> {
  if (isMembersTenantQueryBlocked(tenantScope)) return []
  const filter = appendMembersTenantFilter('id=gt.0', tenantScope)
  try {
    const rows = (await supabaseSelectFilter('member_coupon_promo_codes', filter, {
      order: 'id.desc',
      limit: Math.min(500, Math.max(1, Math.trunc(limit))),
    })) as PromoDbRow[]
    return (rows || []).map(mapPromoRow).filter((r) => r.id > 0)
  } catch (e) {
    if (isPromoTableMissing(e)) return []
    if (tenantScope.enforce && isMissingMembersTenantIdColumnError(e)) {
      markMembersTenantIdColumnMissing()
      return []
    }
    throw e
  }
}

export async function saveMemberCouponPromoCode(params: {
  tenantScope: MembersTenantScope
  id?: number
  code: string
  couponCode: string
  label?: string
  note?: string
  isActive?: boolean
  validFrom?: string
  validTo?: string
  maxRedemptions?: number | null
  maxPerMember?: number
}): Promise<{ id: number }> {
  const tenantScope = params.tenantScope
  if (isMembersTenantQueryBlocked(tenantScope)) {
    throw new Error('회사(테넌트) 정보가 없어 저장할 수 없습니다.')
  }

  const code = normalizePromoCode(params.code)
  const couponCode = toText(params.couponCode).toUpperCase()
  if (!code) throw new Error('프로모 코드를 입력해 주세요.')
  if (!couponCode) throw new Error('연결할 쿠폰을 선택해 주세요.')

  const coupon = await loadCouponMaster(couponCode, tenantScope)
  if (!coupon?.id) throw new Error(`POS 쿠폰 마스터에 ${couponCode} 코드가 없습니다.`)
  if (toText(coupon.redemption_mode) !== 'member_issue') {
    throw new Error('「회원 발급」 유형 쿠폰만 프로모 코드에 연결할 수 있습니다.')
  }

  const maxPerMember = Math.max(1, Math.trunc(Number(params.maxPerMember || 1)))
  const maxRedemptionsRaw = params.maxRedemptions
  const maxRedemptions =
    maxRedemptionsRaw == null || maxRedemptionsRaw === undefined || Number(maxRedemptionsRaw) <= 0
      ? null
      : Math.max(1, Math.trunc(Number(maxRedemptionsRaw)))

  const validFrom = toText(params.validFrom) || null
  const validTo = toText(params.validTo) || null
  if (validFrom && validTo && validFrom > validTo) {
    throw new Error('유효 시작일이 종료일보다 늦을 수 없습니다.')
  }

  const now = getBangkokDateTimeString()
  const id = Number(params.id || 0)

  if (id > 0) {
    const existingFilter = appendMembersTenantFilter(`id=eq.${id}`, tenantScope)
    const existing = (await supabaseSelectFilter('member_coupon_promo_codes', existingFilter, {
      limit: 1,
      select: 'id',
    })) as Array<{ id?: number }>
    if (!existing?.[0]?.id) throw new Error('프로모 코드를 찾을 수 없습니다.')

    const dupFilter = appendMembersTenantFilter(
      `code=eq.${encodeURIComponent(code)}&id=neq.${id}`,
      tenantScope
    )
    const dups = (await supabaseSelectFilter('member_coupon_promo_codes', dupFilter, {
      limit: 1,
      select: 'id',
    })) as Array<{ id?: number }>
    if (dups?.length) throw new Error('이미 사용 중인 프로모 코드입니다.')

    await supabaseUpdateByFilter('member_coupon_promo_codes', `id=eq.${id}`, {
      code,
      coupon_code: couponCode,
      label: toText(params.label),
      note: toText(params.note),
      is_active: params.isActive !== false,
      valid_from: validFrom,
      valid_to: validTo,
      max_redemptions: maxRedemptions,
      max_per_member: maxPerMember,
      updated_at: now,
    })
    return { id }
  }

  const dupFilter = appendMembersTenantFilter(`code=eq.${encodeURIComponent(code)}`, tenantScope)
  const dups = (await supabaseSelectFilter('member_coupon_promo_codes', dupFilter, {
    limit: 1,
    select: 'id',
  })) as Array<{ id?: number }>
  if (dups?.length) throw new Error('이미 사용 중인 프로모 코드입니다.')

  const row = stampMembersTenantId(
    {
      code,
      coupon_code: couponCode,
      label: toText(params.label),
      note: toText(params.note),
      is_active: params.isActive !== false,
      valid_from: validFrom,
      valid_to: validTo,
      max_redemptions: maxRedemptions,
      max_per_member: maxPerMember,
      redemption_count: 0,
      created_at: now,
      updated_at: now,
    },
    tenantScope
  )

  try {
    await supabaseInsert('member_coupon_promo_codes', row)
  } catch (e) {
    if (isPromoTableMissing(e)) {
      throw new Error(
        '프로모 코드 테이블이 없습니다. SQL member_coupon_promo_codes.sql 을 실행해 주세요.'
      )
    }
    throw e
  }

  const created = await loadPromoByCode(code, tenantScope)
  if (!created?.id) throw new Error('프로모 코드 저장 후 조회에 실패했습니다.')
  return { id: Number(created.id) }
}

export async function setMemberCouponPromoCodeActive(params: {
  tenantScope: MembersTenantScope
  id: number
  isActive: boolean
}): Promise<void> {
  const id = Number(params.id || 0)
  if (!id) throw new Error('유효한 id가 필요합니다.')
  if (isMembersTenantQueryBlocked(params.tenantScope)) {
    throw new Error('회사(테넌트) 정보가 없어 저장할 수 없습니다.')
  }
  const filter = appendMembersTenantFilter(`id=eq.${id}`, params.tenantScope)
  const existing = (await supabaseSelectFilter('member_coupon_promo_codes', filter, {
    limit: 1,
    select: 'id',
  })) as Array<{ id?: number }>
  if (!existing?.[0]?.id) throw new Error('프로모 코드를 찾을 수 없습니다.')
  await supabaseUpdateByFilter('member_coupon_promo_codes', `id=eq.${id}`, {
    is_active: params.isActive !== false,
    updated_at: getBangkokDateTimeString(),
  })
}

export async function deleteMemberCouponPromoCode(params: {
  tenantScope: MembersTenantScope
  id: number
}): Promise<void> {
  const id = Number(params.id || 0)
  if (!id) throw new Error('유효한 id가 필요합니다.')
  if (isMembersTenantQueryBlocked(params.tenantScope)) {
    throw new Error('회사(테넌트) 정보가 없어 삭제할 수 없습니다.')
  }
  const filter = appendMembersTenantFilter(`id=eq.${id}`, params.tenantScope)
  const existing = (await supabaseSelectFilter('member_coupon_promo_codes', filter, {
    limit: 1,
    select: 'id',
  })) as Array<{ id?: number }>
  if (!existing?.[0]?.id) throw new Error('프로모 코드를 찾을 수 없습니다.')

  await supabaseDeleteByFilter('member_coupon_promo_codes', `id=eq.${id}`)
}
