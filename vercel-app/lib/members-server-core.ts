import crypto from 'crypto'
import {
  supabaseCountFilter,
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseRpc,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import { bangkokYmdRangeToIsoBounds } from '@/lib/bangkok-date'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { normalizeMemberPoints } from '@/lib/member-points-math'
import { type MemberTierUpgradeBasis } from '@/lib/member-tier-policy'
import {
  buildMemberSearchPostgrestAndFilter,
  buildMemberSearchPostgrestOrFilter,
  emptyMemberSearchFieldDraft,
  hasMemberSearchFields,
  type MemberSearchFieldDraft,
} from '@/lib/member-search-filter'
import {
  canonicalMemberPhoneForStorage,
  memberPhoneLookupVariants,
} from '@/lib/member-phone-lookup'

export type MemberSummary = {
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
  /** 등급 승급용 누적 포인트 (결제 사용 시 감소하지 않음) */
  tierPoints?: number
  lifetimeAmount?: number
  lastLineEventType?: string
  lastLineEventAt?: string
  lastUpdateReason?: string
  lastVisitedAt?: string
  lineOaFriend?: boolean
  lineOaFriendAt?: string
  createdAt?: string
  updatedAt?: string
}

export type MemberRow = {
  id?: number
  member_no?: string | null
  name?: string | null
  full_name?: string | null
  birth_date?: string | null
  gender?: string | null
  nationality?: string | null
  join_channel?: string | null
  join_store_code?: string | null
  referred_by_member_id?: number | null
  referral_code?: string | null
  last_visited_at?: string | null
  line_display_name?: string | null
  consent_marketing?: boolean | null
  consent_privacy?: boolean | null
  consent_at?: string | null
  line_oa_friend?: boolean | null
  line_oa_friend_at?: string | null
  phone?: string | null
  email?: string | null
  source?: string | null
  status?: string | null
  tier_code?: string | null
  point_balance?: number | null
  tier_points?: number | null
  line_tier_points?: number | null
  lifetime_amount?: number | null
  created_at?: string | null
  updated_at?: string | null
}

type MemberIdentityRow = {
  id?: number
  member_id?: number
  provider?: string
  provider_user_id?: string
  display_name?: string | null
  picture_url?: string | null
  status?: string | null
  linked_at?: string | null
  last_seen_at?: string | null
}

export type MemberTierRow = {
  id?: number
  code?: string
  name?: string
  min_amount?: number
  min_points?: number
  point_rate?: number
  discount_rate?: number | null
  sort_order?: number
  benefits_ko?: string | null
  benefits_en?: string | null
  benefits_th?: string | null
  created_at?: string
  updated_at?: string
}

export type MemberPointLedgerRow = {
  id?: number
  member_id?: number
  order_id?: number
  kind?: string
  points?: number
  amount?: number
  note?: string | null
  created_at?: string
}

type MemberEventRow = {
  member_id?: number
  event_type?: string | null
  processed_at?: string | null
  status?: string | null
}

export type CreateMemberInput = {
  name: string
  phone?: string
  email?: string
  birthDate?: string
  gender?: string
  nationality?: string
  joinChannel?: string
  joinStoreCode?: string
  referralCode?: string
  referredByMemberId?: number
  source?: string
  lineUserId?: string
  lineDisplayName?: string
  linePictureUrl?: string
  consentMarketing?: boolean
}

export type UpdateMemberInput = {
  id: number
  name?: string
  fullName?: string
  lineDisplayName?: string
  birthDate?: string
  gender?: string
  nationality?: string
  joinChannel?: string
  joinStoreCode?: string
  referralCode?: string
  referredByMemberId?: number
  phone?: string
  email?: string
  consentMarketing?: boolean
  consentPrivacy?: boolean
  consentAt?: string
  status?: string
}

export function toText(v: unknown): string {
  return String(v || '').trim()
}

function normalizePhone(v: string): string {
  return canonicalMemberPhoneForStorage(v)
}

async function findActiveMemberIdByPhoneLookup(phone: string): Promise<number | null> {
  const canonical = canonicalMemberPhoneForStorage(phone)
  if (!canonical) return null
  const seen = new Set<number>()
  for (const candidate of memberPhoneLookupVariants(canonical)) {
    const rows = (await supabaseSelectFilter('members', `phone=eq.${encodeURIComponent(candidate)}&status=eq.active`, {
      limit: 5,
      select: 'id',
    })) as Array<{ id?: number }>
    for (const row of rows || []) {
      const id = Number(row.id || 0)
      if (id > 0 && !seen.has(id)) seen.add(id)
    }
  }
  if (seen.size === 0) return null
  return Math.max(...seen)
}

export type MemberSaveErrorCode = 'DUPLICATE_PHONE'

export class MemberSaveError extends Error {
  readonly code: MemberSaveErrorCode

  constructor(code: MemberSaveErrorCode, message: string) {
    super(message)
    this.name = 'MemberSaveError'
    this.code = code
  }
}

function isDuplicatePhoneDbError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e || '')
  return /23505/.test(msg) && /uq_members_phone_digits|phone_digits/i.test(msg)
}

