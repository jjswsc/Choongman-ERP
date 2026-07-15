import {
  addBangkokCalendarDays,
  getBangkokDateTimeString,
  getBangkokStartOfDayUtcIso,
  getBangkokTodayDateString,
} from '@/lib/bangkok-time'
import { adjustMemberPoints, getMemberVisits } from '@/lib/members-server'
import {
  supabaseInsert,
  supabaseRpc,
  supabaseSelect,
  supabaseSelectFilterAllPages,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
  supabaseCountFilter,
} from '@/lib/supabase-server'

function toText(v: unknown): string {
  return String(v || '').trim()
}

export type CrmSummary = {
  totalMembers: number
  recentActiveMembers: number
  dormantMembers: number
  totalLifetimeAmount: number
  avgOrderAmount: number
}

export async function getCrmSummary(params?: { recentDays?: number; dormantDays?: number }): Promise<CrmSummary> {
  try {
    const rows = (await supabaseRpc<Array<{
      total_members?: number
      recent_active_members?: number
      dormant_members?: number
      total_lifetime_amount?: number
      avg_order_amount?: number
    }>>('get_member_crm_summary', {
      p_recent_days: Number(params?.recentDays || 30),
      p_dormant_days: Number(params?.dormantDays || 90),
    })) || []
    const row = rows[0] || {}
    return {
      totalMembers: Number(row.total_members || 0),
      recentActiveMembers: Number(row.recent_active_members || 0),
      dormantMembers: Number(row.dormant_members || 0),
      totalLifetimeAmount: Number(row.total_lifetime_amount || 0),
      avgOrderAmount: Number(row.avg_order_amount || 0),
    }
  } catch {
    const members = (await supabaseSelect('members', { limit: 100000, select: 'id,lifetime_amount' })) as Array<{
      id?: number
      lifetime_amount?: number
    }>
    const totalLifetimeAmount = (members || []).reduce((a, b) => a + Number(b.lifetime_amount || 0), 0)
    return {
      totalMembers: members.length,
      recentActiveMembers: 0,
      dormantMembers: 0,
      totalLifetimeAmount,
      avgOrderAmount: 0,
    }
  }
}

export type CrmSegmentType =
  | 'vip'
  | 'recent30'
  | 'dormant90'
  | 'new30'
  | 'atRisk'
  | 'birthday7'
  | 'pointsIdle'

export const CRM_SEGMENT_TYPES: CrmSegmentType[] = [
  'recent30',
  'dormant90',
  'new30',
  'vip',
  'atRisk',
  'birthday7',
  'pointsIdle',
]

const MEMBER_RECENT_ORDER_SCAN_MAX_ROWS = 1_000_000
const POINTS_IDLE_DEFAULT_MIN = 100
const MEMBER_SEGMENT_SELECT =
  'id,member_no,name,phone,tier_code,point_balance,tier_points,lifetime_amount,last_visited_at,join_store_code,created_at,birth_date,status'

export type CrmSegmentMemberRow = {
  id: number
  memberNo: string
  name: string
  phone: string
  tierCode: string
  pointBalance: number
  lifetimeAmount: number
  lastVisitedAt: string
  joinStoreCode: string
  tierPoints: number
  createdAt: string
}

export type SegmentQueryParams = {
  segment: CrmSegmentType
  limit?: number
  recentDays?: number
  dormantDays?: number
  storeCode?: string
  pointsMin?: number
}

