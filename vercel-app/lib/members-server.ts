import crypto from 'crypto'
import {
  supabaseCountFilter,
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseRpc,
  supabaseSelect,
  supabaseSelectAllPages,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
  supabaseUpsert,
} from '@/lib/supabase-server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'

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

type MemberRow = {
  id?: number
  member_no?: string | null
  name?: string | null
  full_name?: string | null
  birth_date?: string | null
  gender?: string | null
  nationality?: string | null
  join_channel?: string | null
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

type MemberTierRow = {
  id?: number
  code?: string
  name?: string
  min_amount?: number
  point_rate?: number
  created_at?: string
  updated_at?: string
}

type MemberPointLedgerRow = {
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
  referralCode?: string
  referredByMemberId?: number
  source?: string
  lineUserId?: string
  lineDisplayName?: string
  linePictureUrl?: string
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
  referralCode?: string
  referredByMemberId?: number
  phone?: string
  email?: string
  consentMarketing?: boolean
  consentPrivacy?: boolean
  consentAt?: string
  status?: string
}

function toText(v: unknown): string {
  return String(v || '').trim()
}

function normalizePhone(v: string): string {
  return toText(v).replace(/[^\d+]/g, '')
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

export async function listMembers(params?: { q?: string; limit?: number }): Promise<MemberSummary[]> {
  const q = toText(params?.q)
  const limit = Math.max(1, Math.min(Number(params?.limit || 100), 5000))

  let rows: MemberRow[] = []
  if (!q) {
    rows = (await supabaseSelect('members', { order: 'id.desc', limit })) as MemberRow[]
  } else {
    const escaped = encodeURIComponent(`*${q}*`)
    const normalizedDigits = q.replace(/[^\d]/g, '')
    const normalizedDigitsEscaped = normalizedDigits ? encodeURIComponent(`*${normalizedDigits}*`) : ''
    const memberOrClauses = [
      `name.ilike.${escaped}`,
      `full_name.ilike.${escaped}`,
      `line_display_name.ilike.${escaped}`,
      `phone.ilike.${escaped}`,
      `email.ilike.${escaped}`,
      `birth_date.ilike.${escaped}`,
      `member_no.ilike.${escaped}`,
      `tier_code.ilike.${escaped}`,
    ]
    if (normalizedDigits && normalizedDigits !== q) {
      memberOrClauses.push(`phone.ilike.${normalizedDigitsEscaped}`)
    }
    const memberFilter = `or=(${memberOrClauses.join(',')})`
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

export async function listMembersCursor(params?: { q?: string; afterId?: number; limit?: number }): Promise<MemberSummary[]> {
  const q = toText(params?.q)
  const afterId = Number(params?.afterId || 0) || null
  const limit = Math.max(1, Math.min(Number(params?.limit || 100), 500))
  try {
    const rows = (await supabaseRpc<MemberRow[]>('get_member_list_cursor', {
      p_after_id: afterId,
      p_limit: limit,
      p_q: q || null,
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
    const batchLimit = Math.max(limit, afterId ? limit + 500 : limit)
    const rows = await listMembers({ q, limit: batchLimit })
    const filtered = afterId ? rows.filter((m) => m.id > afterId) : rows
    return filtered.slice(0, limit)
  }
}

async function insertMemberBase(input: CreateMemberInput): Promise<MemberRow> {
  const now = getBangkokDateTimeString()
  const referralCode = toText(input.referralCode).toUpperCase() || null
  const referredByMemberId = Number(input.referredByMemberId || 0) || null
  let inserted: MemberRow[]
  try {
    inserted = (await supabaseInsert('members', {
      name: toText(input.name),
      phone: normalizePhone(input.phone || '') || null,
      email: normalizeEmail(input.email || '') || null,
      birth_date: toText(input.birthDate) || null,
      gender: toText(input.gender) || null,
      nationality: toText(input.nationality) || null,
      join_channel: toText(input.joinChannel) || 'store',
      referral_code: referralCode,
      referred_by_member_id: referredByMemberId,
      source: toText(input.source) || 'manual',
      status: 'active',
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
  if (input.referralCode != null) patch.referral_code = toText(input.referralCode).toUpperCase() || null
  if (input.referredByMemberId != null) patch.referred_by_member_id = Number(input.referredByMemberId || 0) || null
  if (input.phone != null) patch.phone = normalizePhone(input.phone) || null
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

  const created = await createMember({
    name: toText(input.name) || toText(input.displayName) || `LINE-${lineUserId.slice(0, 6)}`,
    phone: input.phone,
    email: input.email,
    source: 'line',
    joinChannel: 'line',
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

async function getActiveTiers(): Promise<MemberTierRow[]> {
  return (await supabaseSelect('member_tiers', { order: 'min_amount.asc', limit: 1000 })) as MemberTierRow[]
}

function pickTierByAmount(tiers: MemberTierRow[], amount: number): string {
  let next = 'BRONZE'
  for (const tier of tiers) {
    if (amount >= Number(tier.min_amount || 0)) next = toText(tier.code) || next
  }
  return next
}

export async function recalculateMemberTier(memberId: number): Promise<{ tierCode: string; lifetimeAmount: number }> {
  const id = Number(memberId || 0)
  if (!id) throw new Error('유효한 회원 ID가 필요합니다.')
  const rows = (await supabaseSelectFilter('members', `id=eq.${id}`, { limit: 1 })) as MemberRow[]
  const member = rows?.[0]
  if (!member) throw new Error('회원을 찾을 수 없습니다.')

  const lifetimeAmount = Number(member.lifetime_amount || 0)
  const prevTier = toText(member.tier_code) || 'BRONZE'
  const tiers = await getActiveTiers()
  const nextTier = pickTierByAmount(tiers, lifetimeAmount)
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
  return { tierCode: nextTier, lifetimeAmount }
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
  pointRate: number
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
        point_rate: Math.max(0, Number(params.pointRate || 0)),
        updated_at: getBangkokDateTimeString(),
      },
    ],
    'code'
  )
}

export async function listMemberPoints(params?: { memberId?: number; limit?: number }) {
  const memberId = Number(params?.memberId || 0)
  const limit = Math.max(1, Math.min(Number(params?.limit || 100), 500))
  const filter = memberId ? `member_id=eq.${memberId}` : ''
  const rows = filter
    ? ((await supabaseSelectFilter('member_points_ledger', filter, { order: 'id.desc', limit })) as MemberPointLedgerRow[])
    : ((await supabaseSelect('member_points_ledger', { order: 'id.desc', limit })) as MemberPointLedgerRow[])
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
  })
}

export async function applyLoyaltyOnOrder(params: {
  memberId?: number
  orderId?: number
  totalAmount: number
  pointUsed: number
  pointEarned?: number
  orderNo?: string
  couponCode?: string
}) {
  const memberId = Number(params.memberId || 0)
  if (!memberId) return { pointEarned: 0, tierCode: 'BRONZE' }
  const rows = (await supabaseSelectFilter('members', `id=eq.${memberId}`, { limit: 1 })) as MemberRow[]
  const member = rows?.[0]
  if (!member) return { pointEarned: 0, tierCode: 'BRONZE' }
  const tiers = await getActiveTiers()
  const currentTierCode = toText(member.tier_code) || 'BRONZE'
  const currentTier = tiers.find((x) => toText(x.code) === currentTierCode)
  const pointRate = Number(currentTier?.point_rate || 0.01)
  const pointUsed = Math.max(0, Math.trunc(Number(params.pointUsed || 0)))
  const autoEarn = Math.max(0, Math.floor(Number(params.totalAmount || 0) * pointRate))
  const pointEarned = Math.max(0, Math.trunc(Number(params.pointEarned ?? autoEarn)))
  const orderId = Number(params.orderId || 0) || null
  const existingByOrder = orderId
    ? ((await supabaseSelectFilter(
        'member_points_ledger',
        `member_id=eq.${memberId}&order_id=eq.${orderId}`,
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
      note: toText(params.orderNo) || 'order_earn',
      created_at: getBangkokDateTimeString(),
    })
  }
  if (toText(params.couponCode) && (shouldInsertUse || shouldInsertEarn)) {
    const couponCode = toText(params.couponCode).toUpperCase()
    const existingCoupon = orderId
      ? ((await supabaseSelectFilter(
          'member_coupon_issues',
          `member_id=eq.${memberId}&order_id=eq.${orderId}&coupon_code=eq.${encodeURIComponent(couponCode)}`,
          { limit: 1 }
        )) as Array<{ id?: number }>)
      : []
    if (!existingCoupon?.length) {
      await supabaseInsert('member_coupon_issues', {
        member_id: memberId,
        coupon_code: couponCode,
        issued_at: getBangkokDateTimeString(),
        used_at: getBangkokDateTimeString(),
        order_id: params.orderId || null,
        status: 'used',
      })
    }
  }

  if (!shouldInsertUse && !shouldInsertEarn) {
    return { pointEarned: 0, tierCode: currentTierCode }
  }

  await supabaseUpdateByFilter('members', `id=eq.${memberId}`, {
    point_balance: nextBalance,
    lifetime_amount: nextLifetime,
    last_visited_at: getBangkokDateTimeString(),
    updated_at: getBangkokDateTimeString(),
  })
  const recalc = await recalculateMemberTier(memberId)
  return { pointEarned: appliedEarn, tierCode: recalc.tierCode }
}

export async function listMemberCouponIssues(params?: { memberId?: number; limit?: number }) {
  const memberId = Number(params?.memberId || 0)
  const limit = Math.max(1, Math.min(Number(params?.limit || 100), 500))
  const filter = memberId ? `member_id=eq.${memberId}` : ''
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

  return (rows || []).map((row) => {
    const couponCode = toText(row.coupon_code).toUpperCase()
    const coupon = couponMap.get(couponCode)
    const campaignId = Number(row.campaign_id || 0) || null
    const issuedScopeRaw = row.issued_store_scope
    const issuedStoreScope = Array.isArray(issuedScopeRaw)
      ? issuedScopeRaw.map((x) => toText(x)).filter(Boolean)
      : []
    return {
      id: Number(row.id || 0),
      memberId: Number(row.member_id || 0),
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
    }
  })
}

export async function issueMemberCoupon(params: { memberId: number; couponCode: string }) {
  const memberId = Number(params.memberId || 0)
  const couponCode = toText(params.couponCode).toUpperCase()
  if (!memberId) throw new Error('유효한 memberId가 필요합니다.')
  if (!couponCode) throw new Error('couponCode가 필요합니다.')

  const couponRows = (await supabaseSelectFilter(
    'pos_coupons',
    `code=eq.${encodeURIComponent(couponCode)}`,
    { limit: 1, select: 'id,is_active,valid_to' }
  )) as Array<{ id?: number; is_active?: boolean; valid_to?: string | null }>
  const coupon = couponRows?.[0]
  if (!coupon?.id) {
    throw new Error(`POS 쿠폰 마스터에 ${couponCode} 코드가 없습니다.`)
  }
  if (coupon.is_active === false) {
    throw new Error('비활성 상태의 쿠폰은 발급할 수 없습니다.')
  }

  await supabaseInsert('member_coupon_issues', {
    member_id: memberId,
    coupon_code: couponCode,
    issued_at: getBangkokDateTimeString(),
    status: 'issued',
    expires_at: toText(coupon.valid_to) || null,
  })
}

export async function getMemberVisits(params?: { memberId?: number; limit?: number }) {
  const memberId = Number(params?.memberId || 0)
  const limit = Math.max(1, Math.min(Number(params?.limit || 100), 500))
  const filters: string[] = []
  if (memberId) filters.push(`member_id=eq.${memberId}`)
  const filter = filters.join('&')
  const rows = (filter
    ? await supabaseSelectFilter(
        'pos_orders',
        filter,
        {
          order: 'created_at.desc',
          limit,
          select: 'id,member_id,member_no,store_code,order_no,total,created_at',
        }
      )
    : await supabaseSelect('pos_orders', {
        order: 'created_at.desc',
        limit,
        select: 'id,member_id,member_no,store_code,order_no,total,created_at',
      })) as {
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