function rethrowMemberSaveError(e: unknown): never {
  if (e instanceof MemberSaveError) throw e
  if (isDuplicatePhoneDbError(e)) {
    throw new MemberSaveError(
      'DUPLICATE_PHONE',
      '이 전화번호는 이미 다른 회원에게 등록되어 있습니다.'
    )
  }
  throw e instanceof Error ? e : new Error(String(e || '회원 저장에 실패했습니다.'))
}

function normalizeEmail(v: string): string {
  return toText(v).toLowerCase()
}

function deriveLastUpdateReason(params: { source: string; lastLineEventType: string }): string {
  if (params.lastLineEventType) return `line_webhook:${params.lastLineEventType}`
  if (params.source === 'line_import') return 'crm_import'
  if (params.source === 'line') return 'line_sync_or_register'
  if (params.source === 'app') return 'app_master'
  return 'erp_manual'
}

function toMemberSummary(
  member: MemberRow,
  lineIdentity?: MemberIdentityRow,
  meta?: { lastLineEventType?: string; lastLineEventAt?: string }
): MemberSummary {
  const lineDisplayName = toText(member.line_display_name) || toText(lineIdentity?.display_name)
  const fullName = toText(member.full_name) || toText(member.name)
  const source = toText(member.source) || 'manual'
  const lastLineEventType = toText(meta?.lastLineEventType)
  const lastLineEventAt = toText(meta?.lastLineEventAt)
  return {
    id: Number(member.id || 0),
    memberNo: toText(member.member_no),
    name: toText(member.name),
    fullName,
    birthDate: toText(member.birth_date),
    gender: toText(member.gender),
    nationality: toText(member.nationality),
    phone: toText(member.phone),
    email: toText(member.email),
    joinChannel: toText(member.join_channel) || 'store',
    joinStoreCode: toText(member.join_store_code) || undefined,
    referredByMemberId: Number(member.referred_by_member_id || 0) || undefined,
    referralCode: toText(member.referral_code),
    consentMarketing: Boolean(member.consent_marketing),
    consentPrivacy: Boolean(member.consent_privacy),
    consentAt: toText(member.consent_at),
    source,
    status: toText(member.status) || 'active',
    lineLinked: Boolean(lineIdentity?.provider_user_id),
    lineUserId: toText(lineIdentity?.provider_user_id),
    lineDisplayName,
    tierCode: toText(member.tier_code) || 'BRONZE',
    pointBalance: Number(member.point_balance || 0),
    tierPoints: resolveMemberTierQualificationValue(member, 'points'),
    lifetimeAmount: Number(member.lifetime_amount || 0),
    lastLineEventType,
    lastLineEventAt,
    lastUpdateReason: deriveLastUpdateReason({ source, lastLineEventType }),
    lastVisitedAt: toText(member.last_visited_at),
    lineOaFriend: Boolean(member.line_oa_friend),
    lineOaFriendAt: toText(member.line_oa_friend_at),
    createdAt: toText(member.created_at),
    updatedAt: toText(member.updated_at),
  }
}

function buildMemberNo(id: number): string {
  return `M${String(id).padStart(6, '0')}`
}

async function getLineIdentities(memberIds: number[]): Promise<Map<number, MemberIdentityRow>> {
  if (!memberIds.length) return new Map()
  const inValues = memberIds.join(',')
  const rows = (await supabaseSelectFilter(
    'member_identities',
    `provider=eq.line&member_id=in.(${inValues})`,
    { limit: 5000 }
  )) as MemberIdentityRow[]
  const map = new Map<number, MemberIdentityRow>()
  for (const row of rows || []) {
    const memberId = Number(row.member_id || 0)
    if (!memberId) continue
    if (!map.has(memberId)) map.set(memberId, row)
  }
  return map
}

async function getLatestMemberEvents(memberIds: number[]): Promise<Map<number, { eventType: string; processedAt: string }>> {
  if (!memberIds.length) return new Map()
  const rows = (await supabaseSelectFilter(
    'member_events',
    `member_id=in.(${memberIds.join(',')})&provider=eq.line&status=eq.processed`,
    {
      order: 'processed_at.desc',
      limit: 10000,
      select: 'member_id,event_type,processed_at,status',
    }
  )) as MemberEventRow[]
  const map = new Map<number, { eventType: string; processedAt: string }>()
  for (const row of rows || []) {
    const memberId = Number(row.member_id || 0)
    if (!memberId || map.has(memberId)) continue
    map.set(memberId, {
      eventType: toText(row.event_type),
      processedAt: toText(row.processed_at),
    })
  }
  return map
}

function normalizeMemberSearchFields(fields?: MemberSearchFieldDraft | null): MemberSearchFieldDraft {
  if (!fields) return { ...emptyMemberSearchFieldDraft }
  return {
    name: toText(fields.name),
    phone: toText(fields.phone),
    memberNo: toText(fields.memberNo),
    email: toText(fields.email),
    birthDate: toText(fields.birthDate),
  }
}

