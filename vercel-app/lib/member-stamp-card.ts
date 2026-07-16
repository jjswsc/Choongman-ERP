import { getBangkokTodayDateString, getBangkokDateTimeString } from '@/lib/bangkok-time'
import { bangkokYmdRangeToIsoBounds } from '@/lib/bangkok-date'
import { adjustMemberPoints, issueMemberCoupon } from '@/lib/members-server'
import { resolveMemberPortalTenantScope } from '@/lib/member-portal-tenant-scope'
import { resolvePointEarnChannel } from '@/lib/member-point-earn-policy'
import {
  LEGACY_MEMBERS_TENANT_SCOPE,
  stampMembersTenantId,
  type MembersTenantScope,
} from '@/lib/members-tenant-scope'
import {
  tenantScopedSettingsKey,
  tenantScopedSettingsKeys,
  type TenantSettingsScope,
} from '@/lib/tenant-system-settings'
import { notifyMemberStampLineMessage } from '@/lib/member-stamp-notify'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
  supabaseUpsert,
} from '@/lib/supabase-server'
import { getMemberSummaryById } from '@/lib/members-server-core'

export const MEMBER_STAMP_POLICY_KEY = 'member_stamp_policy'

export type MemberStampEarnMode = 'day' | 'order'
export type MemberStampRewardType = 'coupon' | 'points'
export type MemberStampChannel = 'dine_in' | 'takeout' | 'delivery' | 'member_portal' | 'other'

export type MemberStampPolicyBase = {
  enabled: boolean
  cardSlots: number
  earnMode: MemberStampEarnMode
  resetAfterComplete: boolean
  minOrderAmt: number
  cardExpiryDays: number
  lineNotifyEnabled: boolean
  excludeZeroAmount: boolean
  allowedChannels: MemberStampChannel[]
  completeBonusCouponCode: string
  completeBonusPoints: number
}

export type MemberStampPolicy = MemberStampPolicyBase & {
  storeOverrides: Record<string, Partial<MemberStampPolicyBase>>
}

export type MemberStampMilestone = {
  id: number
  stampCount: number
  rewardType: MemberStampRewardType
  rewardPoints: number
  couponCode: string
  labelKo: string
  labelEn: string
  labelTh: string
  sortOrder: number
  isActive: boolean
}

export type MemberStampMilestoneInput = Omit<MemberStampMilestone, 'id'> & { id?: number }

export type MemberStampCardStatus = {
  enabled: boolean
  /** 정책 OFF·DB 미적용 등으로 아직 운영 전일 때 true (회원앱 안내용) */
  preparing?: boolean
  cardSlots: number
  earnMode: MemberStampEarnMode
  resetAfterComplete: boolean
  minOrderAmt: number
  cardExpiryDays: number
  cardExpiresAt: string | null
  currentStamps: number
  cardSequence: number
  totalEarned: number
  progressPercent: number
  milestones: Array<MemberStampMilestone & { achieved: boolean; label: string; isMilestoneSlot: boolean }>
  nextMilestone: (MemberStampMilestone & { label: string; stampsRemaining: number }) | null
}

export type MemberStampRecordResult = {
  stamped: boolean
  newBalance: number
  cardSequence: number
  displayStamps: number
  cardSlots: number
  rewardsIssued: string[]
  pointsAwarded: number
  milestonesReached: Array<{ stampCount: number; label: string; rewardType: MemberStampRewardType }>
  cardCompleted: boolean
  ledgerId: number | null
  skippedReason?: string
}

export type MemberStampHistoryRow = {
  id: number
  kind: string
  storeCode: string
  stampYmd: string
  balanceAfter: number
  note: string
  createdAt: string
}

export type MemberStampAdminStats = {
  days: number | null
  startYmd: string
  endYmd: string
  totalEarns: number
  uniqueMembers: number
  milestoneRewards: number
  couponFailures: number
  cardCompletions: number
  storeRows: Array<{ storeCode: string; earnCount: number }>
}

export type StampCouponValidationRow = {
  stampCount: number
  couponCode: string
  rewardType: MemberStampRewardType
  ok: boolean
  message: string
}

export const DEFAULT_MEMBER_STAMP_POLICY: MemberStampPolicy = {
  enabled: false,
  cardSlots: 10,
  earnMode: 'day',
  resetAfterComplete: true,
  minOrderAmt: 0,
  cardExpiryDays: 0,
  lineNotifyEnabled: true,
  excludeZeroAmount: true,
  allowedChannels: [],
  completeBonusCouponCode: '',
  completeBonusPoints: 0,
  storeOverrides: {},
}

function toText(v: unknown): string {
  return String(v || '').trim()
}

function normalizeCouponCode(raw: unknown): string {
  return toText(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
}

function isMissingTableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '')
  return /42p01|relation .* does not exist|PGRST204|column .* does not exist/i.test(msg)
}

function normalizeChannels(raw: unknown): MemberStampChannel[] {
  if (!Array.isArray(raw)) return []
  const allowed = new Set<MemberStampChannel>(['dine_in', 'takeout', 'delivery', 'member_portal', 'other'])
  return raw.map((x) => toText(x) as MemberStampChannel).filter((x) => allowed.has(x))
}

function normalizeStoreOverrides(raw: unknown): Record<string, Partial<MemberStampPolicyBase>> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, Partial<MemberStampPolicyBase>> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const storeCode = toText(key)
    if (!storeCode || !value || typeof value !== 'object') continue
    out[storeCode] = normalizeMemberStampPolicyBase(value)
  }
  return out
}

