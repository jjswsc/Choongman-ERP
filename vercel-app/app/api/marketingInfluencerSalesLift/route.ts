/**
 * 인플루언서 업로드 매출 효과 — 업로드일 기준 협업 매장의 전 N일 vs 후 N일
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD(업로드일 범위)&window=7|14|30&store=&campaignId=&unlinked=1&profileId=
 * 매출은 get_pos_sales_analytics_agg(영업일 기준) 매장별 일 집계, 매장당 RPC 1회.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  isSaasTenantQueryBlocked,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { resolvePosSalesStoresForAuth } from '@/lib/pos-sales-request-scope'
import { storeMatches } from '@/lib/admin-employee-store-access'
import {
  isPosSalesAnalyticsRpcTimeoutError,
  tryFetchPosSalesAnalyticsAgg,
} from '@/lib/pos-sales-analytics-rpc-server'
import {
  addDaysYmd,
  computeSalesLift,
  detectSalesLiftOverlaps,
  diffDaysYmd,
  influencerPostCost,
  normalizeSalesLiftWindow,
  type DailyStoreSales,
  type InfluencerSalesLiftRow,
} from '@/lib/marketing-influencer-sales-lift'

export const maxDuration = 60

const TABLE = 'marketing_influencers'
const MAX_RANGE_DAYS = 400

function ymd(v: unknown): string {
  const s = String(v ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const auth = authResult.auth
  const tenantScope = await resolveSaasTenantScope({ auth })
  if (isSaasTenantQueryBlocked(tenantScope, TABLE)) {
    return NextResponse.json({ success: true, rows: [], windowDays: 7 }, { headers })
  }

  const { searchParams } = new URL(req.url)
  const todayYmd = getBangkokTodayDateString()
  const windowDays = normalizeSalesLiftWindow(searchParams.get('window'))
  const to = ymd(searchParams.get('to')) || todayYmd
  const from = ymd(searchParams.get('from')) || addDaysYmd(to, -90)
  if (from > to) {
    return NextResponse.json({ success: false, message: '시작일이 종료일보다 늦습니다.' }, { headers })
  }
  if (diffDaysYmd(to, from) > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { success: false, message: `업로드일 조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.` },
      { headers }
    )
  }
  const storeFilter = String(searchParams.get('store') ?? '').trim()
  const campaignId = String(searchParams.get('campaignId') ?? '').trim()
  const unlinked = searchParams.get('unlinked') === '1'
  const profileId = String(searchParams.get('profileId') ?? '').trim()

  try {
    const parts = [`publish_date=gte.${from}`, `publish_date=lte.${to}`]
    if (storeFilter) parts.push(`branch_review=eq.${encodeURIComponent(storeFilter)}`)
    if (/^\d+$/.test(profileId)) parts.push(`profile_id=eq.${profileId}`)
    if (campaignId) parts.push(`campaign_id=eq.${encodeURIComponent(campaignId)}`)
    else if (unlinked) parts.push('campaign_id=is.null')

    const posts = ((await supabaseSelectFilter(TABLE, appendSaasTenantFilter(parts.join('&'), tenantScope, TABLE), {
      order: 'publish_date.desc,id.desc',
      limit: 2000,
    })) || []) as Record<string, unknown>[]

    const base = posts
      .map((p) => ({
        id: String(p.id ?? ''),
        profileId: p.profile_id != null ? String(p.profile_id) : null,
        campaignId: p.campaign_id != null ? String(p.campaign_id) : null,
        name: String(p.name ?? ''),
        contactName: String(p.contact_name ?? ''),
        store: String(p.branch_review ?? '').trim(),
        publishDate: ymd(p.publish_date),
        actualCost: num(p.actual_cost),
        cost: influencerPostCost({
          actualCost: num(p.actual_cost),
          providedMenus: Array.isArray(p.provided_menus)
            ? (p.provided_menus as { price?: number; quantity?: number }[])
            : [],
        }),
      }))
      .filter((p) => p.store && p.publishDate)

    const overlaps = detectSalesLiftOverlaps(
      base.map((p) => ({ id: p.id, store: p.store, publishYmd: p.publishDate })),
      windowDays
    )

    const yesterday = addDaysYmd(todayYmd, -1)
    const byStore = new Map<string, typeof base>()
    for (const p of base) {
      const list = byStore.get(p.store) || []
      list.push(p)
      byStore.set(p.store, list)
    }

    const dailyByStore = new Map<string, Map<string, DailyStoreSales> | null>()
    let timedOut = false
    for (const [store, list] of byStore) {
      const scoped = resolvePosSalesStoresForAuth(auth, [store])
      if (scoped.length !== 1 || !storeMatches(scoped[0]!, store)) {
        dailyByStore.set(store, null)
        continue
      }
      const minPublish = list.reduce((m, p) => (p.publishDate < m ? p.publishDate : m), list[0]!.publishDate)
      const maxPublish = list.reduce((m, p) => (p.publishDate > m ? p.publishDate : m), list[0]!.publishDate)
      const startStr = addDaysYmd(minPublish, -windowDays)
      const endCandidate = addDaysYmd(maxPublish, windowDays - 1)
      const endStr = endCandidate < yesterday ? endCandidate : yesterday
      if (endStr < startStr) {
        dailyByStore.set(store, new Map())
        continue
      }
      try {
        const rows = await tryFetchPosSalesAnalyticsAgg({
          request: req,
          startStr,
          endStr,
          storeCodes: [store],
          aggMode: 'period',
          periodGroup: 'day',
        })
        if (!rows) {
          dailyByStore.set(store, null)
          continue
        }
        const m = new Map<string, DailyStoreSales>()
        for (const r of rows) {
          const k = String(r.bucket_key ?? '').trim()
          if (!k) continue
          m.set(k, { sales: num(r.total), orders: Math.max(0, Math.trunc(num(r.order_count))) })
        }
        dailyByStore.set(store, m)
      } catch (e) {
        if (isPosSalesAnalyticsRpcTimeoutError(e)) timedOut = true
        dailyByStore.set(store, null)
      }
    }

    const rows: InfluencerSalesLiftRow[] = base.map((p) => {
      const daily = dailyByStore.get(p.store)
      return {
        id: p.id,
        profileId: p.profileId,
        campaignId: p.campaignId,
        name: p.name,
        contactName: p.contactName,
        store: p.store,
        publishDate: p.publishDate,
        actualCost: p.actualCost,
        unavailable: daily == null,
        lift: daily
          ? computeSalesLift({
              publishYmd: p.publishDate,
              windowDays,
              todayYmd,
              daily,
              cost: p.cost,
              overlap: overlaps.has(p.id),
            })
          : null,
      }
    })

    return NextResponse.json(
      { success: true, rows, windowDays, from, to, todayYmd, timedOut, skippedNoStoreOrDate: posts.length - base.length },
      { headers }
    )
  } catch (e) {
    console.error('marketingInfluencerSalesLift:', e)
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '조회 실패' }, { headers })
  }
}