export async function listMembers(params?: {
  q?: string
  fields?: MemberSearchFieldDraft
  limit?: number
}): Promise<MemberSummary[]> {
  const q = toText(params?.q)
  const fields = normalizeMemberSearchFields(params?.fields)
  const limit = Math.max(1, Math.min(Number(params?.limit || 100), 5000))

  let rows: MemberRow[] = []
  if (hasMemberSearchFields(fields)) {
    const andFilter = buildMemberSearchPostgrestAndFilter(fields)
    rows = andFilter
      ? ((await supabaseSelectFilter('members', andFilter, {
          order: 'id.desc',
          limit,
        })) as MemberRow[])
      : []
  } else if (!q) {
    rows = (await supabaseSelect('members', { order: 'id.desc', limit })) as MemberRow[]
  } else {
    const memberFilter = buildMemberSearchPostgrestOrFilter(q)
    const escaped = encodeURIComponent(`*${q}*`)
    const membersByMemberFields = (await supabaseSelectFilter('members', memberFilter, {
      order: 'id.desc',
      limit,
    })) as MemberRow[]

    const identityFilter = `provider=eq.line&or=(provider_user_id.ilike.${escaped},display_name.ilike.${escaped})`
    const identityMatches = (await supabaseSelectFilter('member_identities', identityFilter, {
      limit: 5000,
      select: 'member_id',
    })) as MemberIdentityRow[]
    const identityMemberIds = Array.from(
      new Set(
        (identityMatches || [])
          .map((x) => Number(x.member_id || 0))
          .filter((id) => id > 0)
      )
    )

    const membersByIdentity =
      identityMemberIds.length > 0
        ? ((await supabaseSelectFilter('members', `id=in.(${identityMemberIds.join(',')})`, {
            order: 'id.desc',
            limit: 5000,
          })) as MemberRow[])
        : []

    const memberMap = new Map<number, MemberRow>()
    for (const row of membersByMemberFields || []) {
      const id = Number(row.id || 0)
      if (!id) continue
      memberMap.set(id, row)
    }
    for (const row of membersByIdentity || []) {
      const id = Number(row.id || 0)
      if (!id) continue
      if (!memberMap.has(id)) memberMap.set(id, row)
    }
    rows = Array.from(memberMap.values())
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
      .slice(0, limit)
  }

  const memberIds = (rows || []).map((r) => Number(r.id || 0)).filter((id) => id > 0)
  const lineIdentityMap = await getLineIdentities(memberIds)
  const lineEventMap = await getLatestMemberEvents(memberIds)
  return (rows || []).map((row) => {
    const id = Number(row.id || 0)
    const evt = lineEventMap.get(id)
    return toMemberSummary(row, lineIdentityMap.get(id), {
      lastLineEventType: evt?.eventType,
      lastLineEventAt: evt?.processedAt,
    })
  })
}

async function mapMemberRowsToSummaries(rows: MemberRow[]): Promise<MemberSummary[]> {
  const memberIds = (rows || []).map((r) => Number(r.id || 0)).filter((id) => id > 0)
  const lineIdentityMap = await getLineIdentities(memberIds)
  const lineEventMap = await getLatestMemberEvents(memberIds)
  return (rows || []).map((row) => {
    const id = Number(row.id || 0)
    const evt = lineEventMap.get(id)
    return toMemberSummary(row, lineIdentityMap.get(id), {
      lastLineEventType: evt?.eventType,
      lastLineEventAt: evt?.processedAt,
    })
  })
}

export async function listMembersCursor(params?: {
  q?: string
  fields?: MemberSearchFieldDraft
  afterId?: number
  limit?: number
}): Promise<MemberSummary[]> {
  const q = toText(params?.q)
  const fields = normalizeMemberSearchFields(params?.fields)
  const afterId = Number(params?.afterId || 0) || null
  const limit = Math.max(1, Math.min(Number(params?.limit || 100), 500))

  // 필드 AND 검색은 RPC(p_q 단일)과 맞지 않아 PostgREST AND 경로 사용
  if (hasMemberSearchFields(fields)) {
    const filterParts: string[] = []
    if (afterId) filterParts.push(`id.lt.${afterId}`)
    const andFilter = buildMemberSearchPostgrestAndFilter(fields)
    if (andFilter) filterParts.push(andFilter)
    if (!filterParts.length) return []
    const rows = (await supabaseSelectFilter('members', filterParts.join('&'), {
      order: 'id.desc',
      limit,
    })) as MemberRow[]
    return mapMemberRowsToSummaries(rows)
  }

  try {
    const rows = (await supabaseRpc<MemberRow[]>('get_member_list_cursor', {
      p_after_id: afterId,
      p_limit: limit,
      p_q: q || null,
    })) as MemberRow[]
    return mapMemberRowsToSummaries(rows)
  } catch {
    const batchLimit = Math.max(limit, afterId ? limit + 500 : limit)
    const rows = await listMembers({ q, limit: batchLimit })
    // cursor는 id 내림차순이므로 afterId보다 작은 id만
    const filtered = afterId ? rows.filter((m) => m.id < afterId) : rows
    return filtered.slice(0, limit)
  }
}