function normalizeMemberStampPolicyBase(raw: unknown): MemberStampPolicyBase {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const earnMode = toText(src.earnMode) === 'order' ? 'order' : 'day'
  const cardSlots = Math.max(1, Math.min(30, Math.trunc(Number(src.cardSlots || DEFAULT_MEMBER_STAMP_POLICY.cardSlots))))
  const minOrderAmt = Math.max(0, Number(src.minOrderAmt || 0))
  const cardExpiryDays = Math.max(0, Math.min(3650, Math.trunc(Number(src.cardExpiryDays || 0))))
  const completeBonusPoints = Math.max(0, Math.trunc(Number(src.completeBonusPoints || 0)))
  return {
    enabled: src.enabled === true,
    cardSlots,
    earnMode,
    resetAfterComplete: src.resetAfterComplete !== false,
    minOrderAmt: Number.isFinite(minOrderAmt) ? minOrderAmt : 0,
    cardExpiryDays,
    lineNotifyEnabled: src.lineNotifyEnabled !== false,
    excludeZeroAmount: src.excludeZeroAmount !== false,
    allowedChannels: normalizeChannels(src.allowedChannels),
    completeBonusCouponCode: normalizeCouponCode(src.completeBonusCouponCode),
    completeBonusPoints,
  }
}

export function normalizeMemberStampPolicy(raw: unknown): MemberStampPolicy {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const base = normalizeMemberStampPolicyBase(src)
  return {
    ...base,
    storeOverrides: normalizeStoreOverrides(src.storeOverrides),
  }
}

export function resolveEffectiveStampPolicy(
  globalPolicy: MemberStampPolicy,
  storeCode?: string
): MemberStampPolicyBase {
  const store = toText(storeCode)
  const override = store ? globalPolicy.storeOverrides[store] : undefined
  if (!override) return globalPolicy
  return normalizeMemberStampPolicy({ ...globalPolicy, ...override, storeOverrides: globalPolicy.storeOverrides })
}

export function resolveOrderStampChannel(params: {
  createdBy?: string | null
  orderType?: string | null
}): MemberStampChannel {
  return resolvePointEarnChannel(params)
}

export function isStampChannelAllowed(
  policy: MemberStampPolicyBase,
  channel: MemberStampChannel
): boolean {
  if (!policy.allowedChannels?.length) return true
  return policy.allowedChannels.includes(channel)
}

export function displayMemberStampCount(
  balance: number,
  cardSlots: number,
  resetAfterComplete: boolean
): number {
  const slots = Math.max(1, cardSlots)
  const bal = Math.max(0, Math.trunc(balance))
  if (resetAfterComplete) return Math.min(bal, slots)
  if (bal === 0) return 0
  const mod = bal % slots
  return mod === 0 ? slots : mod
}

function toTenantSettingsScope(scope: MembersTenantScope): TenantSettingsScope {
  return { enforce: scope.enforce, tenantId: scope.tenantId }
}

async function resolveStampTenantScope(memberId: number): Promise<MembersTenantScope> {
  return resolveMemberPortalTenantScope({ memberId })
}

function stampStampRow<T extends Record<string, unknown>>(
  row: T,
  scope: MembersTenantScope
): T {
  return stampMembersTenantId(row, scope)
}

export async function loadMemberStampPolicy(opts?: {
  tenantScope?: MembersTenantScope
  memberId?: number
}): Promise<MemberStampPolicy> {
  let scope = opts?.tenantScope ?? LEGACY_MEMBERS_TENANT_SCOPE
  if (opts?.memberId && !opts?.tenantScope) {
    scope = await resolveStampTenantScope(opts.memberId)
  }
  const keys = tenantScopedSettingsKeys(MEMBER_STAMP_POLICY_KEY, toTenantSettingsScope(scope))
  try {
    for (const key of keys) {
      const rows = (await supabaseSelectFilter('system_settings', `key=eq.${encodeURIComponent(key)}`, {
        limit: 1,
        select: 'value_json',
      })) as { value_json?: unknown }[]
      const raw = rows?.[0]?.value_json
      if (raw == null || raw === '') continue
      if (typeof raw === 'string') {
        try {
          return normalizeMemberStampPolicy(JSON.parse(raw))
        } catch {
          continue
        }
      }
      return normalizeMemberStampPolicy(raw)
    }
    return { ...DEFAULT_MEMBER_STAMP_POLICY }
  } catch {
    return { ...DEFAULT_MEMBER_STAMP_POLICY }
  }
}

export async function saveMemberStampPolicy(
  policy: MemberStampPolicy,
  opts?: { tenantScope?: MembersTenantScope }
): Promise<MemberStampPolicy> {
  const scope = opts?.tenantScope ?? LEGACY_MEMBERS_TENANT_SCOPE
  const normalized = normalizeMemberStampPolicy(policy)
  const key = tenantScopedSettingsKey(MEMBER_STAMP_POLICY_KEY, toTenantSettingsScope(scope))
  await supabaseUpsert(
    'system_settings',
    [
      {
        key,
        value_json: normalized,
        updated_at: getBangkokDateTimeString(),
      },
    ],
    'key'
  )
  return normalized
}

function rowToMilestone(row: Record<string, unknown>): MemberStampMilestone {
  const rewardType = toText(row.reward_type) === 'points' ? 'points' : 'coupon'
  return {
    id: Number(row.id || 0),
    stampCount: Math.max(1, Math.trunc(Number(row.stamp_count || 0))),
    rewardType,
    rewardPoints: Math.max(0, Math.trunc(Number(row.reward_points || 0))),
    couponCode: normalizeCouponCode(row.coupon_code),
    labelKo: toText(row.label_ko),
    labelEn: toText(row.label_en),
    labelTh: toText(row.label_th),
    sortOrder: Math.trunc(Number(row.sort_order || 0)),
    isActive: row.is_active !== false,
  }
}

