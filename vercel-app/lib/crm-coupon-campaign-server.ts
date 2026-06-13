import {
  addBangkokCalendarDays,
  getBangkokDateTimeString,
  getBangkokTodayDateString,
} from '@/lib/bangkok-time'
import {
  supabaseInsert,
  supabaseSelectFilterAllPages,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

type CampaignRow = {
  id?: number
  campaign_key?: string | null
  name?: string | null
  description?: string | null
  status?: string | null
  trigger_type?: string | null
  audience_type?: string | null
  audience_payload?: Record<string, unknown> | null
  coupon_code?: string | null
  issue_limit?: number | null
  starts_at?: string | null
  ends_at?: string | null
  auto_schedule?: Record<string, unknown> | null
  created_by?: string | null
  updated_by?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type CampaignRunRow = {
  id?: number
  campaign_id?: number
  run_mode?: string | null
  run_reason?: string | null
  target_count?: number
  issued_count?: number
  skipped_count?: number
  failed_count?: number
  executed_by?: string | null
  executed_at?: string | null
}

type MemberRow = {
  id?: number
  tier_code?: string | null
  last_visited_at?: string | null
  birth_date?: string | null
  created_at?: string | null
  status?: string | null
}

type CouponRow = {
  id?: number
  code?: string | null
  valid_to?: string | null
  valid_from?: string | null
  is_active?: boolean | null
}

const CRM_CAMPAIGN_RECENT_ORDER_SCAN_MAX_ROWS = 1_000_000

function toText(v: unknown): string {
  return String(v ?? '').trim()
}

function toUpper(v: unknown): string {
  return toText(v).toUpperCase()
}

function toInt(v: unknown, fallback = 0): number {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) ? n : fallback
}

function parseJsonObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return {}
}

function mapCampaign(row: CampaignRow) {
  return {
    id: Number(row.id || 0),
    campaignKey: toText(row.campaign_key),
    name: toText(row.name),
    description: toText(row.description),
    status: toText(row.status) || 'draft',
    triggerType: toText(row.trigger_type) || 'manual',
    audienceType: toText(row.audience_type) || 'all',
    audiencePayload: parseJsonObject(row.audience_payload),
    couponCode: toUpper(row.coupon_code),
    issueLimit: Math.max(1, toInt(row.issue_limit, 200)),
    startsAt: toText(row.starts_at),
    endsAt: toText(row.ends_at),
    autoSchedule: parseJsonObject(row.auto_schedule),
    createdBy: toText(row.created_by),
    updatedBy: toText(row.updated_by),
    createdAt: toText(row.created_at),
    updatedAt: toText(row.updated_at),
  }
}

function parseIssueLimit(raw: unknown): number {
  return Math.max(1, Math.min(toInt(raw, 200), 2000))
}

function ensureCampaignTableError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  if (/crm_coupon_campaigns|crm_coupon_campaign_runs|crm_coupon_campaign_run_members/i.test(msg)) {
    return new Error(
      'CRM 쿠폰 캠페인 테이블이 없습니다. SQL 파일 `vercel-app/sql/crm_coupon_campaigns_phase1.sql`을 먼저 실행해 주세요.'
    )
  }
  return e instanceof Error ? e : new Error(msg || '캠페인 처리 중 오류가 발생했습니다.')
}

export async function listCrmCouponCampaigns(limit = 200) {
  try {
    const rows = (await supabaseSelectFilter('crm_coupon_campaigns', 'id=gt.0', {
      order: 'id.desc',
      limit: Math.max(1, Math.min(limit, 1000)),
    })) as CampaignRow[]
    return (rows || []).map(mapCampaign)
  } catch (e) {
    throw ensureCampaignTableError(e)
  }
}