export type MemberPointsSearchParams = {
  q?: string
  afterId?: number
  limit?: number
  tierCode?: string
  status?: string
  pointBalanceMin?: number | string
  pointBalanceMax?: number | string
  tierPointsMin?: number | string
  tierPointsMax?: number | string
}

function parseOptionalIntInput(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) ? n : null
}

export function memberPointsSearchHasCriteria(params: MemberPointsSearchParams): boolean {
  return Boolean(
    toText(params.q) ||
      toText(params.tierCode) ||
      toText(params.status) ||
      parseOptionalIntInput(params.pointBalanceMin) != null ||
      parseOptionalIntInput(params.pointBalanceMax) != null ||
      parseOptionalIntInput(params.tierPointsMin) != null ||
      parseOptionalIntInput(params.tierPointsMax) != null
  )
}

export async function listMembersPointsSearch(params: MemberPointsSearchParams): Promise<MemberSummary[]> {
  if (!memberPointsSearchHasCriteria(params)) return []

  const q = toText(params.q)
  const afterId = Number(params.afterId || 0) || null
  const limit = Math.max(1, Math.min(Number(params.limit || 100), 500))
  const tierCode = toText(params.tierCode).toUpperCase()
  const status = toText(params.status)
  const pointBalanceMin = parseOptionalIntInput(params.pointBalanceMin)
  const pointBalanceMax = parseOptionalIntInput(params.pointBalanceMax)
  const tierPointsMin = parseOptionalIntInput(params.tierPointsMin)
  const tierPointsMax = parseOptionalIntInput(params.tierPointsMax)

  try {
    const rows = (await supabaseRpc<MemberRow[]>('search_members_points_cursor', {
      p_after_id: afterId,
      p_limit: limit,
      p_q: q || null,
      p_tier_code: tierCode || null,
      p_status: status || null,
      p_point_balance_min: pointBalanceMin,
      p_point_balance_max: pointBalanceMax,
      p_tier_points_min: tierPointsMin,
      p_tier_points_max: tierPointsMax,
    })) as MemberRow[]
    const memberIds = (rows || []).map((r) => Number(r.id || 0)).filter((id) => id > 0)
    const lineIdentityMap = await getLineIdentities(memberIds)
    const lineEventMap = await getLatestMemberEvents(memberIds)
    return (rows || []).map((row) => {
      const id = Number(row.id || 0)
      const evt = lineEventMap.get(id)
      return toMemberSummary(row, lineIdentityMap.get(id), {
        lastLineEventType: evt?.eventType,
        lastLineEventAt: evt?.processedAt,
      })
    })
  } catch {
    const filters: string[] = []
    if (afterId) filters.push(`id.lt.${afterId}`)
    if (tierCode) filters.push(`tier_code=eq.${tierCode}`)
    if (status) filters.push(`status=eq.${status}`)
    if (pointBalanceMin != null) filters.push(`point_balance.gte.${pointBalanceMin}`)
    if (pointBalanceMax != null) filters.push(`point_balance.lte.${pointBalanceMax}`)
    if (q) filters.push(buildMemberSearchPostgrestOrFilter(q))

    let rows: MemberRow[] = []
    if (filters.length) {
      rows = (await supabaseSelectFilter('members', filters.join('&'), {
        order: 'id.desc',
        limit,
        select:
          'id,member_no,name,full_name,phone,email,birth_date,gender,nationality,tier_code,status,point_balance,tier_points,line_tier_points,lifetime_amount,join_channel,join_store_code,created_at',
      })) as MemberRow[]
    } else if (tierPointsMin != null || tierPointsMax != null) {
      throw new Error('누적 포인트 범위 검색은 SQL(search_members_points_cursor) 배포 후 사용할 수 있습니다.')
    }

    if (tierPointsMin != null || tierPointsMax != null) {
      rows = rows.filter((row) => {
        const tp = resolveMemberTierQualificationValue(row, 'points')
        if (tierPointsMin != null && tp < tierPointsMin) return false
        if (tierPointsMax != null && tp > tierPointsMax) return false
        return true
      })
    }

    const memberIds = (rows || []).map((r) => Number(r.id || 0)).filter((id) => id > 0)
    const lineIdentityMap = await getLineIdentities(memberIds)
    const lineEventMap = await getLatestMemberEvents(memberIds)
    return (rows || []).map((row) => {
      const id = Number(row.id || 0)
      const evt = lineEventMap.get(id)
      return toMemberSummary(row, lineIdentityMap.get(id), {
        lastLineEventType: evt?.eventType,
        lastLineEventAt: evt?.processedAt,
      })
    })
  }
}