export async function listMemberStampMilestones(includeInactive = true): Promise<MemberStampMilestone[]> {
  try {
    const rows = (await supabaseSelect('member_stamp_milestones', {
      order: 'sort_order.asc,stamp_count.asc',
      limit: 100,
    })) as Array<Record<string, unknown>>
    const list = (rows || [])
      .map(rowToMilestone)
      .filter((m) => m.stampCount > 0 && (m.rewardType === 'points' ? m.rewardPoints > 0 : Boolean(m.couponCode)))
    return includeInactive ? list : list.filter((m) => m.isActive)
  } catch (e) {
    if (isMissingTableError(e)) return []
    throw e
  }
}

export async function saveMemberStampMilestones(inputs: MemberStampMilestoneInput[]): Promise<MemberStampMilestone[]> {
  const normalized = inputs
    .map((row, idx) => ({
      stamp_count: Math.max(1, Math.trunc(Number(row.stampCount || 0))),
      reward_type: row.rewardType === 'points' ? 'points' : 'coupon',
      reward_points: Math.max(0, Math.trunc(Number(row.rewardPoints || 0))),
      coupon_code:
        row.rewardType === 'points'
          ? normalizeCouponCode(row.couponCode) || null
          : normalizeCouponCode(row.couponCode) || null,
      label_ko: toText(row.labelKo) || null,
      label_en: toText(row.labelEn) || null,
      label_th: toText(row.labelTh) || null,
      sort_order: Math.trunc(Number(row.sortOrder ?? idx + 1)),
      is_active: row.isActive !== false,
      updated_at: getBangkokDateTimeString(),
    }))
    .filter((row) => {
      if (row.reward_type === 'points') return row.reward_points > 0
      return Boolean(row.coupon_code)
    })

  try {
    const existing = (await supabaseSelect('member_stamp_milestones', {
      select: 'id',
      limit: 200,
    })) as Array<{ id?: number }>
    for (const row of existing || []) {
      const id = Number(row.id || 0)
      if (id) await supabaseDeleteByFilter('member_stamp_milestones', `id=eq.${id}`)
    }
    for (const row of normalized) {
      try {
        await supabaseInsert('member_stamp_milestones', {
          ...row,
          created_at: getBangkokDateTimeString(),
        })
      } catch (e) {
        if (!isMissingTableError(e)) throw e
        await supabaseInsert('member_stamp_milestones', {
          stamp_count: row.stamp_count,
          coupon_code: row.coupon_code || 'POINTS',
          label_ko: row.label_ko,
          label_en: row.label_en,
          label_th: row.label_th,
          sort_order: row.sort_order,
          is_active: row.is_active,
          created_at: getBangkokDateTimeString(),
          updated_at: row.updated_at,
        })
      }
    }
    return listMemberStampMilestones(true)
  } catch (e) {
    if (isMissingTableError(e)) {
      throw new Error('member_stamp_milestones 테이블이 없습니다. sql/member_stamp_card.sql 을 먼저 적용하세요.')
    }
    throw e
  }
}

function milestoneLabel(m: MemberStampMilestone, lang: 'ko' | 'en' | 'th'): string {
  if (lang === 'th') return toText(m.labelTh) || toText(m.labelEn) || toText(m.labelKo) || m.couponCode || `${m.rewardPoints}P`
  if (lang === 'en') return toText(m.labelEn) || toText(m.labelKo) || m.couponCode || `${m.rewardPoints}P`
  return toText(m.labelKo) || toText(m.labelEn) || m.couponCode || `${m.rewardPoints}P`
}

async function logStampIssueFailure(params: {
  memberId: number
  milestoneId?: number
  orderId?: number
  couponCode?: string
  errorMessage: string
  context?: unknown
}): Promise<void> {
  try {
    await supabaseInsert('member_stamp_issue_logs', {
      member_id: params.memberId,
      milestone_id: params.milestoneId || null,
      order_id: params.orderId || null,
      coupon_code: params.couponCode || null,
      error_message: toText(params.errorMessage).slice(0, 500) || 'unknown',
      context: params.context ?? null,
      created_at: getBangkokDateTimeString(),
    })
  } catch {
    /* optional table */
  }
}

async function countMemberStampEarned(memberId: number): Promise<number> {
  try {
    const rows = (await supabaseSelectFilter('member_stamp_ledger', `member_id=eq.${memberId}&kind=eq.earn`, {
      limit: 5000,
      select: 'id',
    })) as Array<{ id?: number }>
    return (rows || []).length
  } catch {
    return 0
  }
}

async function hasStampRewardIssued(params: {
  memberId: number
  milestoneId: number
  cardSequence: number
}): Promise<boolean> {
  const rows = (await supabaseSelectFilter(
    'member_stamp_reward_issues',
    `member_id=eq.${params.memberId}&milestone_id=eq.${params.milestoneId}&card_sequence=eq.${params.cardSequence}`,
    { limit: 1, select: 'id' }
  )) as Array<{ id?: number }>
  return Boolean(rows?.length)
}

async function issueCompleteBonus(params: {
  memberId: number
  policy: MemberStampPolicyBase
  orderId?: number
}): Promise<{ coupons: string[]; points: number }> {
  const coupons: string[] = []
  let points = 0
  if (params.policy.completeBonusCouponCode) {
    try {
      await issueMemberCoupon({ memberId: params.memberId, couponCode: params.policy.completeBonusCouponCode })
      coupons.push(params.policy.completeBonusCouponCode)
    } catch (e) {
      await logStampIssueFailure({
        memberId: params.memberId,
        orderId: params.orderId,
        couponCode: params.policy.completeBonusCouponCode,
        errorMessage: e instanceof Error ? e.message : String(e),
        context: { kind: 'complete_bonus' },
      })
    }
  }
  if (params.policy.completeBonusPoints > 0) {
    try {
      await adjustMemberPoints({
        memberId: params.memberId,
        points: params.policy.completeBonusPoints,
        note: 'stamp_card_complete_bonus',
      })
      points = params.policy.completeBonusPoints
    } catch (e) {
      await logStampIssueFailure({
        memberId: params.memberId,
        orderId: params.orderId,
        errorMessage: e instanceof Error ? e.message : String(e),
        context: { kind: 'complete_bonus_points' },
      })
    }
  }
  return { coupons, points }
}