function clampDays(v: unknown, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function storeFilterPart(storeCode?: string): string {
  const code = toText(storeCode)
  if (!code || code === 'All' || code === '__all__') return ''
  if (code === '__unset__') return 'or=(join_store_code.is.null,join_store_code.eq.)'
  return `join_store_code=eq.${encodeURIComponent(code)}`
}

function andFilters(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join('&')
}

function mapMemberSegmentRow(row: Record<string, unknown>): CrmSegmentMemberRow {
  return {
    id: Number(row.id || 0),
    memberNo: toText(row.member_no),
    name: toText(row.name),
    phone: toText(row.phone),
    tierCode: toText(row.tier_code) || 'BRONZE',
    pointBalance: Number(row.point_balance || 0),
    lifetimeAmount: Number(row.lifetime_amount || 0),
    lastVisitedAt: toText(row.last_visited_at),
    joinStoreCode: toText(row.join_store_code),
    tierPoints: Number(row.tier_points || 0),
    createdAt: toText(row.created_at),
  }
}

function birthMd(value: unknown): string {
  const raw = toText(value)
  if (!raw) return ''
  // YYYY-MM-DD or datetime
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[2]}-${m[3]}`
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

function birthdayWindowMds(todayYmd: string, windowDays = 7): Set<string> {
  const set = new Set<string>()
  for (let i = -windowDays; i <= windowDays; i++) {
    const ymd = addBangkokCalendarDays(todayYmd, i)
    const [, mm, dd] = ymd.split('-')
    if (mm && dd) set.add(`${mm}-${dd}`)
  }
  return set
}

async function countOrZero(table: string, filter: string): Promise<number> {
  try {
    return await supabaseCountFilter(table, filter)
  } catch {
    return 0
  }
}

export async function listSegmentMembers(params: SegmentQueryParams): Promise<CrmSegmentMemberRow[]> {
  const limit = Math.max(1, Math.min(Number(params.limit || 500), 5000))
  const recentDays = clampDays(params.recentDays, 30, 7, 365)
  const dormantDays = clampDays(params.dormantDays, 90, 14, 720)
  const pointsMin = Math.max(0, Number(params.pointsMin ?? POINTS_IDLE_DEFAULT_MIN) || POINTS_IDLE_DEFAULT_MIN)
  const storePart = storeFilterPart(params.storeCode)
  const todayBangkok = getBangkokTodayDateString()
  const recentStart = getBangkokStartOfDayUtcIso(addBangkokCalendarDays(todayBangkok, -recentDays))
  const dormantBefore = getBangkokStartOfDayUtcIso(addBangkokCalendarDays(todayBangkok, -dormantDays))
  const atRiskStart = getBangkokStartOfDayUtcIso(addBangkokCalendarDays(todayBangkok, -dormantDays))
  const atRiskEnd = getBangkokStartOfDayUtcIso(addBangkokCalendarDays(todayBangkok, -recentDays))
  const activePart = 'status=eq.active'

  const fetchMapped = async (filter: string, order = 'id.desc') => {
    const rows = (await supabaseSelectFilter('members', andFilters(filter, activePart, storePart) || activePart, {
      order,
      limit,
      select: MEMBER_SEGMENT_SELECT,
    })) as Array<Record<string, unknown>>
    return rows.map(mapMemberSegmentRow).filter((r) => r.id > 0)
  }

  if (params.segment === 'vip') {
    return fetchMapped('tier_code=eq.VIP')
  }
  if (params.segment === 'new30') {
    return fetchMapped(`created_at=gte.${encodeURIComponent(recentStart)}`)
  }
  if (params.segment === 'pointsIdle') {
    return fetchMapped(`point_balance=gte.${encodeURIComponent(String(pointsMin))}`, 'point_balance.desc')
  }
  if (params.segment === 'atRisk') {
    return fetchMapped(
      `and=(last_visited_at.gte.${encodeURIComponent(atRiskStart)},last_visited_at.lt.${encodeURIComponent(atRiskEnd)})`,
      'last_visited_at.asc'
    )
  }
  if (params.segment === 'dormant90') {
    return fetchMapped(
      `or=(last_visited_at.is.null,last_visited_at.lt.${encodeURIComponent(dormantBefore)})`
    )
  }
  if (params.segment === 'birthday7') {
    const window = birthdayWindowMds(todayBangkok, 7)
    const scanLimit = Math.min(Math.max(limit * 30, 3000), 20000)
    const rows = (await supabaseSelectFilter(
      'members',
      andFilters(activePart, 'birth_date=not.is.null', storePart) || andFilters(activePart, 'birth_date=not.is.null'),
      { order: 'id.desc', limit: scanLimit, select: MEMBER_SEGMENT_SELECT }
    )) as Array<Record<string, unknown>>
    return rows
      .filter((row) => {
        const md = birthMd(row.birth_date)
        return Boolean(md && window.has(md))
      })
      .map(mapMemberSegmentRow)
      .filter((r) => r.id > 0)
      .slice(0, limit)
  }
  // recent30 (orders based)
  const orderRows = (await supabaseSelectFilterAllPages(
    'pos_orders',
    `member_id=not.is.null&created_at=gte.${encodeURIComponent(recentStart)}`,
    { order: 'created_at.desc', pageSize: 8000, maxRows: MEMBER_RECENT_ORDER_SCAN_MAX_ROWS, select: 'member_id' }
  )) as Array<{ member_id?: number }>
  const memberIds = Array.from(new Set(orderRows.map((x) => Number(x.member_id || 0)).filter((x) => x > 0)))
  if (!memberIds.length) return []
  // batch in chunks of 200
  const out: CrmSegmentMemberRow[] = []
  for (let i = 0; i < memberIds.length && out.length < limit; i += 200) {
    const chunk = memberIds.slice(i, i + 200)
    const rows = (await supabaseSelectFilter(
      'members',
      andFilters(`id=in.(${chunk.join(',')})`, activePart, storePart) || `id=in.(${chunk.join(',')})`,
      { limit: 500, select: MEMBER_SEGMENT_SELECT }
    )) as Array<Record<string, unknown>>
    out.push(...rows.map(mapMemberSegmentRow).filter((r) => r.id > 0))
  }
  return out.slice(0, limit)
}

export async function getRfmTop(params?: { limit?: number }) {
  const limit = Math.max(1, Math.min(Number(params?.limit || 200), 5000))
  try {
    const rows = (await supabaseRpc<Array<{
      member_id?: number
      recency_days?: number
      frequency_count?: number
      monetary_amount?: number
      r_score?: number
      f_score?: number
      m_score?: number
      rfm_score?: string
    }>>('get_member_rfm_scores', { p_limit: limit })) || []
    return rows.map((row) => ({
      memberId: Number(row.member_id || 0),
      recencyDays: Number(row.recency_days || 0),
      frequencyCount: Number(row.frequency_count || 0),
      monetaryAmount: Number(row.monetary_amount || 0),
      rScore: Number(row.r_score || 0),
      fScore: Number(row.f_score || 0),
      mScore: Number(row.m_score || 0),
      rfmScore: toText(row.rfm_score),
    }))
  } catch {
    return []
  }
}

export async function addMemberNote(params: {
  memberId: number
  note: string
  tags?: string[]
  createdBy?: string
}) {
  const memberId = Number(params.memberId || 0)
  const note = toText(params.note)
  if (!memberId) throw new Error('memberId가 필요합니다.')
  if (!note) throw new Error('메모 내용이 필요합니다.')
  await supabaseInsert('member_notes', {
    member_id: memberId,
    note,
    tags: Array.isArray(params.tags) ? params.tags.map((x) => toText(x)).filter(Boolean) : [],
    created_by: toText(params.createdBy) || null,
    created_at: getBangkokDateTimeString(),
  })
}

export async function listMemberNotes(memberId: number, limit = 100) {
  const id = Number(memberId || 0)
  if (!id) return []
  const rows = (await supabaseSelectFilter(
    'member_notes',
    `member_id=eq.${id}`,
    { order: 'id.desc', limit: Math.max(1, Math.min(limit, 1000)) }
  )) as Array<{
    id?: number
    note?: string
    tags?: string[]
    created_by?: string
    created_at?: string
  }>
  return rows.map((row) => ({
    id: Number(row.id || 0),
    note: toText(row.note),
    tags: Array.isArray(row.tags) ? row.tags.map((x) => toText(x)).filter(Boolean) : [],
    createdBy: toText(row.created_by),
    createdAt: toText(row.created_at),
  }))
}

export async function approveReferral(params: {
  referrerMemberId: number
  referredMemberId: number
  referrerPoints?: number
  referredPoints?: number
}) {
  const referrerMemberId = Number(params.referrerMemberId || 0)
  const referredMemberId = Number(params.referredMemberId || 0)
  if (!referrerMemberId || !referredMemberId) throw new Error('추천인/피추천인 memberId가 필요합니다.')
  const referrerPoints = Math.max(0, Math.trunc(Number(params.referrerPoints || 50)))
  const referredPoints = Math.max(0, Math.trunc(Number(params.referredPoints || 50)))
  try {
    await supabaseInsert('member_referral_events', {
      referrer_member_id: referrerMemberId,
      referred_member_id: referredMemberId,
      referrer_points: referrerPoints,
      referred_points: referredPoints,
      status: 'approved',
      created_at: getBangkokDateTimeString(),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.toLowerCase().includes('duplicate key')) throw e
  }
  if (referrerPoints > 0) {
    await adjustMemberPoints({
      memberId: referrerMemberId,
      points: referrerPoints,
      note: `referral_reward:${referredMemberId}`,
    })
  }
  if (referredPoints > 0) {
    await adjustMemberPoints({
      memberId: referredMemberId,
      points: referredPoints,
      note: `referral_welcome:${referrerMemberId}`,
    })
  }
  await supabaseUpdateByFilter('members', `id=eq.${referredMemberId}`, {
    referred_by_member_id: referrerMemberId,
    updated_at: getBangkokDateTimeString(),
  })
}

export async function getSegmentCounts(params?: {
  recentDays?: number
  dormantDays?: number
  storeCode?: string
  pointsMin?: number
}): Promise<Record<CrmSegmentType, number>> {
  const recentDays = clampDays(params?.recentDays, 30, 7, 365)
  const dormantDays = clampDays(params?.dormantDays, 90, 14, 720)
  const pointsMin = Math.max(0, Number(params?.pointsMin ?? POINTS_IDLE_DEFAULT_MIN) || POINTS_IDLE_DEFAULT_MIN)
  const storeCode = toText(params?.storeCode)

  try {
    const rows = (await supabaseRpc<
      Array<{
        recent30?: number
        dormant90?: number
        new30?: number
        vip?: number
        at_risk?: number
        birthday7?: number
        points_idle?: number
      }>
    >('get_crm_segment_counts', {
      p_recent_days: recentDays,
      p_dormant_days: dormantDays,
      p_store_code: storeCode && storeCode !== 'All' ? storeCode : null,
      p_points_min: pointsMin,
    })) || []
    const row = rows[0]
    if (row) {
      return {
        recent30: Number(row.recent30 || 0),
        dormant90: Number(row.dormant90 || 0),
        new30: Number(row.new30 || 0),
        vip: Number(row.vip || 0),
        atRisk: Number(row.at_risk || 0),
        birthday7: Number(row.birthday7 || 0),
        pointsIdle: Number(row.points_idle || 0),
      }
    }
  } catch {
    /* fallback below */
  }

  const out = {} as Record<CrmSegmentType, number>
  await Promise.all(
    CRM_SEGMENT_TYPES.map(async (segment) => {
      if (segment === 'recent30' || segment === 'birthday7') {
        const rows = await listSegmentMembers({
          segment,
          limit: 5000,
          recentDays,
          dormantDays,
          storeCode,
          pointsMin,
        })
        out[segment] = rows.length
        return
      }
      const todayBangkok = getBangkokTodayDateString()
      const recentStart = getBangkokStartOfDayUtcIso(addBangkokCalendarDays(todayBangkok, -recentDays))
      const dormantBefore = getBangkokStartOfDayUtcIso(addBangkokCalendarDays(todayBangkok, -dormantDays))
      const atRiskStart = getBangkokStartOfDayUtcIso(addBangkokCalendarDays(todayBangkok, -dormantDays))
      const atRiskEnd = getBangkokStartOfDayUtcIso(addBangkokCalendarDays(todayBangkok, -recentDays))
      const storePart = storeFilterPart(storeCode)
      const activePart = 'status=eq.active'
      let filter = activePart
      if (segment === 'vip') filter = andFilters(activePart, 'tier_code=eq.VIP', storePart)
      else if (segment === 'new30') filter = andFilters(activePart, `created_at=gte.${encodeURIComponent(recentStart)}`, storePart)
      else if (segment === 'pointsIdle') {
        filter = andFilters(activePart, `point_balance=gte.${encodeURIComponent(String(pointsMin))}`, storePart)
      } else if (segment === 'atRisk') {
        filter = andFilters(
          activePart,
          `and=(last_visited_at.gte.${encodeURIComponent(atRiskStart)},last_visited_at.lt.${encodeURIComponent(atRiskEnd)})`,
          storePart
        )
      } else if (segment === 'dormant90') {
        filter = andFilters(
          activePart,
          `or=(last_visited_at.is.null,last_visited_at.lt.${encodeURIComponent(dormantBefore)})`,
          storePart
        )
      }
      out[segment] = await countOrZero('members', filter || activePart)
    })
  )
  return out
}

export type CrmStoreMemberStat = {
  storeCode: string
  activeMembers: number
  newMembers: number
  dormantMembers: number
}

export async function getCrmStoreMemberStats(params?: {
  recentDays?: number
  dormantDays?: number
}): Promise<CrmStoreMemberStat[]> {
  const recentDays = clampDays(params?.recentDays, 30, 7, 365)
  const dormantDays = clampDays(params?.dormantDays, 90, 14, 720)
  const todayBangkok = getBangkokTodayDateString()
  const recentStart = getBangkokStartOfDayUtcIso(addBangkokCalendarDays(todayBangkok, -recentDays))
  const dormantBefore = getBangkokStartOfDayUtcIso(addBangkokCalendarDays(todayBangkok, -dormantDays))

  try {
    const rows = (await supabaseRpc<
      Array<{
        store_code?: string
        active_members?: number
        new_members?: number
        dormant_members?: number
      }>
    >('get_crm_store_member_stats', {
      p_recent_days: recentDays,
      p_dormant_days: dormantDays,
    })) || []
    if (rows.length) {
      return rows.map((r) => ({
        storeCode: toText(r.store_code) || '__unset__',
        activeMembers: Number(r.active_members || 0),
        newMembers: Number(r.new_members || 0),
        dormantMembers: Number(r.dormant_members || 0),
      }))
    }
  } catch {
    /* fallback */
  }

  const members = (await supabaseSelectFilterAllPages(
    'members',
    'status=eq.active',
    {
      order: 'id.asc',
      pageSize: 5000,
      maxRows: 200_000,
      select: 'id,join_store_code,created_at,last_visited_at',
    }
  )) as Array<{
    id?: number
    join_store_code?: string | null
    created_at?: string | null
    last_visited_at?: string | null
  }>

  const map = new Map<string, CrmStoreMemberStat>()
  const bump = (code: string) => {
    const key = code || '__unset__'
    let row = map.get(key)
    if (!row) {
      row = { storeCode: key, activeMembers: 0, newMembers: 0, dormantMembers: 0 }
      map.set(key, row)
    }
    return row
  }
  for (const m of members) {
    const row = bump(toText(m.join_store_code))
    row.activeMembers += 1
    const created = toText(m.created_at)
    if (created && created >= recentStart.replace('T', ' ').slice(0, 19)) {
      // ISO compare: created_at may be without Z
      try {
        if (new Date(created).getTime() >= new Date(recentStart).getTime()) row.newMembers += 1
      } catch {
        /* ignore */
      }
    }
    const last = toText(m.last_visited_at)
    if (!last || new Date(last).getTime() < new Date(dormantBefore).getTime()) {
      row.dormantMembers += 1
    }
  }
  return Array.from(map.values()).sort((a, b) => b.activeMembers - a.activeMembers)
}

export type MemberVisitAnalysisRow = {
  memberId: number
  memberNo: string
  memberName: string
  visitCount: number
  avgVisitCycleDays: number | null
  avgTicketAmount: number
  totalContribution: number
  lastVisitedAt: string
}

export async function getMemberVisitAnalysis(params: {
  startStr: string
  endStr: string
  storeCode?: string
  memberId?: number
  q?: string
  limit?: number
}): Promise<MemberVisitAnalysisRow[]> {
  const limit = Math.max(1, Math.min(Number(params.limit || 500), 2000))
  try {
    const rows = (await supabaseRpc<Array<{
      member_id?: number
      member_no?: string
      member_name?: string
      visit_count?: number
      avg_visit_cycle_days?: number | null
      avg_ticket_amount?: number
      total_contribution?: number
      last_visited_at?: string
    }>>('get_member_visit_analysis', {
      p_start_ymd: toText(params.startStr).slice(0, 10),
      p_end_ymd: toText(params.endStr).slice(0, 10),
      p_store_code: params.storeCode && params.storeCode !== 'All' ? params.storeCode : null,
      p_member_id: Number(params.memberId || 0) || null,
      p_q: toText(params.q) || null,
      p_limit: limit,
    })) || []
    return rows.map((r) => ({
      memberId: Number(r.member_id || 0),
      memberNo: toText(r.member_no),
      memberName: toText(r.member_name),
      visitCount: Number(r.visit_count || 0),
      avgVisitCycleDays: r.avg_visit_cycle_days == null ? null : Number(r.avg_visit_cycle_days),
      avgTicketAmount: Number(r.avg_ticket_amount || 0),
      totalContribution: Number(r.total_contribution || 0),
      lastVisitedAt: toText(r.last_visited_at),
    }))
  } catch {
    const visitRows = await getMemberVisits({
      startStr: params.startStr,
      endStr: params.endStr,
      storeCode: params.storeCode,
      memberId: params.memberId,
      limit: 500,
    })
    const byMember = new Map<number, typeof visitRows>()
    for (const row of visitRows) {
      const id = Number(row.memberId || 0)
      if (!id) continue
      const list = byMember.get(id) || []
      list.push(row)
      byMember.set(id, list)
    }
    const out: MemberVisitAnalysisRow[] = []
    for (const [memberId, list] of byMember.entries()) {
      const visitCount = list.length
      const totalContribution = list.reduce((s, x) => s + Number(x.total || 0), 0)
      const avgTicketAmount = visitCount > 0 ? totalContribution / visitCount : 0
      const sorted = [...list].sort((a, b) => String(b.visitedAt).localeCompare(String(a.visitedAt)))
      out.push({
        memberId,
        memberNo: String(list[0]?.memberNo || ''),
        memberName: '',
        visitCount,
        avgVisitCycleDays: null,
        avgTicketAmount,
        totalContribution,
        lastVisitedAt: sorted[0]?.visitedAt || '',
      })
    }
    const q = toText(params.q).toLowerCase()
    const filtered = q
      ? out.filter((r) => r.memberNo.toLowerCase().includes(q) || String(r.memberId).includes(q))
      : out
    return filtered.sort((a, b) => b.totalContribution - a.totalContribution).slice(0, limit)
  }
}