async function insertMemberBase(input: CreateMemberInput): Promise<MemberRow> {
  const now = getBangkokDateTimeString()
  const referralCode = toText(input.referralCode).toUpperCase() || null
  const referredByMemberId = Number(input.referredByMemberId || 0) || null
  const phone = normalizePhone(input.phone || '') || null
  if (phone) {
    const existingId = await findActiveMemberIdByPhoneLookup(phone)
    if (existingId) {
      throw new MemberSaveError(
        'DUPLICATE_PHONE',
        '이 전화번호는 이미 다른 회원에게 등록되어 있습니다.'
      )
    }
  }
  let inserted: MemberRow[]
  try {
    inserted = (await supabaseInsert('members', {
      name: toText(input.name),
      phone,
      email: normalizeEmail(input.email || '') || null,
      birth_date: toText(input.birthDate) || null,
      gender: toText(input.gender) || null,
      nationality: toText(input.nationality) || null,
      join_channel: toText(input.joinChannel) || 'store',
      join_store_code: toText(input.joinStoreCode) || null,
      referral_code: referralCode,
      referred_by_member_id: referredByMemberId,
      source: toText(input.source) || 'manual',
      status: 'active',
      consent_marketing: input.consentMarketing != null ? Boolean(input.consentMarketing) : null,
      consent_at: input.consentMarketing ? now : null,
      created_at: now,
      updated_at: now,
    })) as MemberRow[]
  } catch (e) {
    rethrowMemberSaveError(e)
  }
  const created = inserted?.[0]
  if (!created?.id) throw new Error('회원 생성에 실패했습니다.')
  const memberNo = buildMemberNo(Number(created.id))
  await supabaseUpdateByFilter('members', `id=eq.${created.id}`, {
    member_no: memberNo,
    updated_at: now,
  })
  return { ...created, member_no: memberNo, updated_at: now, created_at: now }
}

async function ensureLineIdentity(params: {
  memberId: number
  lineUserId: string
  lineDisplayName?: string
  linePictureUrl?: string
}): Promise<void> {
  const lineUserId = toText(params.lineUserId)
  if (!lineUserId) return
  const now = getBangkokDateTimeString()
  const existing = (await supabaseSelectFilter(
    'member_identities',
    `provider=eq.line&provider_user_id=eq.${encodeURIComponent(lineUserId)}`,
    { limit: 1 }
  )) as MemberIdentityRow[]
  if (existing && existing.length > 0) {
    const identityId = Number(existing[0].id || 0)
    if (!identityId) return
    const patch: Record<string, unknown> = {
      member_id: params.memberId,
      status: 'active',
      last_seen_at: now,
    }
    if (toText(params.lineDisplayName)) patch.display_name = toText(params.lineDisplayName)
    if (toText(params.linePictureUrl)) patch.picture_url = toText(params.linePictureUrl)
    await supabaseUpdateByFilter('member_identities', `id=eq.${identityId}`, patch)
    return
  }

  await supabaseInsert('member_identities', {
    member_id: params.memberId,
    provider: 'line',
    provider_user_id: lineUserId,
    display_name: toText(params.lineDisplayName) || null,
    picture_url: toText(params.linePictureUrl) || null,
    status: 'active',
    linked_at: now,
    last_seen_at: now,
  })
}

export async function findMemberByReferralCode(codeRaw: string): Promise<MemberSummary | null> {
  const code = toText(codeRaw).toUpperCase()
  if (!code) return null
  const rows = (await supabaseSelectFilter(
    'members',
    `referral_code=eq.${encodeURIComponent(code)}`,
    { limit: 1 }
  )) as MemberRow[]
  const row = rows?.[0]
  if (!row?.id) return null
  const id = Number(row.id)
  const lineMap = await getLineIdentities([id])
  return toMemberSummary(row, lineMap.get(id))
}

export async function getMemberSummaryById(memberId: number): Promise<MemberSummary | null> {
  const id = Number(memberId || 0)
  if (!id) return null
  const rows = (await supabaseSelectFilter('members', `id=eq.${id}`, { limit: 1 })) as MemberRow[]
  const row = rows?.[0]
  if (!row?.id) return null
  const lineMap = await getLineIdentities([id])
  return toMemberSummary(row, lineMap.get(id))
}

function buildReferralCode(memberNo: string, memberId: number): string {
  const digits = toText(memberNo).replace(/[^\d]/g, '')
  const suffix = digits.slice(-6) || String(memberId).padStart(6, '0')
  return `CM${suffix}`
}

export async function ensureMemberReferralCode(memberId: number): Promise<string> {
  const member = await getMemberSummaryById(memberId)
  if (!member) throw new Error('회원을 찾을 수 없습니다.')
  if (toText(member.referralCode)) return toText(member.referralCode)
  const code = buildReferralCode(member.memberNo, member.id)
  await supabaseUpdateByFilter('members', `id=eq.${memberId}`, {
    referral_code: code,
    updated_at: getBangkokDateTimeString(),
  })
  return code
}

export async function updateMemberLineOaFriend(params: {
  memberId: number
  friendFlag: boolean
  friendshipStatusChanged?: boolean
}): Promise<void> {
  const memberId = Number(params.memberId || 0)
  if (!memberId) return
  const now = getBangkokDateTimeString()
  const patch: Record<string, unknown> = {
    line_oa_friend: Boolean(params.friendFlag),
    updated_at: now,
  }
  if (params.friendFlag) patch.line_oa_friend_at = now
  try {
    await supabaseUpdateByFilter('members', `id=eq.${memberId}`, patch)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || '')
    if (!/column/i.test(msg)) throw e
  }
  await createMemberEvent({
    memberId,
    eventId: `line_oa_friend:${memberId}:${crypto.randomUUID()}`,
    eventType: params.friendshipStatusChanged ? 'line_oa_friend_changed' : 'line_oa_friend_sync',
    payload: {
      friendFlag: Boolean(params.friendFlag),
      friendshipStatusChanged: Boolean(params.friendshipStatusChanged),
    },
  }).catch(() => {})
}