async function issueStampMilestoneReward(params: {
  memberId: number
  milestone: MemberStampMilestone
  cardSequence: number
  orderId?: number
  lang?: 'ko' | 'en' | 'th'
}): Promise<{ couponCode: string | null; points: number; label: string } | null> {
  const { memberId, milestone, cardSequence } = params
  if (!milestone.id) return null
  if (await hasStampRewardIssued({ memberId, milestoneId: milestone.id, cardSequence })) return null
  const label = milestoneLabel(milestone, params.lang || 'ko')

  if (milestone.rewardType === 'points' && milestone.rewardPoints > 0) {
    try {
      await adjustMemberPoints({
        memberId,
        points: milestone.rewardPoints,
        note: `stamp_milestone_${milestone.stampCount}`,
      })
      await supabaseInsert('member_stamp_reward_issues', {
        member_id: memberId,
        milestone_id: milestone.id,
        card_sequence: cardSequence,
        coupon_code: `POINTS_${milestone.rewardPoints}`,
        coupon_issue_id: null,
        created_at: getBangkokDateTimeString(),
      })
      return { couponCode: null, points: milestone.rewardPoints, label }
    } catch (e) {
      await logStampIssueFailure({
        memberId,
        milestoneId: milestone.id,
        orderId: params.orderId,
        errorMessage: e instanceof Error ? e.message : String(e),
        context: { rewardType: 'points', stampCount: milestone.stampCount },
      })
      return null
    }
  }

  if (!milestone.couponCode) return null
  try {
    await issueMemberCoupon({ memberId, couponCode: milestone.couponCode })
    const issueRows = (await supabaseSelectFilter(
      'member_coupon_issues',
      `member_id=eq.${memberId}&coupon_code=eq.${encodeURIComponent(milestone.couponCode)}&status=eq.issued`,
      { order: 'id.desc', limit: 1, select: 'id' }
    )) as Array<{ id?: number }>
    await supabaseInsert('member_stamp_reward_issues', {
      member_id: memberId,
      milestone_id: milestone.id,
      card_sequence: cardSequence,
      coupon_code: milestone.couponCode,
      coupon_issue_id: issueRows?.[0]?.id || null,
      created_at: getBangkokDateTimeString(),
    })
    return { couponCode: milestone.couponCode, points: 0, label }
  } catch (e) {
    await logStampIssueFailure({
      memberId,
      milestoneId: milestone.id,
      orderId: params.orderId,
      couponCode: milestone.couponCode,
      errorMessage: e instanceof Error ? e.message : String(e),
      context: { rewardType: 'coupon', stampCount: milestone.stampCount },
    })
    return null
  }
}

async function loadMemberStampBalance(memberId: number): Promise<{
  balance: number
  cardSequence: number
  cardStartedAt: string | null
}> {
  const rows = (await supabaseSelectFilter('members', `id=eq.${memberId}`, {
    limit: 1,
    select: 'stamp_card_balance,stamp_card_sequence,stamp_card_started_at',
  })) as Array<{
    stamp_card_balance?: number
    stamp_card_sequence?: number
    stamp_card_started_at?: string | null
  }>
  const row = rows?.[0]
  return {
    balance: Math.max(0, Math.trunc(Number(row?.stamp_card_balance || 0))),
    cardSequence: Math.max(1, Math.trunc(Number(row?.stamp_card_sequence || 1))),
    cardStartedAt: toText(row?.stamp_card_started_at) || null,
  }
}

function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function computeCardExpiresAt(startedAt: string | null, expiryDays: number): string | null {
  if (!expiryDays || !startedAt) return null
  const ymd = startedAt.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  return addDaysToYmd(ymd, expiryDays)
}

async function expireMemberStampCardIfNeeded(params: {
  memberId: number
  policy: MemberStampPolicyBase
  tenantScope: MembersTenantScope
}): Promise<boolean> {
  const days = Math.trunc(Number(params.policy.cardExpiryDays || 0))
  if (days <= 0) return false
  const { balance, cardSequence, cardStartedAt } = await loadMemberStampBalance(params.memberId)
  if (balance <= 0 || !cardStartedAt) return false
  const expiresYmd = computeCardExpiresAt(cardStartedAt, days)
  if (!expiresYmd) return false
  if (getBangkokTodayDateString() <= expiresYmd) return false

  await supabaseInsert(
    'member_stamp_ledger',
    stampStampRow(
      {
        member_id: params.memberId,
        order_id: null,
        store_code: null,
        stamp_ymd: getBangkokTodayDateString(),
        card_sequence: cardSequence + 1,
        kind: 'reset',
        balance_after: 0,
        note: `card_expired_${days}d`,
        created_at: getBangkokDateTimeString(),
      },
      params.tenantScope
    )
  )
  await supabaseUpdateByFilter('members', `id=eq.${params.memberId}`, {
    stamp_card_balance: 0,
    stamp_card_sequence: cardSequence + 1,
    stamp_card_started_at: getBangkokDateTimeString(),
    updated_at: getBangkokDateTimeString(),
  })
  return true
}