export async function saveCrmCouponCampaign(params: {
  id?: number
  name: string
  description?: string
  status?: string
  triggerType?: string
  audienceType?: string
  audiencePayload?: Record<string, unknown>
  couponCode: string
  issueLimit?: number
  startsAt?: string | null
  endsAt?: string | null
  autoSchedule?: Record<string, unknown>
  actor?: string
}) {
  const now = getBangkokDateTimeString()
  const id = Number(params.id || 0) || null
  const name = toText(params.name)
  const couponCode = toUpper(params.couponCode)
  if (!name) throw new Error('캠페인 이름을 입력해 주세요.')
  if (!couponCode) throw new Error('쿠폰 코드를 입력해 주세요.')

  const couponRows = (await supabaseSelectFilter(
    'pos_coupons',
    `code=eq.${encodeURIComponent(couponCode)}`,
    { limit: 1 }
  )) as CouponRow[]
  const coupon = couponRows?.[0]
  if (!coupon?.id) {
    throw new Error(`POS 쿠폰 마스터에 ${couponCode} 코드가 없습니다.`)
  }

  const row = {
    name,
    description: toText(params.description) || null,
    status: toText(params.status) || 'draft',
    trigger_type: toText(params.triggerType) || 'manual',
    audience_type: toText(params.audienceType) || 'all',
    audience_payload: params.audiencePayload && typeof params.audiencePayload === 'object'
      ? params.audiencePayload
      : {},
    coupon_code: couponCode,
    issue_limit: parseIssueLimit(params.issueLimit),
    starts_at: toText(params.startsAt) || null,
    ends_at: toText(params.endsAt) || null,
    auto_schedule: params.autoSchedule && typeof params.autoSchedule === 'object'
      ? params.autoSchedule
      : {},
    updated_by: toText(params.actor) || null,
    updated_at: now,
  }

  try {
    if (id) {
      await supabaseUpdateByFilter('crm_coupon_campaigns', `id=eq.${id}`, row)
      return { success: true, id }
    }
    const inserted = (await supabaseInsert('crm_coupon_campaigns', {
      ...row,
      campaign_key: `CRM-${Date.now()}`,
      created_by: toText(params.actor) || null,
      created_at: now,
    })) as CampaignRow[]
    return { success: true, id: Number(inserted?.[0]?.id || 0) || null }
  } catch (e) {
    throw ensureCampaignTableError(e)
  }
}

async function resolveTargetMembers(campaign: ReturnType<typeof mapCampaign>): Promise<number[]> {
  const limit = Math.max(1, Math.min(campaign.issueLimit || 200, 2000))
  const audience = toText(campaign.audienceType)
  const payload = campaign.audiencePayload || {}
  if (audience === 'tier') {
    const tierCode = toUpper(payload.tierCode)
    if (!tierCode) return []
    const rows = (await supabaseSelectFilter(
      'members',
      `status=eq.active&tier_code=eq.${encodeURIComponent(tierCode)}`,
      { order: 'id.asc', limit, select: 'id' }
    )) as MemberRow[]
    return rows.map((r) => Number(r.id || 0)).filter((x) => x > 0)
  }
  if (audience === 'recent') {
    const days = Math.max(1, Math.min(toInt(payload.days, 30), 365))
    const recentStart = addBangkokCalendarDays(getBangkokTodayDateString(), -days)
    const rows = (await supabaseSelectFilterAllPages(
      'pos_orders',
      `member_id=not.is.null&created_at=gte.${encodeURIComponent(`${recentStart}T00:00:00`)}`,
      {
        order: 'created_at.desc',
        pageSize: 8000,
        maxRows: CRM_CAMPAIGN_RECENT_ORDER_SCAN_MAX_ROWS,
        select: 'member_id',
      }
    )) as Array<{ member_id?: number }>
    return Array.from(new Set(rows.map((x) => Number(x.member_id || 0)).filter((x) => x > 0))).slice(0, limit)
  }
  if (audience === 'dormant') {
    const days = Math.max(1, Math.min(toInt(payload.days, 90), 720))
    const base = addBangkokCalendarDays(getBangkokTodayDateString(), -days)
    const rows = (await supabaseSelectFilter(
      'members',
      `status=eq.active&or=(last_visited_at.is.null,last_visited_at.lt.${encodeURIComponent(`${base}T00:00:00`)})`,
      { order: 'id.asc', limit, select: 'id' }
    )) as MemberRow[]
    return rows.map((r) => Number(r.id || 0)).filter((x) => x > 0)
  }
  if (audience === 'birthday_month') {
    const monthNum = Math.max(1, Math.min(toInt(payload.month, Number(getBangkokTodayDateString().slice(5, 7))), 12))
    const month = String(monthNum).padStart(2, '0')
    const rows = (await supabaseSelectFilter(
      'members',
      `status=eq.active&birth_date=like.%25-${month}-%25`,
      { order: 'id.asc', limit, select: 'id' }
    )) as MemberRow[]
    return rows.map((r) => Number(r.id || 0)).filter((x) => x > 0)
  }
  if (audience === 'new_joined') {
    const days = Math.max(1, Math.min(toInt(payload.days, 30), 365))
    const start = addBangkokCalendarDays(getBangkokTodayDateString(), -days)
    const rows = (await supabaseSelectFilter(
      'members',
      `status=eq.active&created_at=gte.${encodeURIComponent(`${start}T00:00:00`)}`,
      { order: 'id.asc', limit, select: 'id' }
    )) as MemberRow[]
    return rows.map((r) => Number(r.id || 0)).filter((x) => x > 0)
  }
  const rows = (await supabaseSelectFilter(
    'members',
    'status=eq.active',
    { order: 'id.asc', limit, select: 'id' }
  )) as MemberRow[]
  return rows.map((r) => Number(r.id || 0)).filter((x) => x > 0)
}