export async function createMember(input: CreateMemberInput): Promise<MemberSummary> {
  const name = toText(input.name)
  if (!name) throw new Error('회원 이름이 필요합니다.')

  const member = await insertMemberBase(input)
  if (toText(input.lineUserId)) {
    await ensureLineIdentity({
      memberId: Number(member.id),
      lineUserId: toText(input.lineUserId),
      lineDisplayName: input.lineDisplayName,
      linePictureUrl: input.linePictureUrl,
    })
  }
  const rows = (await supabaseSelectFilter('members', `id=eq.${member.id}`, { limit: 1 })) as MemberRow[]
  const lineMap = await getLineIdentities([Number(member.id)])
  return toMemberSummary(rows[0], lineMap.get(Number(member.id)))
}

export async function updateMember(input: UpdateMemberInput): Promise<MemberSummary> {
  const id = Number(input.id || 0)
  if (!id) throw new Error('유효한 회원 ID가 필요합니다.')
  const patch: Record<string, unknown> = {
    updated_at: getBangkokDateTimeString(),
  }
  if (input.name != null) patch.name = toText(input.name)
  if (input.fullName != null) patch.full_name = toText(input.fullName) || null
  if (input.lineDisplayName != null) patch.line_display_name = toText(input.lineDisplayName) || null
  if (input.birthDate != null) patch.birth_date = toText(input.birthDate) || null
  if (input.gender != null) patch.gender = toText(input.gender) || null
  if (input.nationality != null) patch.nationality = toText(input.nationality) || null
  if (input.joinChannel != null) patch.join_channel = toText(input.joinChannel) || 'store'
  if (input.joinStoreCode != null) {
    const nextJoinStore = toText(input.joinStoreCode)
    if (nextJoinStore) patch.join_store_code = nextJoinStore
  }
  if (input.referralCode != null) patch.referral_code = toText(input.referralCode).toUpperCase() || null
  if (input.referredByMemberId != null) patch.referred_by_member_id = Number(input.referredByMemberId || 0) || null
  if (input.phone != null) {
    const phone = normalizePhone(input.phone) || null
    if (phone) {
      const existingId = await findActiveMemberIdByPhoneLookup(phone)
      if (existingId && existingId !== id) {
        throw new MemberSaveError(
          'DUPLICATE_PHONE',
          '이 전화번호는 이미 다른 회원에게 등록되어 있습니다.'
        )
      }
    }
    patch.phone = phone
  }
  if (input.email != null) patch.email = normalizeEmail(input.email) || null
  if (input.consentMarketing != null) patch.consent_marketing = Boolean(input.consentMarketing)
  if (input.consentPrivacy != null) patch.consent_privacy = Boolean(input.consentPrivacy)
  if (input.consentAt != null) patch.consent_at = toText(input.consentAt) || null
  if (input.status != null) patch.status = toText(input.status) || 'active'
  try {
    await supabaseUpdateByFilter('members', `id=eq.${id}`, patch)
  } catch (e) {
    rethrowMemberSaveError(e)
  }

  const rows = (await supabaseSelectFilter('members', `id=eq.${id}`, { limit: 1 })) as MemberRow[]
  if (!rows || rows.length === 0) throw new Error('회원을 찾을 수 없습니다.')
  const lineMap = await getLineIdentities([id])
  return toMemberSummary(rows[0], lineMap.get(id))
}