async function sendStampEarnNotifications(params: {
  memberId: number
  policy: MemberStampPolicyBase
  result: MemberStampRecordResult
  storeCode: string
}): Promise<void> {
  if (!params.policy.lineNotifyEnabled || !params.result.stamped) return
  const lines: string[] = []
  if (params.result.cardCompleted) {
    lines.push('스탬프 카드를 완성했습니다!')
  } else {
    lines.push('스탬프 1개가 적립되었습니다.')
  }
  lines.push(`현재 ${displayMemberStampCount(params.result.newBalance, params.policy.cardSlots, params.policy.resetAfterComplete)}/${params.policy.cardSlots}`)
  if (params.storeCode) lines.push(`매장: ${params.storeCode}`)
  for (const m of params.result.milestonesReached) {
    lines.push(`🎁 ${m.stampCount}회 달성: ${m.label}`)
  }
  for (const code of params.result.rewardsIssued) {
    lines.push(`쿠폰 발급: ${code}`)
  }
  if (params.result.pointsAwarded > 0) {
    lines.push(`포인트 ${params.result.pointsAwarded}P 지급`)
  }
  await notifyMemberStampLineMessage({ memberId: params.memberId, lines })
}

export async function recordMemberStampOnVisit(params: {
  memberId: number
  orderId: number
  storeCode: string
  totalAmount: number
  orderAtYmd?: string
  createdBy?: string | null
  orderType?: string | null
}): Promise<MemberStampRecordResult> {
  const baseEmpty = (): MemberStampRecordResult => ({
    stamped: false,
    newBalance: 0,
    cardSequence: 1,
    displayStamps: 0,
    cardSlots: DEFAULT_MEMBER_STAMP_POLICY.cardSlots,
    rewardsIssued: [],
    pointsAwarded: 0,
    milestonesReached: [],
    cardCompleted: false,
    ledgerId: null,
  })
  const memberId = Number(params.memberId || 0)
  const orderId = Number(params.orderId || 0)
  if (!memberId || !orderId) return { ...baseEmpty(), skippedReason: 'no_member_or_order' }

  const tenantScope = await resolveStampTenantScope(memberId)
  if (tenantScope.enforce) {
    const owned = await getMemberSummaryById(memberId, tenantScope)
    if (!owned) return { ...baseEmpty(), skippedReason: 'tenant_mismatch' }
  }

  const globalPolicy = await loadMemberStampPolicy({ tenantScope })
  if (!globalPolicy.enabled) return { ...baseEmpty(), skippedReason: 'disabled' }
  const policy = resolveEffectiveStampPolicy(globalPolicy, params.storeCode)
  const empty = (): MemberStampRecordResult => ({ ...baseEmpty(), cardSlots: policy.cardSlots })
  if (!policy.enabled) return { ...empty(), skippedReason: 'store_disabled' }

  const channel = resolveOrderStampChannel(params)
  if (!isStampChannelAllowed(policy, channel)) return { ...empty(), skippedReason: 'channel_blocked' }

  const totalAmount = Number(params.totalAmount || 0)
  if (policy.excludeZeroAmount && totalAmount <= 0) return { ...empty(), skippedReason: 'zero_amount' }
  if (policy.minOrderAmt > 0 && totalAmount < policy.minOrderAmt) {
    return { ...empty(), skippedReason: 'min_order' }
  }

  const storeCode = toText(params.storeCode)
  const stampYmd = toText(params.orderAtYmd).slice(0, 10) || getBangkokTodayDateString()

  try {
    await expireMemberStampCardIfNeeded({ memberId, policy, tenantScope })

    const dupOrder = (await supabaseSelectFilter(
      'member_stamp_ledger',
      `member_id=eq.${memberId}&order_id=eq.${orderId}&kind=eq.earn`,
      { limit: 1, select: 'id,balance_after,card_sequence' }
    )) as Array<{ id?: number; balance_after?: number; card_sequence?: number }>
    if (dupOrder?.length) {
      return {
        ...empty(),
        stamped: false,
        newBalance: Math.max(0, Math.trunc(Number(dupOrder[0]?.balance_after || 0))),
        cardSequence: Math.max(1, Math.trunc(Number(dupOrder[0]?.card_sequence || 1))),
        displayStamps: displayMemberStampCount(
          Math.max(0, Math.trunc(Number(dupOrder[0]?.balance_after || 0))),
          policy.cardSlots,
          policy.resetAfterComplete
        ),
        ledgerId: Number(dupOrder[0]?.id || 0) || null,
        skippedReason: 'duplicate_order',
      }
    }

    if (policy.earnMode === 'day') {
      const dayFilter = storeCode
        ? `member_id=eq.${memberId}&store_code=eq.${encodeURIComponent(storeCode)}&stamp_ymd=eq.${encodeURIComponent(stampYmd)}&kind=eq.earn`
        : `member_id=eq.${memberId}&stamp_ymd=eq.${encodeURIComponent(stampYmd)}&kind=eq.earn`
      const dupDay = (await supabaseSelectFilter('member_stamp_ledger', dayFilter, {
        limit: 1,
        select: 'id,balance_after,card_sequence',
      })) as Array<{ id?: number; balance_after?: number; card_sequence?: number }>
      if (dupDay?.length) {
        return {
          ...empty(),
          stamped: false,
          newBalance: Math.max(0, Math.trunc(Number(dupDay[0]?.balance_after || 0))),
          cardSequence: Math.max(1, Math.trunc(Number(dupDay[0]?.card_sequence || 1))),
          displayStamps: displayMemberStampCount(
            Math.max(0, Math.trunc(Number(dupDay[0]?.balance_after || 0))),
            policy.cardSlots,
            policy.resetAfterComplete
          ),
          skippedReason: 'duplicate_day',
        }
      }
    }

    const { balance, cardSequence, cardStartedAt } = await loadMemberStampBalance(memberId)
    const newBalance = balance + 1
    const rewardsIssued: string[] = []
    const milestonesReached: MemberStampRecordResult['milestonesReached'] = []
    let pointsAwarded = 0

    const inserted = (await supabaseInsert(
      'member_stamp_ledger',
      stampStampRow(
        {
          member_id: memberId,
          order_id: orderId,
          store_code: storeCode || null,
          stamp_ymd: stampYmd,
          card_sequence: cardSequence,
          kind: 'earn',
          balance_after: newBalance,
          note: null,
          created_at: getBangkokDateTimeString(),
        },
        tenantScope
      )
    )) as Array<{ id?: number }> | { id?: number }
    const ledgerId = Array.isArray(inserted)
      ? Number(inserted?.[0]?.id || 0)
      : Number((inserted as { id?: number })?.id || 0)

    const memberPatch: Record<string, unknown> = {
      stamp_card_balance: newBalance,
      updated_at: getBangkokDateTimeString(),
    }
    if (!cardStartedAt || balance === 0) {
      memberPatch.stamp_card_started_at = getBangkokDateTimeString()
    }
    await supabaseUpdateByFilter('members', `id=eq.${memberId}`, memberPatch)

    const milestones = (await listMemberStampMilestones(false)).sort(
      (a, b) => a.stampCount - b.stampCount || a.sortOrder - b.sortOrder
    )
    const rewardSequence = policy.resetAfterComplete ? cardSequence : 1
    for (const milestone of milestones) {
      if (newBalance < milestone.stampCount) continue
      const reward = await issueStampMilestoneReward({
        memberId,
        milestone,
        cardSequence: rewardSequence,
        orderId,
      })
      if (!reward) continue
      milestonesReached.push({
        stampCount: milestone.stampCount,
        label: reward.label,
        rewardType: milestone.rewardType,
      })
      if (reward.couponCode) rewardsIssued.push(reward.couponCode)
      pointsAwarded += reward.points
    }

    let finalBalance = newBalance
    let finalSequence = cardSequence
    let cardCompleted = false
    if (policy.resetAfterComplete && newBalance >= policy.cardSlots) {
      cardCompleted = true
      const bonus = await issueCompleteBonus({ memberId, policy, orderId })
      rewardsIssued.push(...bonus.coupons)
      pointsAwarded += bonus.points

      finalBalance = 0
      finalSequence = cardSequence + 1
      await supabaseInsert(
        'member_stamp_ledger',
        stampStampRow(
          {
            member_id: memberId,
            order_id: orderId,
            store_code: storeCode || null,
            stamp_ymd: stampYmd,
            card_sequence: finalSequence,
            kind: 'reset',
            balance_after: 0,
            note: `card_complete_${policy.cardSlots}`,
            created_at: getBangkokDateTimeString(),
          },
          tenantScope
        )
      )
      await supabaseUpdateByFilter('members', `id=eq.${memberId}`, {
        stamp_card_balance: 0,
        stamp_card_sequence: finalSequence,
        stamp_card_started_at: getBangkokDateTimeString(),
        updated_at: getBangkokDateTimeString(),
      })
    }

    const result: MemberStampRecordResult = {
      stamped: true,
      newBalance: finalBalance,
      cardSequence: finalSequence,
      displayStamps: displayMemberStampCount(finalBalance, policy.cardSlots, policy.resetAfterComplete),
      cardSlots: policy.cardSlots,
      rewardsIssued,
      pointsAwarded,
      milestonesReached,
      cardCompleted,
      ledgerId: ledgerId || null,
    }
    void sendStampEarnNotifications({ memberId, policy, result, storeCode })
    return result
  } catch (e) {
    if (isMissingTableError(e)) return { ...baseEmpty(), skippedReason: 'missing_table' }
    throw e
  }
}

