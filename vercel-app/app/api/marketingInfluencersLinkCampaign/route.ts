/**
 * 업로드 기록(marketing_influencers) 여러 건에 캠페인을 일괄 연결·해제.
 * body: { ids: string[], campaignId: string | null }
 * 연결된 지급예정이 planned 상태면 메모도 캠페인 기준으로 갱신.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'
import {
  fetchCampaignMetaForExpenseMemo,
  relinkMarketingExpenseAccrualMemo,
} from '@/lib/marketing-expense-accrual-sync'

const TABLE = 'marketing_influencers'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  const tenantError = assertSaasTenantWritable(tenantScope, { tableHint: TABLE, label: '마케팅 인플루언서' })
  if (tenantError) return NextResponse.json({ success: false, message: tenantError }, { status: 403, headers })

  try {
    const body = (await req.json()) as { ids?: unknown; campaignId?: unknown }
    const ids = (Array.isArray(body.ids) ? body.ids : [])
      .map((x) => String(x ?? '').trim())
      .filter((x) => /^\d+$/.test(x))
    const campaignId = String(body.campaignId ?? '').trim()
    if (ids.length === 0) {
      return NextResponse.json({ success: false, message: '연결할 업로드 기록을 선택해 주세요.' }, { headers })
    }
    if (ids.length > 500) {
      return NextResponse.json({ success: false, message: '한 번에 최대 500건까지 연결할 수 있습니다.' }, { headers })
    }
    if (campaignId && !/^\d+$/.test(campaignId)) {
      return NextResponse.json({ success: false, message: '캠페인 ID가 올바르지 않습니다.' }, { headers })
    }

    const camp = campaignId ? await fetchCampaignMetaForExpenseMemo(campaignId) : null
    if (campaignId && !camp) {
      return NextResponse.json({ success: false, message: '캠페인을 찾을 수 없습니다.' }, { headers })
    }

    const idFilter = appendSaasTenantFilter(`id=in.(${ids.join(',')})`, tenantScope, TABLE)
    const rows = (await supabaseSelectFilter(TABLE, idFilter, {
      select: 'id,name,contact_name,expense_accrual_id',
      limit: ids.length,
    })) as { id?: number; name?: string; contact_name?: string; expense_accrual_id?: number | null }[]

    await supabaseUpdateByFilter(TABLE, idFilter, { campaign_id: campaignId ? Number(campaignId) : null })

    let memoUpdated = 0
    for (const r of rows || []) {
      const accrualId = Number(r.expense_accrual_id || 0)
      if (!(accrualId > 0)) continue
      const detailLine = [r.contact_name, r.name].map((x) => String(x || '').trim()).filter(Boolean).join(' · ')
      try {
        const ok = await relinkMarketingExpenseAccrualMemo({
          expenseAccrualId: accrualId,
          channel: 'influencer',
          campaignId,
          campaignNo: camp?.campaignNo || '',
          campaignTopic: camp?.topic || '',
          detailLine,
        })
        if (ok) memoUpdated++
      } catch (e) {
        console.warn('marketingInfluencersLinkCampaign memo:', e)
      }
    }

    return NextResponse.json(
      {
        success: true,
        updated: rows?.length ?? 0,
        memoUpdated,
        message: campaignId
          ? `${rows?.length ?? 0}건을 캠페인에 연결했습니다.`
          : `${rows?.length ?? 0}건의 캠페인 연결을 해제했습니다.`,
      },
      { headers }
    )
  } catch (e) {
    console.error('marketingInfluencersLinkCampaign:', e)
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '연결 실패' }, { headers })
  }
}