export async function registerLineMember(input: {
  lineUserId: string
  displayName?: string
  pictureUrl?: string
  phone?: string
  email?: string
  name?: string
  joinStoreCode?: string
}): Promise<MemberSummary> {
  const lineUserId = toText(input.lineUserId)
  if (!lineUserId) throw new Error('lineUserId가 필요합니다.')

  const identityRows = (await supabaseSelectFilter(
    'member_identities',
    `provider=eq.line&provider_user_id=eq.${encodeURIComponent(lineUserId)}`,
    { limit: 1 }
  )) as MemberIdentityRow[]

  if (identityRows && identityRows.length > 0) {
    const existingIdentity = identityRows[0]
    const memberId = Number(existingIdentity.member_id || 0)
    if (!memberId) throw new Error('LINE 계정에 연결된 회원을 찾을 수 없습니다.')

    const now = getBangkokDateTimeString()
    const patch: Record<string, unknown> = {
      updated_at: now,
    }
    if (toText(input.phone)) patch.phone = normalizePhone(input.phone || '') || null
    if (toText(input.email)) patch.email = normalizeEmail(input.email || '') || null
    if (toText(input.name)) patch.name = toText(input.name)
    if (toText(input.displayName)) patch.line_display_name = toText(input.displayName)
    patch.join_channel = 'line'
    await supabaseUpdateByFilter('members', `id=eq.${memberId}`, patch)
    const identityPatch: Record<string, unknown> = {
      status: 'active',
      last_seen_at: now,
    }
    if (toText(input.displayName)) identityPatch.display_name = toText(input.displayName)
    if (toText(input.pictureUrl)) identityPatch.picture_url = toText(input.pictureUrl)
    await supabaseUpdateByFilter('member_identities', `id=eq.${existingIdentity.id}`, identityPatch)

    const rows = (await supabaseSelectFilter('members', `id=eq.${memberId}`, { limit: 1 })) as MemberRow[]
    const lineMap = await getLineIdentities([memberId])
    return toMemberSummary(rows[0], lineMap.get(memberId))
  }

  const displayName = toText(input.displayName)
  if (displayName) {
    const crmMatches = (await supabaseSelectFilter(
      'members',
      `line_display_name=eq.${encodeURIComponent(displayName)}`,
      { order: 'id.asc', limit: 5 }
    )) as MemberRow[]
    for (const row of crmMatches || []) {
      const memberId = Number(row.id || 0)
      if (!memberId) continue
      const linked = (await supabaseSelectFilter(
        'member_identities',
        `member_id=eq.${memberId}&provider=eq.line`,
        { limit: 1 }
      )) as MemberIdentityRow[]
      if (linked?.length) continue
      const now = getBangkokDateTimeString()
      await ensureLineIdentity({
        memberId,
        lineUserId,
        lineDisplayName: displayName,
        linePictureUrl: toText(input.pictureUrl),
      })
      await supabaseUpdateByFilter('members', `id=eq.${memberId}`, {
        join_channel: 'line',
        updated_at: now,
      })
      const rows = (await supabaseSelectFilter('members', `id=eq.${memberId}`, { limit: 1 })) as MemberRow[]
      const lineMap = await getLineIdentities([memberId])
      return toMemberSummary(rows[0], lineMap.get(memberId))
    }
  }

  const joinStoreCode = toText(input.joinStoreCode)
  const { isAllowedMemberSignupStoreCode } = await import('@/lib/member-signup-store')
  if (joinStoreCode && !(await isAllowedMemberSignupStoreCode(joinStoreCode))) {
    throw new Error('invalid_store')
  }

  const created = await createMember({
    name: toText(input.name) || toText(input.displayName) || `LINE-${lineUserId.slice(0, 6)}`,
    phone: input.phone,
    email: input.email,
    source: 'line',
    joinChannel: 'line',
    joinStoreCode: joinStoreCode || undefined,
    lineUserId,
    lineDisplayName: toText(input.displayName),
    linePictureUrl: toText(input.pictureUrl),
  })
  return created
}

export async function setLineIdentityStatus(lineUserId: string, status: 'active' | 'inactive'): Promise<void> {
  const key = toText(lineUserId)
  if (!key) return
  await supabaseUpdateByFilter(
    'member_identities',
    `provider=eq.line&provider_user_id=eq.${encodeURIComponent(key)}`,
    {
      status,
      last_seen_at: getBangkokDateTimeString(),
    }
  )
}

export async function listLineMembers(params?: { q?: string; limit?: number }) {
  const q = toText(params?.q)
  const limit = Math.max(1, Math.min(Number(params?.limit || 100), 500))
  let filter = `provider=eq.line&status=eq.active`
  if (q) {
    const k = encodeURIComponent(`*${q}*`)
    filter += `&or=(provider_user_id.ilike.${k},display_name.ilike.${k})`
  }
  const identities = (await supabaseSelectFilter('member_identities', filter, { order: 'id.desc', limit })) as MemberIdentityRow[]
  const memberIds = (identities || []).map((x) => Number(x.member_id || 0)).filter((x) => x > 0)
  if (!memberIds.length) return []
  const members = (await supabaseSelectFilter(
    'members',
    `id=in.(${memberIds.join(',')})`,
    { limit: 5000 }
  )) as MemberRow[]
  const memberMap = new Map<number, MemberRow>()
  for (const m of members || []) memberMap.set(Number(m.id || 0), m)

  return (identities || []).map((identity) => {
    const memberId = Number(identity.member_id || 0)
    const member = memberMap.get(memberId) || {}
    return {
      member: toMemberSummary(member, identity),
      identity: {
        id: Number(identity.id || 0),
        providerUserId: toText(identity.provider_user_id),
        displayName: toText(identity.display_name),
        pictureUrl: toText(identity.picture_url),
        status: toText(identity.status) || 'active',
        linkedAt: toText(identity.linked_at),
        lastSeenAt: toText(identity.last_seen_at),
      },
    }
  })
}

export async function linkLineIdentity(params: {
  memberId: number
  lineUserId: string
  displayName?: string
  pictureUrl?: string
}): Promise<void> {
  await ensureLineIdentity({
    memberId: params.memberId,
    lineUserId: params.lineUserId,
    lineDisplayName: params.displayName,
    linePictureUrl: params.pictureUrl,
  })
}

