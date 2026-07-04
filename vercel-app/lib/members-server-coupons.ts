import {
  supabaseInsert,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { memberPhoneLookupVariants, normalizeMemberPhone } from '@/lib/member-phone-lookup'
import { resolveMemberPortalCouponStatus } from '@/lib/member-portal-coupon-status'
import { buildUsedMemberCouponIssueMap, type MemberPortalCouponScope } from '@/lib/member-portal-coupon-reconcile'
import { repairFalsePositiveAndDuplicateUsedCouponIssues, cancelOtherIssuedMemberCouponIssues } from '@/lib/member-portal-coupon-repair'
import { toText, getMemberSummaryById } from './members-server-core'

export async function resolveMemberIdsSharingPhone(memberId: number): Promise<number[]> {
  const id = Number(memberId || 0)
  if (!id) return []
  const member = await getMemberSummaryById(id)
  if (!member) return [id]
  const phone = normalizeMemberPhone(member.phone)
  if (!phone) return [id]
  const ids = new Set<number>([id])
  for (const candidate of memberPhoneLookupVariants(phone)) {
    try {
      const rows = (await supabaseSelectFilter(
        'members',
        `phone=eq.${encodeURIComponent(candidate)}`,
        { limit: 30, select: 'id' }
      )) as Array<{ id?: number }>
      for (const row of rows || []) {
        const mid = Number(row.id || 0)
        if (mid) ids.add(mid)
      }
    } catch {
      /* ignore */
    }
  }
  return [...ids].sort((a, b) => a - b)
}

export async function resolveMemberPortalCouponScope(memberId: number): Promise<MemberPortalCouponScope> {
  const memberIds = await resolveMemberIdsSharingPhone(memberId)
  const memberNos = new Set<string>()
  for (const id of memberIds) {
    const member = await getMemberSummaryById(id)
    const memberNo = toText(member?.memberNo).toUpperCase()
    if (memberNo) memberNos.add(memberNo)
  }
  return { memberIds, memberNos: [...memberNos] }
}

async function reconcileMemberCouponIssueStatusesForPortal<
  T extends {
    id: number
    memberId?: number
    couponCode?: string
    status: string
    expiresAt?: string
    validTo?: string
    issuedAt?: string
    orderId?: number | null
    usedAt?: string
  },
>(rows: T[], scope: MemberPortalCouponScope): Promise<T[]> {
  const issuedRows = rows.filter((row) => String(row.status || '').toLowerCase() === 'issued')
  if (!issuedRows.length) return rows

  const usedMeta = await buildUsedMemberCouponIssueMap(
    issuedRows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      couponCode: row.couponCode,
      status: row.status,
      issuedAt: row.issuedAt,
      orderId: row.orderId,
      usedAt: row.usedAt,
    })),
    scope
  )

  const nowBangkok = getBangkokDateTimeString()
  const repaired: T[] = []
  for (const row of rows) {
    const resolved = resolveMemberPortalCouponStatus(row, new Set(usedMeta.keys()))
    if (resolved === 'used' && String(row.status || '').toLowerCase() === 'issued') {
      const redemption = usedMeta.get(Number(row.id || 0))
      try {
        await supabaseUpdateByFilter('member_coupon_issues', `id=eq.${row.id}`, {
          status: 'used',
          used_at: toText(row.usedAt) || nowBangkok,
          ...(redemption?.orderId ? { order_id: redemption.orderId } : {}),
        })
        const couponCode = toText(row.couponCode).toUpperCase()
        if (couponCode && scope.memberIds.length) {
          await cancelOtherIssuedMemberCouponIssues({
            keepIssueId: Number(row.id || 0),
            memberIds: scope.memberIds,
            couponCode,
            reason: 'redeemed_other_issued',
          })
        }
      } catch {
        /* ignore */
      }
      repaired.push({ ...row, status: resolved, ...(redemption?.orderId ? { orderId: redemption.orderId } : {}) })
      continue
    }
    if (resolved !== row.status) {
      repaired.push({ ...row, status: resolved })
      continue
    }
    repaired.push(row)
  }
  return repaired
}

export async function listMemberCouponIssuesForPortalMember(
  memberId: number,
  limit = 100
): Promise<Awaited<ReturnType<typeof listMemberCouponIssues>>> {
  const memberIds = await resolveMemberIdsSharingPhone(memberId)
  const scope = await resolveMemberPortalCouponScope(memberId)
  const rows =
    memberIds.length <= 1
      ? await listMemberCouponIssues({ memberId: memberIds[0] || memberId, limit })
      : await listMemberCouponIssues({ memberIds, limit })
  const repaired = await repairFalsePositiveAndDuplicateUsedCouponIssues(rows)
  return reconcileMemberCouponIssueStatusesForPortal(repaired, scope)
}

