/**
 * CRM 회원·LINE·등급·포인트 API (pos-operations.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { fetchPosCatalogCached } from '../offline/pos-catalog-offline'

export interface Member {
  id: number
  memberNo: string
  name: string
  fullName?: string
  birthDate?: string
  gender?: string
  nationality?: string
  phone: string
  email: string
  joinChannel?: string
  joinStoreCode?: string
  referredByMemberId?: number
  referralCode?: string
  consentMarketing?: boolean
  consentPrivacy?: boolean
  consentAt?: string
  source: string
  status: string
  lineLinked: boolean
  lineUserId?: string
  lineDisplayName?: string
  tierCode?: string
  pointBalance?: number
  tierPoints?: number
  lifetimeAmount?: number
  lastLineEventType?: string
  lastLineEventAt?: string
  lastUpdateReason?: string
  lastVisitedAt?: string
  createdAt?: string
  updatedAt?: string
}

export type MemberMergeResult = {
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

export async function getLineMembers(params?: { q?: string; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const suffix = q.toString()
  const res = await apiFetchWithOffline('/api/members/line' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<Array<{
    member: Member
    identity: {
      id: number
      providerUserId: string
      displayName: string
      pictureUrl: string
      status: string
      linkedAt: string
      lastSeenAt: string
    }
  }>>
}

export async function linkMemberLine(params: {
  memberId: number
  lineUserId: string
  displayName?: string
  pictureUrl?: string
}) {
  const res = await apiFetchWithOffline(`/api/members/${params.memberId}/link-line`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function unlinkMemberLine(params: { memberId: number; lineUserId?: string }) {
  const res = await apiFetchWithOffline(`/api/members/${params.memberId}/unlink-line`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getLineMessagingStatus() {
  const res = await apiFetchWithOffline('/api/members/line-messaging-status')
  return res.json() as Promise<{
    channelAccessTokenConfigured: boolean
    channelSecretConfigured: boolean
  }>
}

export async function syncLineMembers(params?: { limit?: number }) {
  const res = await apiFetchWithOffline('/api/members/line-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: params?.limit ?? 2000 }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    scanned?: number
    synced?: number
    syncedWithProfile?: number
    syncedStubOnly?: number
    failed?: number
    hasNextCursor?: boolean
    nextCursor?: string
    errors?: string[]
  }>
}

export async function importLineCrmFile(params: { file: File }) {
  const form = new FormData()
  form.set('file', params.file)
  const res = await apiFetchWithOffline('/api/members/line-import', {
    method: 'POST',
    body: form,
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    jobId?: string
    reportType?: 'customer' | 'point' | 'coupon'
    rowCount?: number
    successCount?: number
    failedCount?: number
  }>
}

export async function resetLineMemberList() {
  const res = await apiFetchWithOffline('/api/members/line-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    deactivatedLineIdentities?: number
    deactivatedLineMembers?: number
    deletedImportRows?: number
    deletedImportJobs?: number
  }>
}

export async function getMemberPoints(params?: { memberId?: number; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.memberId) q.set('memberId', String(params.memberId))
  if (params?.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline('/api/member-points?' + q.toString())
  return res.json() as Promise<Array<{
    id: number
    memberId: number
    orderId: number | null
    kind: string
    points: number
    amount: number
    note: string
    createdAt: string
  }>>
}

export async function adjustMemberPoints(params: {
  memberId: number
  points: number
  note?: string
  amount?: number
}) {
  const res = await apiFetchWithOffline('/api/member-points/adjust', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getMemberTiers() {
  const res = await apiFetchWithOffline('/api/member-tiers')
  const data = (await res.json()) as
    | Array<{
        code: string
        name: string
        min_amount: number
        min_points: number
        point_rate: number
        discount_rate?: number
        sort_order: number
        benefits_ko?: string | null
        benefits_en?: string | null
        benefits_th?: string | null
      }>
    | {
        tiers?: Array<{
          code: string
          name: string
          min_amount: number
          min_points: number
          point_rate: number
          sort_order: number
          benefits_ko?: string | null
          benefits_en?: string | null
          benefits_th?: string | null
        }>
        upgradeBasis?: 'amount' | 'points'
      }
  if (Array.isArray(data)) return data
  return data.tiers || []
}

export async function getMemberTierPolicy() {
  const res = await apiFetchWithOffline('/api/member-tiers/policy')
  return res.json() as Promise<{
    success: boolean
    upgradeBasis?: 'amount' | 'points'
    earnBonus?: import('@/lib/member-point-earn-policy').MemberPointEarnBonusPolicy
    pointRetentionYears?: number
    tierDiscountPolicy?: import('@/lib/member-tier-discount-policy').MemberTierDiscountPolicy
    message?: string
  }>
}

export async function saveMemberTierPolicy(params: {
  upgradeBasis?: 'amount' | 'points'
  earnBonus?: import('@/lib/member-point-earn-policy').MemberPointEarnBonusPolicy
  pointRetentionYears?: number
  tierDiscountPolicy?: import('@/lib/member-tier-discount-policy').MemberTierDiscountPolicy
}) {
  const res = await apiFetchWithOffline('/api/member-tiers/policy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    upgradeBasis?: 'amount' | 'points'
    earnBonus?: import('@/lib/member-point-earn-policy').MemberPointEarnBonusPolicy
    pointRetentionYears?: number
    tierDiscountPolicy?: import('@/lib/member-tier-discount-policy').MemberTierDiscountPolicy
    message?: string
  }>
}

export async function getPosMemberTierRates() {
  const res = await apiFetchWithOffline('/api/pos/member-tier-rates')
  return res.json() as Promise<{
    success: boolean
    rates: Record<string, number>
    names?: Record<string, string>
    discountPolicy?: import('@/lib/member-tier-discount-policy').MemberTierDiscountPolicy
  }>
}

export async function saveMemberTier(params: {
  code: string
  name: string
  minAmount: number
  minPoints?: number
  pointRate: number
  discountRate?: number
  sortOrder?: number
  benefitsKo?: string
  benefitsEn?: string
  benefitsTh?: string
}) {
  const res = await apiFetchWithOffline('/api/member-tiers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function recalculateMemberTier(params?: { memberId?: number }) {
  const res = await apiFetchWithOffline('/api/member-tiers/recalculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
  })
  return res.json() as Promise<{ success: boolean; updated?: number; message?: string }>
}

export async function getMemberVisits(params?: {
  memberId?: number
  limit?: number
  startStr?: string
  endStr?: string
  storeCode?: string
}) {
  const q = new URLSearchParams()
  if (params?.memberId) q.set('memberId', String(params.memberId))
  if (params?.limit != null) q.set('limit', String(params.limit))
  if (params?.startStr) q.set('start', params.startStr)
  if (params?.endStr) q.set('end', params.endStr)
  if (params?.storeCode) q.set('store', params.storeCode)
  const suffix = q.toString()
  const res = await apiFetchWithOffline('/api/member-visits' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<Array<{
    orderId: number
    memberId: number
    memberNo: string
    storeCode: string
    orderNo: string
    total: number
    visitedAt: string
  }>>
}

export async function getMemberCoupons(params?: {
  memberId?: number
  limit?: number
  status?: string
  couponCode?: string
  q?: string
}) {
  const q = new URLSearchParams()
  if (params?.memberId) q.set('memberId', String(params.memberId))
  if (params?.limit != null) q.set('limit', String(params.limit))
  if (params?.status) q.set('status', params.status)
  if (params?.couponCode) q.set('couponCode', params.couponCode)
  if (params?.q) q.set('q', params.q)
  const suffix = q.toString()
  const res = await apiFetchWithOffline('/api/member-coupons' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<Array<{
    id: number
    memberId: number
    memberNo?: string
    memberName?: string
    couponCode: string
    couponName?: string
    discountType?: string
    discountValue?: number
    minOrderAmt?: number
    validTo?: string
    issuedAt: string
    expiresAt?: string
    usedAt: string
    orderId: number | null
    status: string
    campaignId?: number | null
    campaignName?: string
  }>>
}

export async function issueMemberCoupon(params: { memberId: number; couponCode: string }) {
  const res = await apiFetchWithOffline('/api/member-coupons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function cancelMemberCouponIssue(params: { issueId: number }) {
  const res = await apiFetchWithOffline('/api/member-coupons/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; cancelledCount?: number }>
}

export async function cancelMemberCouponIssueDuplicates(params: {
  memberId: number
  couponCode: string
  keepNewest?: boolean
}) {
  const res = await apiFetchWithOffline('/api/member-coupons/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, keepNewest: params.keepNewest !== false }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    cancelledCount?: number
    keptIssueId?: number
  }>
}

export async function getMembersCursor(params?: {
  q?: string
  name?: string
  phone?: string
  memberNo?: string
  email?: string
  birthDate?: string
  afterId?: number
  limit?: number
  /** 기본 active. 'all'이면 전체 */
  status?: string
  /** 등급 코드. 비우면 전체 */
  tierCode?: string
}) {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.name?.trim()) q.set('name', params.name.trim())
  if (params?.phone?.trim()) q.set('phone', params.phone.trim())
  if (params?.memberNo?.trim()) q.set('memberNo', params.memberNo.trim())
  if (params?.email?.trim()) q.set('email', params.email.trim())
  if (params?.birthDate?.trim()) q.set('birthDate', params.birthDate.trim())
  if (params?.afterId != null) q.set('afterId', String(params.afterId))
  if (params?.limit != null) q.set('limit', String(params.limit))
  if (params?.status?.trim()) q.set('status', params.status.trim())
  if (params?.tierCode?.trim() && params.tierCode.trim().toLowerCase() !== 'all') {
    q.set('tierCode', params.tierCode.trim())
  }
  const suffix = q.toString()
  const res = await apiFetchWithOffline('/api/members/cursor' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<{ success: boolean; rows: Member[]; nextCursor: number | null; message?: string }>
}