export async function unlinkLineIdentity(params: { memberId: number; lineUserId?: string }) {
  const memberId = Number(params.memberId || 0)
  if (!memberId) throw new Error('유효한 memberId가 필요합니다.')
  const lineUserId = toText(params.lineUserId)
  const base = `provider=eq.line&member_id=eq.${memberId}`
  const filter = lineUserId ? `${base}&provider_user_id=eq.${encodeURIComponent(lineUserId)}` : base
  await supabaseUpdateByFilter('member_identities', filter, {
    status: 'inactive',
    last_seen_at: getBangkokDateTimeString(),
  })
}

export function resolveMemberTierQualificationValue(
  member: Pick<MemberRow, 'lifetime_amount' | 'tier_points' | 'line_tier_points'>,
  basis: MemberTierUpgradeBasis
): number {
  if (basis === 'amount') return Math.max(0, Number(member.lifetime_amount || 0))
  return Math.max(
    0,
    normalizeMemberPoints(member.tier_points),
    normalizeMemberPoints(member.line_tier_points)
  )
}

export async function getMemberVisits(params?: {
  memberId?: number
  limit?: number
  startStr?: string
  endStr?: string
  storeCode?: string
}) {
  const memberId = Number(params?.memberId || 0)
  const limit = Math.max(1, Math.min(Number(params?.limit || 100), 500))
  const filters: string[] = ['member_id=not.is.null', 'member_id=gt.0']
  if (memberId) filters.push(`member_id=eq.${memberId}`)
  const startStr = toText(params?.startStr).slice(0, 10)
  const endStr = toText(params?.endStr).slice(0, 10)
  if (startStr && endStr) {
    const { gteIso, lteIso } = bangkokYmdRangeToIsoBounds(startStr, endStr)
    filters.push(`created_at=gte.${encodeURIComponent(gteIso)}`)
    filters.push(`created_at=lte.${encodeURIComponent(lteIso)}`)
  }
  const storeCode = toText(params?.storeCode)
  if (storeCode && storeCode !== 'All') {
    filters.push(`store_code=eq.${encodeURIComponent(storeCode)}`)
  }
  const filter = filters.join('&')
  const rows = (await supabaseSelectFilter(
    'pos_orders',
    filter,
    {
      order: 'created_at.desc',
      limit,
      select: 'id,member_id,member_no,store_code,order_no,total,created_at',
    }
  )) as {
    id?: number
    member_id?: number
    member_no?: string
    store_code?: string
    order_no?: string
    total?: number
    created_at?: string
  }[]
  return (rows || []).map((row) => ({
    orderId: Number(row.id || 0),
    memberId: Number(row.member_id || 0),
    memberNo: toText(row.member_no),
    storeCode: toText(row.store_code),
    orderNo: toText(row.order_no),
    total: Number(row.total || 0),
    visitedAt: toText(row.created_at),
  }))
}

export async function createMemberEvent(params: {
  eventId: string
  eventType: string
  payload: unknown
  status?: string
  memberId?: number
  errorMessage?: string
}): Promise<boolean> {
  const eventId = toText(params.eventId)
  if (!eventId) throw new Error('eventId가 필요합니다.')
  try {
    await supabaseInsert('member_events', {
      event_id: eventId,
      provider: 'line',
      event_type: toText(params.eventType) || 'unknown',
      status: toText(params.status) || 'processed',
      payload: params.payload ?? null,
      member_id: params.memberId || null,
      error_message: toText(params.errorMessage) || null,
      processed_at: getBangkokDateTimeString(),
    })
    return true
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.toLowerCase().includes('duplicate key')) return false
    throw e
  }
}

export async function resetLineMemberList(): Promise<{
  deactivatedLineIdentities: number
  deactivatedLineMembers: number
  deletedImportRows: number
  deletedImportJobs: number
}> {
  let deactivatedLineIdentities = 0
  let deactivatedLineMembers = 0
  let deletedImportRows = 0
  let deletedImportJobs = 0

  try {
    deactivatedLineIdentities = await supabaseCountFilter('member_identities', 'provider=eq.line')
    await supabaseUpdateByFilter('member_identities', 'provider=eq.line', {
      status: 'inactive',
      display_name: null,
      picture_url: null,
      last_seen_at: getBangkokDateTimeString(),
    })
  } catch {
    deactivatedLineIdentities = 0
  }

  try {
    deactivatedLineMembers = await supabaseCountFilter(
      'members',
      'or=(source=eq.line,source=eq.line_import)'
    )
    await supabaseUpdateByFilter('members', 'or=(source=eq.line,source=eq.line_import)', {
      status: 'inactive',
      line_display_name: null,
      updated_at: getBangkokDateTimeString(),
    })
  } catch {
    deactivatedLineMembers = 0
  }

  try {
    deletedImportRows = await supabaseCountFilter('line_import_rows', 'id=gt.0')
    await supabaseDeleteByFilter('line_import_rows', 'id=gt.0')
  } catch {
    deletedImportRows = 0
  }

  try {
    deletedImportJobs = await supabaseCountFilter('line_import_jobs', 'id=gt.0')
    await supabaseDeleteByFilter('line_import_jobs', 'id=gt.0')
  } catch {
    deletedImportJobs = 0
  }

  return {
    deactivatedLineIdentities,
    deactivatedLineMembers,
    deletedImportRows,
    deletedImportJobs,
  }
}
