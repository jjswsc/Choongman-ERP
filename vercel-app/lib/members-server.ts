import {
  supabaseInsert,
  supabaseSelect,
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
  phone: string
  email: string
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
  line_display_name?: string | null
  consent_marketing?: boolean | null
  consent_privacy?: boolean | null
  consent_at?: string | null
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

function normalizeEmail(v: string): string {
  return toText(v).toLowerCase()
}

function deriveLastUpdateReason(params: { source: string; lastLineEventType: string }): string {
  if (params.lastLineEventType) return `line_webhook:${params.lastLineEventType}`
  if (params.source === 'line_import') return 'crm_import'
  if (params.source === 'line') return 'line_sync_or_register'
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
    phone: toText(member.phone),
    email: toText(member.email),
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

async function insertMemberBase(input: CreateMemberInput): Promise<MemberRow> {
  const now = getBangkokDateTimeString()
  const inserted = (await supabaseInsert('members', {
    name: toText(input.name),
    phone: normalizePhone(input.phone || '') || null,
    email: normalizeEmail(input.email || '') || null,
    source: toText(input.source) || 'manual',
    status: 'active',
    created_at: now,
    updated_at: now,
  })) as MemberRow[]
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
  if (input.phone != null) patch.phone = normalizePhone(input.phone) || null
  if (input.email != null) patch.email = normalizeEmail(input.email) || null
  if (input.consentMarketing != null) patch.consent_marketing = Boolean(input.consentMarketing)
  if (input.consentPrivacy != null) patch.consent_privacy = Boolean(input.consentPrivacy)
  if (input.consentAt != null) patch.consent_at = toText(input.consentAt) || null
  if (input.status != null) patch.status = toText(input.status) || 'active'
  await supabaseUpdateByFilter('members', `id=eq.${id}`, patch)

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

  const created = await createMember({
    name: toText(input.name) || toText(input.displayName) || `LINE-${lineUserId.slice(0, 6)}`,
    phone: input.phone,
    email: input.email,
    source: 'line',
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
  const members = (await supabaseSelect('members', { limit: 5000, select: 'id' })) as { id?: number }[]
  let count = 0
  for (const member of members || []) {
    const id = Number(member.id || 0)
    if (!id) continue
    await recalculateMemberTier(id)
    count += 1
  }
  return count
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
  const nextBalance = Math.max(0, Number(member.point_balance || 0) - pointUsed + pointEarned)
  const nextLifetime = Number(member.lifetime_amount || 0) + Math.max(0, Number(params.totalAmount || 0))

  if (pointUsed > 0) {
    await supabaseInsert('member_points_ledger', {
      member_id: memberId,
      order_id: params.orderId || null,
      kind: 'use',
      points: -pointUsed,
      amount: Number(params.totalAmount || 0),
      note: toText(params.orderNo) || 'order_use',
      created_at: getBangkokDateTimeString(),
    })
  }
  if (pointEarned > 0) {
    await supabaseInsert('member_points_ledger', {
      member_id: memberId,
      order_id: params.orderId || null,
      kind: 'earn',
      points: pointEarned,
      amount: Number(params.totalAmount || 0),
      note: toText(params.orderNo) || 'order_earn',
      created_at: getBangkokDateTimeString(),
    })
  }
  if (toText(params.couponCode)) {
    await supabaseInsert('member_coupon_issues', {
      member_id: memberId,
      coupon_code: toText(params.couponCode).toUpperCase(),
      issued_at: getBangkokDateTimeString(),
      used_at: getBangkokDateTimeString(),
      order_id: params.orderId || null,
      status: 'used',
    })
  }

  await supabaseUpdateByFilter('members', `id=eq.${memberId}`, {
    point_balance: nextBalance,
    lifetime_amount: nextLifetime,
    updated_at: getBangkokDateTimeString(),
  })
  const recalc = await recalculateMemberTier(memberId)
  return { pointEarned, tierCode: recalc.tierCode }
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
  }[]
  return (rows || []).map((row) => ({
    id: Number(row.id || 0),
    memberId: Number(row.member_id || 0),
    couponCode: toText(row.coupon_code),
    issuedAt: toText(row.issued_at),
    usedAt: toText(row.used_at),
    orderId: Number(row.order_id || 0) || null,
    status: toText(row.status) || 'issued',
  }))
}

export async function issueMemberCoupon(params: { memberId: number; couponCode: string }) {
  const memberId = Number(params.memberId || 0)
  const couponCode = toText(params.couponCode).toUpperCase()
  if (!memberId) throw new Error('유효한 memberId가 필요합니다.')
  if (!couponCode) throw new Error('couponCode가 필요합니다.')
  await supabaseInsert('member_coupon_issues', {
    member_id: memberId,
    coupon_code: couponCode,
    issued_at: getBangkokDateTimeString(),
    status: 'issued',
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