export async function listMemberCouponIssues(params?: {
  memberId?: number
  memberIds?: number[]
  limit?: number
  status?: string
  couponCode?: string
  q?: string
}) {
  const filterMemberIds = (params?.memberIds || [])
    .map((id) => Number(id || 0))
    .filter((id) => id > 0)
  const memberId = Number(params?.memberId || 0)
  const limit = Math.max(1, Math.min(Number(params?.limit || 100), 500))
  const statusFilter = String(params?.status || '').trim().toLowerCase()
  const couponCodeFilter = String(params?.couponCode || '').trim().toUpperCase()
  const q = String(params?.q || '').trim().toLowerCase()

  let filter = ''
  if (filterMemberIds.length > 0) {
    filter = `member_id=in.(${filterMemberIds.join(',')})`
  } else if (memberId) {
    filter = `member_id=eq.${memberId}`
  }
  if (statusFilter && statusFilter !== 'all') {
    filter = filter ? `${filter}&status=eq.${encodeURIComponent(statusFilter)}` : `status=eq.${encodeURIComponent(statusFilter)}`
  }
  if (couponCodeFilter) {
    filter = filter
      ? `${filter}&coupon_code=eq.${encodeURIComponent(couponCodeFilter)}`
      : `coupon_code=eq.${encodeURIComponent(couponCodeFilter)}`
  }

  const rows = (filter
    ? await supabaseSelectFilter('member_coupon_issues', filter, { order: 'id.desc', limit })
    : await supabaseSelect('member_coupon_issues', { order: 'id.desc', limit })) as {
    id?: number
    member_id?: number
    coupon_code?: string
    issued_at?: string
    used_at?: string | null
    order_id?: number | null
    status?: string
    campaign_id?: number | null
    expires_at?: string | null
    issued_store_scope?: unknown
    restored_at?: string | null
    restore_reason?: string | null
    restored_from_order_id?: number | null
  }[]

  const couponCodes = Array.from(
    new Set((rows || []).map((row) => toText(row.coupon_code).toUpperCase()).filter(Boolean))
  )
  const campaignIds = Array.from(
    new Set((rows || []).map((row) => Number(row.campaign_id || 0)).filter((x) => x > 0))
  )

  const couponMap = new Map<string, {
    name: string
    discountType: string
    discountValue: number
    minOrderAmt: number
    maxDiscountAmt: number | null
    validTo: string
    stackMode: string
    portalImageUrl: string
  }>()
  if (couponCodes.length > 0) {
    const codeFilter = `code=in.(${couponCodes.map((code) => encodeURIComponent(code)).join(',')})`
    const couponRows = (await supabaseSelectFilter('pos_coupons', codeFilter, {
      limit: 1000,
    })) as Array<{
      code?: string
      name?: string
      discount_type?: string
      benefit_kind?: string | null
      discount_value?: number
      min_order_amt?: number
      max_discount_amt?: number | null
      valid_to?: string | null
      stack_mode?: string | null
      portal_image_url?: string | null
    }>
    for (const coupon of couponRows || []) {
      const code = toText(coupon.code).toUpperCase()
      if (!code) continue
      const benefitKind = toText(coupon.benefit_kind)
      const discountType =
        benefitKind === 'bogo' || benefitKind === 'set_fixed' || benefitKind === 'item_fixed'
          ? benefitKind
          : toText(coupon.discount_type) || 'fixed'
      couponMap.set(code, {
        name: toText(coupon.name) || code,
        discountType,
        discountValue: Number(coupon.discount_value || 0),
        minOrderAmt: Number(coupon.min_order_amt || 0),
        maxDiscountAmt: coupon.max_discount_amt != null ? Number(coupon.max_discount_amt) : null,
        validTo: toText(coupon.valid_to),
        stackMode: toText(coupon.stack_mode) || 'fixed_only',
        portalImageUrl: toText(coupon.portal_image_url),
      })
    }
  }

  const campaignMap = new Map<number, string>()
  if (campaignIds.length > 0) {
    try {
      const campaignRows = (await supabaseSelectFilter(
        'crm_coupon_campaigns',
        `id=in.(${campaignIds.join(',')})`,
        { limit: 1000, select: 'id,name' }
      )) as Array<{ id?: number; name?: string }>
      for (const campaign of campaignRows || []) {
        const id = Number(campaign.id || 0)
        if (!id) continue
        campaignMap.set(id, toText(campaign.name) || `campaign-${id}`)
      }
    } catch {
      // 캠페인 테이블 미배포 환경 호환
    }
  }

  const memberIds = Array.from(new Set((rows || []).map((row) => Number(row.member_id || 0)).filter((x) => x > 0)))
  const memberMap = new Map<number, { memberNo: string; name: string }>()
  if (memberIds.length > 0) {
    try {
      const chunkSize = 80
      for (let i = 0; i < memberIds.length; i += chunkSize) {
        const chunk = memberIds.slice(i, i + chunkSize)
        const memberRows = (await supabaseSelectFilter(
          'members',
          `id=in.(${chunk.join(',')})`,
          { limit: chunk.length, select: 'id,member_no,full_name,name' }
        )) as Array<{ id?: number; member_no?: string; full_name?: string; name?: string }>
        for (const member of memberRows || []) {
          const id = Number(member.id || 0)
          if (!id) continue
          memberMap.set(id, {
            memberNo: toText(member.member_no),
            name: toText(member.full_name) || toText(member.name),
          })
        }
      }
    } catch {
      // members 테이블 조회 실패 시 memberId만 표시
    }
  }

  const mapped = (rows || []).map((row) => {
    const couponCode = toText(row.coupon_code).toUpperCase()
    const coupon = couponMap.get(couponCode)
    const campaignId = Number(row.campaign_id || 0) || null
    const issuedScopeRaw = row.issued_store_scope
    const issuedStoreScope = Array.isArray(issuedScopeRaw)
      ? issuedScopeRaw.map((x) => toText(x)).filter(Boolean)
      : []
    const mid = Number(row.member_id || 0)
    const member = memberMap.get(mid)
    return {
      id: Number(row.id || 0),
      memberId: mid,
      memberNo: member?.memberNo || '',
      memberName: member?.name || '',
      couponCode,
      couponName: coupon?.name || couponCode,
      discountType: coupon?.discountType || 'fixed',
      discountValue: coupon?.discountValue || 0,
      minOrderAmt: coupon?.minOrderAmt || 0,
      maxDiscountAmt: coupon?.maxDiscountAmt ?? null,
      validTo: coupon?.validTo || '',
      stackMode: coupon?.stackMode || 'fixed_only',
      issuedAt: toText(row.issued_at),
      expiresAt: toText(row.expires_at),
      usedAt: toText(row.used_at),
      orderId: Number(row.order_id || 0) || null,
      status: toText(row.status) || 'issued',
      campaignId,
      campaignName: campaignId ? campaignMap.get(campaignId) || '' : '',
      issuedStoreScope,
      restoredAt: toText(row.restored_at),
      restoreReason: toText(row.restore_reason),
      restoredFromOrderId: Number(row.restored_from_order_id || 0) || null,
      portalImageUrl: coupon?.portalImageUrl || '',
    }
  })

  if (!q) return mapped
  return mapped.filter((row) => {
    const hay = [
      row.memberNo,
      row.memberName,
      row.couponCode,
      row.couponName,
      row.campaignName,
      String(row.memberId || ''),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

function isMissingColumnError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '')
  return (
    /PGRST204/i.test(msg) ||
    (/column/i.test(msg) && (/does not exist/i.test(msg) || /could not find/i.test(msg)))
  )
}

export async function issueMemberCoupon(params: { memberId: number; couponCode: string }) {
  const memberId = Number(params.memberId || 0)
  const couponCode = toText(params.couponCode).toUpperCase()
  if (!memberId) throw new Error('유효한 memberId가 필요합니다.')
  if (!couponCode) throw new Error('couponCode가 필요합니다.')

  const couponRows = (await supabaseSelectFilter(
    'pos_coupons',
    `code=eq.${encodeURIComponent(couponCode)}`,
    { limit: 1, select: 'id,is_active,valid_to,redemption_mode' }
  )) as Array<{ id?: number; is_active?: boolean; valid_to?: string | null; redemption_mode?: string | null }>
  const coupon = couponRows?.[0]
  if (!coupon?.id) {
    throw new Error(`POS 쿠폰 마스터에 ${couponCode} 코드가 없습니다.`)
  }
  if (coupon.is_active === false) {
    throw new Error('비활성 상태의 쿠폰은 발급할 수 없습니다.')
  }
  const redemptionMode = toText(coupon.redemption_mode) || 'reusable_code'
  if (redemptionMode !== 'member_issue') {
    throw new Error(
      '「회원 발급」 유형 쿠폰만 회원에게 지급할 수 있습니다. 쿠폰 정의에서 사용 방식을 확인해 주세요.'
    )
  }

  const duplicateRows = (await supabaseSelectFilter(
    'member_coupon_issues',
    `member_id=eq.${memberId}&coupon_code=eq.${encodeURIComponent(couponCode)}&status=eq.issued`,
    { limit: 1, select: 'id' }
  )) as Array<{ id?: number }>
  if (duplicateRows?.length) {
    throw new Error('이 회원에게 이미 사용 가능한 동일 쿠폰이 있습니다.')
  }

  const issuedAt = getBangkokDateTimeString()
  const baseRow = {
    member_id: memberId,
    coupon_code: couponCode,
    issued_at: issuedAt,
    status: 'issued',
  }
  const expiresAt = toText(coupon.valid_to) || null
  try {
    await supabaseInsert('member_coupon_issues', {
      ...baseRow,
      ...(expiresAt ? { expires_at: expiresAt } : {}),
    })
  } catch (e) {
    if (!isMissingColumnError(e)) throw e
    await supabaseInsert('member_coupon_issues', baseRow)
  }
}

const ADMIN_COUPON_CANCEL_REASON = 'admin_cancel'

async function loadMemberCouponIssueRow(issueId: number) {
  const id = Number(issueId || 0)
  if (!id) return null
  const rows = (await supabaseSelectFilter('member_coupon_issues', `id=eq.${id}`, {
    limit: 1,
    select: 'id,member_id,coupon_code,status',
  })) as Array<{ id?: number; member_id?: number; coupon_code?: string; status?: string }>
  return rows?.[0] || null
}

export async function cancelMemberCouponIssue(issueId: number, reason = ADMIN_COUPON_CANCEL_REASON) {
  const id = Number(issueId || 0)
  if (!id) throw new Error('유효한 issueId가 필요합니다.')

  const row = await loadMemberCouponIssueRow(id)
  if (!row?.id) throw new Error('발급 건을 찾을 수 없습니다.')
  const status = String(row.status || '').trim().toLowerCase()
  if (status !== 'issued' && status !== 'used') {
    throw new Error('사용 가능(issued) 또는 사용 완료(used) 상태만 취소할 수 있습니다.')
  }

  const cancelledAt = getBangkokDateTimeString()
  await supabaseUpdateByFilter('member_coupon_issues', `id=eq.${id}`, {
    status: 'cancelled',
    used_at: null,
    order_id: null,
    restored_at: cancelledAt,
    restore_reason: String(reason || ADMIN_COUPON_CANCEL_REASON).slice(0, 120),
  })
}

export async function cancelMemberCouponIssuesAdmin(params: {
  issueIds?: number[]
  memberId?: number
  couponCode?: string
  keepNewest?: boolean
  reason?: string
}): Promise<{ cancelledCount: number; keptIssueId?: number }> {
  const reason = String(params.reason || ADMIN_COUPON_CANCEL_REASON).slice(0, 120)
  const issueIds = (params.issueIds || []).map((id) => Number(id || 0)).filter((id) => id > 0)
  if (issueIds.length) {
    let cancelledCount = 0
    for (const id of issueIds) {
      try {
        await cancelMemberCouponIssue(id, reason)
        cancelledCount += 1
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e || '')
        if (!/사용 가능\(issued\) 또는 사용 완료\(used\)/.test(msg)) throw e
      }
    }
    return { cancelledCount }
  }

  const memberId = Number(params.memberId || 0)
  const couponCode = toText(params.couponCode).toUpperCase()
  if (!memberId || !couponCode) {
    throw new Error('memberId와 couponCode가 필요합니다.')
  }

  const rows = (await supabaseSelectFilter(
    'member_coupon_issues',
    `member_id=eq.${memberId}&coupon_code=eq.${encodeURIComponent(couponCode)}&status=eq.issued`,
    { order: 'id.desc', limit: 500, select: 'id' }
  )) as Array<{ id?: number }>
  const ids = (rows || []).map((row) => Number(row.id || 0)).filter((id) => id > 0)
  if (!ids.length) return { cancelledCount: 0 }

  if (params.keepNewest) {
    const [keepId, ...cancelIds] = ids
    let cancelledCount = 0
    for (const id of cancelIds) {
      await cancelMemberCouponIssue(id, reason)
      cancelledCount += 1
    }
    return { cancelledCount, keptIssueId: keepId }
  }

  for (const id of ids) {
    await cancelMemberCouponIssue(id, reason)
  }
  return { cancelledCount: ids.length }
}