export type MemberPointsSearchFilters = {
  q?: string
  afterId?: number
  limit?: number
  tierCode?: string
  status?: string
  pointBalanceMin?: string | number
  pointBalanceMax?: string | number
  tierPointsMin?: string | number
  tierPointsMax?: string | number
}

export async function searchMembersPoints(params: MemberPointsSearchFilters) {
  const q = new URLSearchParams()
  if (params.q?.trim()) q.set('q', params.q.trim())
  if (params.afterId != null) q.set('afterId', String(params.afterId))
  if (params.limit != null) q.set('limit', String(params.limit))
  if (params.tierCode?.trim()) q.set('tierCode', params.tierCode.trim())
  if (params.status?.trim()) q.set('status', params.status.trim())
  if (params.pointBalanceMin != null && String(params.pointBalanceMin).trim() !== '') {
    q.set('pointBalanceMin', String(params.pointBalanceMin))
  }
  if (params.pointBalanceMax != null && String(params.pointBalanceMax).trim() !== '') {
    q.set('pointBalanceMax', String(params.pointBalanceMax))
  }
  if (params.tierPointsMin != null && String(params.tierPointsMin).trim() !== '') {
    q.set('tierPointsMin', String(params.tierPointsMin))
  }
  if (params.tierPointsMax != null && String(params.tierPointsMax).trim() !== '') {
    q.set('tierPointsMax', String(params.tierPointsMax))
  }
  const suffix = q.toString()
  const res = await apiFetchWithOffline('/api/members/points-search' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<{
    success: boolean
    rows: Member[]
    nextCursor: number | null
    needsCriteria?: boolean
    message?: string
  }>
}

export async function getMembers(params?: { q?: string; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const suffix = q.toString()
  const url = '/api/members' + (suffix ? `?${suffix}` : '')
  const searchQ = params?.q?.trim() || ''
  if (searchQ) {
    const res = await apiFetchWithOffline(url)
    const data = await res.json().catch(() => [])
    return Array.isArray(data) ? (data as Member[]) : []
  }
  const cacheKey = `erp:posMembers::${params?.limit ?? 'default'}`
  const list = await fetchPosCatalogCached<unknown>(cacheKey, url, [])
  return Array.isArray(list) ? (list as Member[]) : []
}

export async function createMember(params: {
  name: string
  phone?: string
  email?: string
  birthDate?: string
  gender?: string
  nationality?: string
  joinChannel?: string
  referralCode?: string
  referredByMemberId?: number
  source?: string
  lineUserId?: string
  lineDisplayName?: string
  linePictureUrl?: string
}) {
  const res = await apiFetchWithOffline('/api/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; code?: string; message?: string; member?: Member }>
}

export async function updateMember(params: {
  id: number
  name?: string
  fullName?: string
  lineDisplayName?: string
  birthDate?: string
  gender?: string
  nationality?: string
  joinChannel?: string
  referralCode?: string
  referredByMemberId?: number
  phone?: string
  email?: string
  consentMarketing?: boolean
  consentPrivacy?: boolean
  consentAt?: string
  status?: string
}) {
  const res = await apiFetchWithOffline(`/api/members/${params.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      fullName: params.fullName,
      lineDisplayName: params.lineDisplayName,
      birthDate: params.birthDate,
      gender: params.gender,
      nationality: params.nationality,
      joinChannel: params.joinChannel,
      referralCode: params.referralCode,
      referredByMemberId: params.referredByMemberId,
      phone: params.phone,
      email: params.email,
      consentMarketing: params.consentMarketing,
      consentPrivacy: params.consentPrivacy,
      consentAt: params.consentAt,
      status: params.status,
    }),
  })
  return res.json() as Promise<{ success: boolean; code?: string; message?: string; member?: Member }>
}

export async function mergeMembers(params: {
  targetMemberId: number
  sourceMemberId?: number
  sourceRef?: string
}) {
  const res = await apiFetchWithOffline(`/api/members/${params.targetMemberId}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceMemberId: params.sourceMemberId,
      sourceRef: params.sourceRef,
    }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    result?: MemberMergeResult
    member?: Member
  }>
}

export async function registerLineMember(params: {
  lineUserId: string
  displayName?: string
  pictureUrl?: string
  phone?: string
  email?: string
  name?: string
}) {
  const res = await apiFetchWithOffline('/api/members/line-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; member?: Member }>
}