export async function revokeMemberStampForOrder(params: {
  memberId: number
  orderId: number
}): Promise<boolean> {
  const memberId = Number(params.memberId || 0)
  const orderId = Number(params.orderId || 0)
  if (!memberId || !orderId) return false
  const tenantScope = await resolveStampTenantScope(memberId)
  try {
    const rows = (await supabaseSelectFilter(
      'member_stamp_ledger',
      `member_id=eq.${memberId}&order_id=eq.${orderId}&kind=eq.earn`,
      { limit: 1, select: 'id,balance_after,card_sequence',
      }
    )) as Array<{ id?: number; balance_after?: number; card_sequence?: number }>
    const earn = rows?.[0]
    if (!earn?.id) return false

    const { balance, cardSequence } = await loadMemberStampBalance(memberId)
    const nextBalance = Math.max(0, balance - 1)
    await supabaseInsert(
      'member_stamp_ledger',
      stampStampRow(
        {
          member_id: memberId,
          order_id: orderId,
          store_code: null,
          stamp_ymd: getBangkokTodayDateString(),
          card_sequence: cardSequence,
          kind: 'revoke',
          balance_after: nextBalance,
          note: `order_revoke_${orderId}`,
          created_at: getBangkokDateTimeString(),
        },
        tenantScope
      )
    )
    await supabaseUpdateByFilter('members', `id=eq.${memberId}`, {
      stamp_card_balance: nextBalance,
      updated_at: getBangkokDateTimeString(),
    })
    return true
  } catch (e) {
    if (isMissingTableError(e)) return false
    throw e
  }
}

export async function adjustMemberStampBalance(params: {
  memberId: number
  delta: number
  note: string
  actor?: string
}): Promise<{ newBalance: number }> {
  const memberId = Number(params.memberId || 0)
  const delta = Math.trunc(Number(params.delta || 0))
  if (!memberId || !delta) throw new Error('memberId와 delta가 필요합니다.')
  const note = toText(params.note)
  if (!note) throw new Error('조정 사유가 필요합니다.')

  const { balance, cardSequence, cardStartedAt } = await loadMemberStampBalance(memberId)
  const tenantScope = await resolveStampTenantScope(memberId)
  const nextBalance = Math.max(0, balance + delta)
  await supabaseInsert(
    'member_stamp_ledger',
    stampStampRow(
      {
        member_id: memberId,
        order_id: null,
        store_code: null,
        stamp_ymd: getBangkokTodayDateString(),
        card_sequence: cardSequence,
        kind: 'adjust',
        balance_after: nextBalance,
        note: `[${toText(params.actor) || 'admin'}] ${note}`.slice(0, 240),
        created_at: getBangkokDateTimeString(),
      },
      tenantScope
    )
  )
  const patch: Record<string, unknown> = {
    stamp_card_balance: nextBalance,
    updated_at: getBangkokDateTimeString(),
  }
  if (!cardStartedAt && nextBalance > 0) patch.stamp_card_started_at = getBangkokDateTimeString()
  await supabaseUpdateByFilter('members', `id=eq.${memberId}`, patch)
  return { newBalance: nextBalance }
}