function computeIssueExpiry(campaign: ReturnType<typeof mapCampaign>, coupon: CouponRow | null): string | null {
  const campaignEndsAt = toText(campaign.endsAt)
  const couponValidTo = toText(coupon?.valid_to)
  if (!campaignEndsAt && !couponValidTo) return null
  if (!campaignEndsAt) return couponValidTo || null
  if (!couponValidTo) return campaignEndsAt || null
  return campaignEndsAt < couponValidTo ? campaignEndsAt : couponValidTo
}

export async function previewCampaignAudience(params: {
  audienceType?: string
  audiencePayload?: Record<string, unknown>
  issueLimit?: number
}): Promise<{ count: number; capped: number }> {
  const campaign = {
    audienceType: toText(params.audienceType) || 'all',
    audiencePayload: params.audiencePayload && typeof params.audiencePayload === 'object' ? params.audiencePayload : {},
    issueLimit: parseIssueLimit(params.issueLimit),
  } as ReturnType<typeof mapCampaign>
  const ids = await resolveTargetMembers(campaign)
  return { count: ids.length, capped: campaign.issueLimit }
}

export async function runCrmCouponCampaign(params: {
  campaignId: number
  runMode?: 'manual' | 'auto' | 'retry'
  actor?: string
  reason?: string
}) {
  const campaignId = Number(params.campaignId || 0)
  if (!campaignId) throw new Error('campaignId가 필요합니다.')
  try {
    const campaignRows = (await supabaseSelectFilter(
      'crm_coupon_campaigns',
      `id=eq.${campaignId}`,
      { limit: 1 }
    )) as CampaignRow[]
    const campaignRaw = campaignRows?.[0]
    if (!campaignRaw?.id) throw new Error('캠페인을 찾을 수 없습니다.')
    const campaign = mapCampaign(campaignRaw)
    if (campaign.status === 'archived') throw new Error('보관(archived) 상태 캠페인은 실행할 수 없습니다.')
    if (!campaign.couponCode) throw new Error('캠페인 쿠폰 코드가 비어 있습니다.')

    const couponRows = (await supabaseSelectFilter(
      'pos_coupons',
      `code=eq.${encodeURIComponent(campaign.couponCode)}`,
      { limit: 1 }
    )) as CouponRow[]
    const coupon = couponRows?.[0] ?? null
    if (!coupon?.id || coupon.is_active === false) {
      throw new Error('연결된 POS 쿠폰이 없거나 비활성 상태입니다.')
    }

    const targetMemberIds = await resolveTargetMembers(campaign)
    const runRows = (await supabaseInsert('crm_coupon_campaign_runs', {
      campaign_id: campaignId,
      run_mode: toText(params.runMode) || 'manual',
      run_reason: toText(params.reason) || null,
      target_count: targetMemberIds.length,
      issued_count: 0,
      skipped_count: 0,
      failed_count: 0,
      executed_by: toText(params.actor) || null,
      executed_at: getBangkokDateTimeString(),
    })) as CampaignRunRow[]
    const runId = Number(runRows?.[0]?.id || 0)
    if (!runId) throw new Error('캠페인 실행 이력 저장에 실패했습니다.')

    let issuedCount = 0
    let skippedCount = 0
    let failedCount = 0
    const expiresAt = computeIssueExpiry(campaign, coupon)
    for (const memberId of targetMemberIds) {
      try {
        const duplicate = (await supabaseSelectFilter(
          'member_coupon_issues',
          `member_id=eq.${memberId}&coupon_code=eq.${encodeURIComponent(campaign.couponCode)}&campaign_id=eq.${campaignId}&status=eq.issued`,
          { limit: 1, select: 'id' }
        )) as Array<{ id?: number }>
        if (duplicate?.length) {
          skippedCount += 1
          await supabaseInsert('crm_coupon_campaign_run_members', {
            run_id: runId,
            campaign_id: campaignId,
            member_id: memberId,
            status: 'skipped',
            reason: 'already_issued',
          })
          continue
        }

        const issueRows = (await supabaseInsert('member_coupon_issues', {
          member_id: memberId,
          coupon_code: campaign.couponCode,
          campaign_id: campaignId,
          issued_at: getBangkokDateTimeString(),
          status: 'issued',
          expires_at: expiresAt,
          issued_store_scope: null,
        })) as Array<{ id?: number }>
        issuedCount += 1
        await supabaseInsert('crm_coupon_campaign_run_members', {
          run_id: runId,
          campaign_id: campaignId,
          member_id: memberId,
          status: 'issued',
          reason: null,
          member_coupon_issue_id: Number(issueRows?.[0]?.id || 0) || null,
        })
      } catch (issueError) {
        failedCount += 1
        await supabaseInsert('crm_coupon_campaign_run_members', {
          run_id: runId,
          campaign_id: campaignId,
          member_id: memberId,
          status: 'failed',
          reason: (issueError instanceof Error ? issueError.message : String(issueError || 'issue_failed')).slice(0, 240),
        })
      }
    }

    await supabaseUpdateByFilter('crm_coupon_campaign_runs', `id=eq.${runId}`, {
      issued_count: issuedCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
    })

    if (campaign.status === 'draft') {
      await supabaseUpdateByFilter('crm_coupon_campaigns', `id=eq.${campaignId}`, {
        status: 'active',
        updated_at: getBangkokDateTimeString(),
        updated_by: toText(params.actor) || null,
      })
    }

    return {
      success: true,
      runId,
      campaignId,
      targetCount: targetMemberIds.length,
      issuedCount,
      skippedCount,
      failedCount,
    }
  } catch (e) {
    throw ensureCampaignTableError(e)
  }
}

export async function getCrmCouponCampaignResults(campaignId: number, limit = 20) {
  const id = Number(campaignId || 0)
  if (!id) throw new Error('campaignId가 필요합니다.')
  try {
    const campaignRows = (await supabaseSelectFilter('crm_coupon_campaigns', `id=eq.${id}`, {
      limit: 1,
    })) as CampaignRow[]
    const campaign = campaignRows?.[0] ? mapCampaign(campaignRows[0]) : null
    const runRows = (await supabaseSelectFilter('crm_coupon_campaign_runs', `campaign_id=eq.${id}`, {
      order: 'id.desc',
      limit: Math.max(1, Math.min(limit, 200)),
    })) as CampaignRunRow[]
    return {
      campaign,
      runs: (runRows || []).map((row) => ({
        id: Number(row.id || 0),
        runMode: toText(row.run_mode),
        runReason: toText(row.run_reason),
        targetCount: Number(row.target_count || 0),
        issuedCount: Number(row.issued_count || 0),
        skippedCount: Number(row.skipped_count || 0),
        failedCount: Number(row.failed_count || 0),
        executedBy: toText(row.executed_by),
        executedAt: toText(row.executed_at),
      })),
    }
  } catch (e) {
    throw ensureCampaignTableError(e)
  }
}

