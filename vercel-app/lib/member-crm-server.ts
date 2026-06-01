import {
  addBangkokCalendarDays,
  getBangkokDateTimeString,
  getBangkokStartOfDayUtcIso,
  getBangkokTodayDateString,
} from '@/lib/bangkok-time'
import { adjustMemberPoints } from '@/lib/members-server'
import {
  supabaseInsert,
  supabaseRpc,
  supabaseSelect,
  supabaseSelectFilterAllPages,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
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

export type CrmSegmentType = 'vip' | 'recent30' | 'dormant90' | 'new30' | 'atRisk'
const MEMBER_RECENT_ORDER_SCAN_MAX_ROWS = 1_000_000

export async function listSegmentMembers(params: {
  segment: CrmSegmentType
  limit?: number
}): Promise<Array<{ id: number; name: string; phone: string; tierCode: string; pointBalance: number; lifetimeAmount: number }>> {
  const limit = Math.max(1, Math.min(Number(params.limit || 500), 5000))
  if (params.segment === 'vip') {
    const rows = (await supabaseSelectFilter('members', 'tier_code=eq.VIP', { order: 'id.desc', limit })) as Array<{
      id?: number
      name?: string
      phone?: string
      tier_code?: string
      point_balance?: number
      lifetime_amount?: number
    }>
    return rows.map((row) => ({
      id: Number(row.id || 0),
      name: toText(row.name),
      phone: toText(row.phone),
      tierCode: toText(row.tier_code) || 'BRONZE',
      pointBalance: Number(row.point_balance || 0),
      lifetimeAmount: Number(row.lifetime_amount || 0),
    }))
  }
  const todayBangkok = getBangkokTodayDateString()
  const recent30 = getBangkokStartOfDayUtcIso(addBangkokCalendarDays(todayBangkok, -30))
  const dormant90 = getBangkokStartOfDayUtcIso(addBangkokCalendarDays(todayBangkok, -90))
  const atRiskStart = getBangkokStartOfDayUtcIso(addBangkokCalendarDays(todayBangkok, -90))
  const atRiskEnd = getBangkokStartOfDayUtcIso(addBangkokCalendarDays(todayBangkok, -30))
  if (params.segment === 'new30') {
    const rows = (await supabaseSelectFilter(
      'members',
      `created_at=gte.${encodeURIComponent(recent30)}`,
      { order: 'id.desc', limit }
    )) as Array<{ id?: number; name?: string; phone?: string; tier_code?: string; point_balance?: number; lifetime_amount?: number }>
    return rows.map((row) => ({
      id: Number(row.id || 0),
      name: toText(row.name),
      phone: toText(row.phone),
      tierCode: toText(row.tier_code) || 'BRONZE',
      pointBalance: Number(row.point_balance || 0),
      lifetimeAmount: Number(row.lifetime_amount || 0),
    }))
  }
  if (params.segment === 'recent30') {
    const orderRows = (await supabaseSelectFilterAllPages(
      'pos_orders',
      `member_id=not.is.null&created_at=gte.${encodeURIComponent(recent30)}`,
      { order: 'created_at.desc', pageSize: 8000, maxRows: MEMBER_RECENT_ORDER_SCAN_MAX_ROWS, select: 'member_id' }
    )) as Array<{ member_id?: number }>
    const memberIds = Array.from(new Set(orderRows.map((x) => Number(x.member_id || 0)).filter((x) => x > 0))).slice(0, limit)
    if (!memberIds.length) return []
    const rows = (await supabaseSelectFilter('members', `id=in.(${memberIds.join(',')})`, { limit })) as Array<{
      id?: number
      name?: string
      phone?: string
      tier_code?: string
      point_balance?: number
      lifetime_amount?: number
    }>
    return rows.map((row) => ({
      id: Number(row.id || 0),
      name: toText(row.name),
      phone: toText(row.phone),
      tierCode: toText(row.tier_code) || 'BRONZE',
      pointBalance: Number(row.point_balance || 0),
      lifetimeAmount: Number(row.lifetime_amount || 0),
    }))
  }
  if (params.segment === 'atRisk') {
    const atRiskFilter = `and=(last_visited_at.gte.${encodeURIComponent(atRiskStart)},last_visited_at.lt.${encodeURIComponent(atRiskEnd)})`
    const atRiskRows = (await supabaseSelectFilter('members', atRiskFilter, { order: 'last_visited_at.asc', limit })) as Array<{
      id?: number
      name?: string
      phone?: string
      tier_code?: string
      point_balance?: number
      lifetime_amount?: number
    }>
    return atRiskRows.map((row) => ({
      id: Number(row.id || 0),
      name: toText(row.name),
      phone: toText(row.phone),
      tierCode: toText(row.tier_code) || 'BRONZE',
      pointBalance: Number(row.point_balance || 0),
      lifetimeAmount: Number(row.lifetime_amount || 0),
    }))
  }
  const dormantFilter = `or=(last_visited_at.is.null,last_visited_at.lt.${encodeURIComponent(dormant90)})`
  const dormantRows = (await supabaseSelectFilter('members', dormantFilter, { order: 'id.desc', limit })) as Array<{
    id?: number
    name?: string
    phone?: string
    tier_code?: string
    point_balance?: number
    lifetime_amount?: number
  }>
  return dormantRows.map((row) => ({
    id: Number(row.id || 0),
    name: toText(row.name),
    phone: toText(row.phone),
    tierCode: toText(row.tier_code) || 'BRONZE',
    pointBalance: Number(row.point_balance || 0),
    lifetimeAmount: Number(row.lifetime_amount || 0),
  }))
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