export async function listMemberStampHistory(memberId: number, limit = 20): Promise<MemberStampHistoryRow[]> {
  const id = Number(memberId || 0)
  if (!id) return []
  const tenantScope = await resolveMemberPortalTenantScope({ memberId: id })
  const owned = await getMemberSummaryById(id, tenantScope)
  if (!owned) return []
  try {
    const rows = (await supabaseSelectFilter('member_stamp_ledger', `member_id=eq.${id}`, {
      limit: Math.max(1, Math.min(limit, 50)),
      order: 'created_at.desc',
      select: 'id,kind,store_code,stamp_ymd,balance_after,note,created_at',
    })) as Array<Record<string, unknown>>
    return (rows || []).map((row) => ({
      id: Number(row.id || 0),
      kind: toText(row.kind) || 'earn',
      storeCode: toText(row.store_code),
      stampYmd: toText(row.stamp_ymd),
      balanceAfter: Math.max(0, Math.trunc(Number(row.balance_after || 0))),
      note: toText(row.note),
      createdAt: toText(row.created_at),
    }))
  } catch (e) {
    if (isMissingTableError(e)) return []
    throw e
  }
}

export function buildMemberStampPreparingStatus(): MemberStampCardStatus {
  return {
    enabled: false,
    preparing: true,
    cardSlots: DEFAULT_MEMBER_STAMP_POLICY.cardSlots,
    earnMode: DEFAULT_MEMBER_STAMP_POLICY.earnMode,
    resetAfterComplete: DEFAULT_MEMBER_STAMP_POLICY.resetAfterComplete,
    minOrderAmt: 0,
    cardExpiryDays: 0,
    cardExpiresAt: null,
    currentStamps: 0,
    cardSequence: 1,
    totalEarned: 0,
    progressPercent: 0,
    milestones: [],
    nextMilestone: null,
  }
}

export async function getMemberStampCardStatus(
  memberId: number,
  lang: 'ko' | 'en' | 'th' = 'ko'
): Promise<MemberStampCardStatus | null> {
  const id = Number(memberId || 0)
  if (!id) return null
  const tenantScope = await resolveMemberPortalTenantScope({ memberId: id })
  const owned = await getMemberSummaryById(id, tenantScope)
  if (!owned) return tenantScope.enforce ? buildMemberStampPreparingStatus() : null

  const globalPolicy = await loadMemberStampPolicy({ tenantScope })
  if (!globalPolicy.enabled) return buildMemberStampPreparingStatus()

  try {
    const policy = globalPolicy
    await expireMemberStampCardIfNeeded({ memberId: id, policy, tenantScope })
    const [{ balance, cardSequence, cardStartedAt }, milestones, totalEarned] = await Promise.all([
      loadMemberStampBalance(memberId),
      listMemberStampMilestones(false),
      countMemberStampEarned(memberId),
    ])

    const rewardSequence = policy.resetAfterComplete ? cardSequence : 1
    const milestoneCounts = new Set(milestones.map((m) => m.stampCount))
    const enriched = await Promise.all(
      milestones.map(async (m) => {
        const issued = await hasStampRewardIssued({
          memberId,
          milestoneId: m.id,
          cardSequence: rewardSequence,
        })
        const achieved = issued || (policy.resetAfterComplete ? balance >= m.stampCount : issued)
        return {
          ...m,
          achieved,
          label: milestoneLabel(m, lang),
          isMilestoneSlot: true,
        }
      })
    )

    const currentStamps = displayMemberStampCount(balance, policy.cardSlots, policy.resetAfterComplete)
    const pending = enriched.filter((m) => !m.achieved).sort((a, b) => a.stampCount - b.stampCount)
    const next = pending[0]
      ? { ...pending[0], label: pending[0].label, stampsRemaining: Math.max(0, pending[0].stampCount - balance) }
      : null
    const cardExpiresAt = computeCardExpiresAt(cardStartedAt, policy.cardExpiryDays)

    return {
      enabled: true,
      cardSlots: policy.cardSlots,
      earnMode: policy.earnMode,
      resetAfterComplete: policy.resetAfterComplete,
      minOrderAmt: policy.minOrderAmt,
      cardExpiryDays: policy.cardExpiryDays,
      cardExpiresAt,
      currentStamps,
      cardSequence,
      totalEarned,
      progressPercent: Math.min(100, Math.round((currentStamps / Math.max(1, policy.cardSlots)) * 100)),
      milestones: enriched,
      nextMilestone: next,
    }
  } catch (e) {
    if (isMissingTableError(e)) return buildMemberStampPreparingStatus()
    throw e
  }
}

export async function validateStampMilestoneCoupons(
  milestones: MemberStampMilestoneInput[]
): Promise<StampCouponValidationRow[]> {
  const rows: StampCouponValidationRow[] = []
  for (const m of milestones) {
    const stampCount = Math.trunc(Number(m.stampCount || 0))
    const rewardType = m.rewardType === 'points' ? 'points' : 'coupon'
    if (rewardType === 'points') {
      rows.push({
        stampCount,
        couponCode: '',
        rewardType,
        ok: Math.trunc(Number(m.rewardPoints || 0)) > 0,
        message: Math.trunc(Number(m.rewardPoints || 0)) > 0 ? 'ok' : 'points_required',
      })
      continue
    }
    const couponCode = normalizeCouponCode(m.couponCode)
    if (!couponCode) {
      rows.push({ stampCount, couponCode: '', rewardType, ok: false, message: 'coupon_required' })
      continue
    }
    try {
      const couponRows = (await supabaseSelectFilter(
        'pos_coupons',
        `code=eq.${encodeURIComponent(couponCode)}`,
        { limit: 1, select: 'id,is_active,redemption_mode' }
      )) as Array<{ id?: number; is_active?: boolean; redemption_mode?: string | null }>
      const coupon = couponRows?.[0]
      if (!coupon?.id) {
        rows.push({ stampCount, couponCode, rewardType, ok: false, message: 'coupon_not_found' })
        continue
      }
      if (coupon.is_active === false) {
        rows.push({ stampCount, couponCode, rewardType, ok: false, message: 'coupon_inactive' })
        continue
      }
      const mode = toText(coupon.redemption_mode) || 'reusable_code'
      if (mode !== 'member_issue') {
        rows.push({ stampCount, couponCode, rewardType, ok: false, message: 'coupon_not_member_issue' })
        continue
      }
      rows.push({ stampCount, couponCode, rewardType, ok: true, message: 'ok' })
    } catch {
      rows.push({ stampCount, couponCode, rewardType, ok: false, message: 'lookup_failed' })
    }
  }
  return rows
}

export async function getMemberStampAdminStats(params?: {
  days?: number
  startYmd?: string
  endYmd?: string
}): Promise<MemberStampAdminStats> {
  const days = params?.days != null ? Math.max(1, Math.min(365, Math.trunc(params.days))) : null
  let startYmd = toText(params?.startYmd).slice(0, 10)
  let endYmd = toText(params?.endYmd).slice(0, 10)
  if (!startYmd || !endYmd) {
    endYmd = getBangkokTodayDateString()
    const d = days ?? 30
    const endParts = endYmd.split('-').map(Number)
    const dt = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2] - (d - 1)))
    startYmd = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
  }
  const { gteIso, lteIso } = bangkokYmdRangeToIsoBounds(startYmd, endYmd)

  try {
    const [ledgerRows, failureRows, rewardRows] = await Promise.all([
      supabaseSelectFilter('member_stamp_ledger', `created_at=gte.${encodeURIComponent(gteIso)}&created_at=lte.${encodeURIComponent(lteIso)}`, {
        limit: 10000,
        select: 'id,member_id,store_code,kind,created_at',
      }) as Promise<Array<{ member_id?: number; store_code?: string; kind?: string }>>,
      supabaseSelectFilter('member_stamp_issue_logs', `created_at=gte.${encodeURIComponent(gteIso)}&created_at=lte.${encodeURIComponent(lteIso)}`, {
        limit: 5000,
        select: 'id',
      }) as Promise<Array<{ id?: number }>>,
      supabaseSelectFilter('member_stamp_reward_issues', `created_at=gte.${encodeURIComponent(gteIso)}&created_at=lte.${encodeURIComponent(lteIso)}`, {
        limit: 5000,
        select: 'id',
      }) as Promise<Array<{ id?: number }>>,
    ])

    const earns = (ledgerRows || []).filter((r) => toText(r.kind) === 'earn')
    const uniqueMembers = new Set(earns.map((r) => Number(r.member_id || 0)).filter(Boolean)).size
    const storeMap = new Map<string, number>()
    for (const row of earns) {
      const code = toText(row.store_code) || '(unknown)'
      storeMap.set(code, (storeMap.get(code) || 0) + 1)
    }
    return {
      days,
      startYmd,
      endYmd,
      totalEarns: earns.length,
      uniqueMembers,
      milestoneRewards: (rewardRows || []).length,
      couponFailures: (failureRows || []).length,
      cardCompletions: (ledgerRows || []).filter((r) => toText(r.kind) === 'reset').length,
      storeRows: [...storeMap.entries()]
        .map(([storeCode, earnCount]) => ({ storeCode, earnCount }))
        .sort((a, b) => b.earnCount - a.earnCount),
    }
  } catch (e) {
    if (isMissingTableError(e)) {
      return {
        days,
        startYmd,
        endYmd,
        totalEarns: 0,
        uniqueMembers: 0,
        milestoneRewards: 0,
        couponFailures: 0,
        cardCompletions: 0,
        storeRows: [],
      }
    }
    throw e
  }
}

export async function listRecentStampIssueFailures(limit = 20): Promise<
  Array<{
    id: number
    memberId: number
    couponCode: string
    errorMessage: string
    createdAt: string
  }>
> {
  try {
    const rows = (await supabaseSelect('member_stamp_issue_logs', {
      order: 'created_at.desc',
      limit: Math.max(1, Math.min(limit, 100)),
      select: 'id,member_id,coupon_code,error_message,created_at',
    })) as Array<Record<string, unknown>>
    return (rows || []).map((row) => ({
      id: Number(row.id || 0),
      memberId: Number(row.member_id || 0),
      couponCode: toText(row.coupon_code),
      errorMessage: toText(row.error_message),
      createdAt: toText(row.created_at),
    }))
  } catch {
    return []
  }
}

export async function getMemberStampSummaryForPos(memberId: number): Promise<{
  enabled: boolean
  currentStamps: number
  cardSlots: number
  nextRewardLabel: string | null
} | null> {
  const status = await getMemberStampCardStatus(memberId, 'ko')
  if (!status?.enabled) return { enabled: false, currentStamps: 0, cardSlots: 0, nextRewardLabel: null }
  return {
    enabled: true,
    currentStamps: status.currentStamps,
    cardSlots: status.cardSlots,
    nextRewardLabel: status.nextMilestone?.label || null,
  }
}
