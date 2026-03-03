import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

function parseNum(val: unknown): number {
  if (val == null || val === '') return 0
  const n = typeof val === 'number' ? val : parseFloat(String(val))
  return Number.isNaN(n) ? 0 : n
}

function parseDate(val: unknown): string | null {
  if (val == null || val === '') return null
  const s = String(val).trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function parseBranches(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((x) => typeof x === 'string').map(String)
  if (typeof val === 'string') {
    const s = val.trim()
    if (!s) return []
    return s.split(/[\n,;]/).map((x) => x.trim()).filter(Boolean)
  }
  return []
}

/** 마케팅 캠페인 목록 조회 (또는 id로 단건) */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')?.trim()

    if (id) {
      const rows = (await supabaseSelectFilter(
        'marketing_campaigns',
        `id=eq.${encodeURIComponent(id)}`,
        { limit: 1 }
      )) as Record<string, unknown>[] | null
      const row = rows?.[0]
      if (!row) {
        return NextResponse.json(null, { headers })
      }
      const campaign = {
        id: String(row.id ?? ''),
        topic: String(row.topic ?? ''),
        format: String(row.format ?? ''),
        status: String(row.status ?? 'draft'),
        detail: String(row.detail ?? ''),
        startDate: row.start_date ? parseDate(row.start_date) : null,
        endDate: row.end_date ? parseDate(row.end_date) : null,
        branches: Array.isArray(row.branches) ? row.branches : (row.branches && typeof row.branches === 'object' ? Object.values(row.branches) : []),
        discountType: String(row.discount_type ?? 'percent'),
        discountValue: parseNum(row.discount_value),
        discountPricePromotion: String(row.discount_price_promotion ?? ''),
        costAdsOnline: parseNum(row.cost_ads_online),
        costAdsOffline: parseNum(row.cost_ads_offline),
        costProduction: parseNum(row.cost_production),
        costFood: parseNum(row.cost_food),
        costInfluencer: parseNum(row.cost_influencer),
        budgetTotal: parseNum(row.budget_total),
        kpiTarget: parseNum(row.kpi_target),
        kpiUnit: String(row.kpi_unit ?? 'order'),
        campaignPerformance: String(row.campaign_performance ?? ''),
        conclusion: String(row.conclusion ?? ''),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
      return NextResponse.json(campaign, { headers })
    }

    const rows = (await supabaseSelect('marketing_campaigns', {
      order: 'start_date.desc,id.desc',
      limit: 500,
    })) as Record<string, unknown>[] | null

    const list = (rows || []).map((row) => ({
      id: String(row.id ?? ''),
      topic: String(row.topic ?? ''),
      format: String(row.format ?? ''),
      status: String(row.status ?? 'draft'),
      startDate: row.start_date ? parseDate(row.start_date) : null,
      endDate: row.end_date ? parseDate(row.end_date) : null,
      branches: Array.isArray(row.branches) ? row.branches : [],
      kpiTarget: parseNum(row.kpi_target),
      kpiUnit: String(row.kpi_unit ?? 'order'),
      budgetTotal: parseNum(row.budget_total),
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('marketingCampaigns GET:', e)
    return NextResponse.json([], { headers })
  }
}

/** 마케팅 캠페인 저장 (등록/수정) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as {
      id?: string
      topic?: string
      format?: string
      status?: string
      detail?: string
      startDate?: string | null
      endDate?: string | null
      branches?: string[]
      discountType?: string
      discountValue?: number
      discountPricePromotion?: string
      costAdsOnline?: number
      costAdsOffline?: number
      costProduction?: number
      costFood?: number
      costInfluencer?: number
      budgetTotal?: number
      kpiTarget?: number
      kpiUnit?: string
      campaignPerformance?: string
      conclusion?: string
    }

    const topic = String(body.topic ?? '').trim()
    const editingId = body.id ? String(body.id).trim() : null

    if (!topic) {
      return NextResponse.json(
        { success: false, message: '캠페인 제목이 필요합니다.' },
        { headers }
      )
    }

    const branches = Array.isArray(body.branches) ? body.branches : parseBranches(body.branches)

    const row = {
      topic,
      format: String(body.format ?? '').trim(),
      status: String(body.status ?? 'draft').trim(),
      detail: String(body.detail ?? '').trim(),
      start_date: body.startDate ? parseDate(body.startDate) : null,
      end_date: body.endDate ? parseDate(body.endDate) : null,
      branches: branches,
      discount_type: String(body.discountType ?? 'percent').trim(),
      discount_value: parseNum(body.discountValue),
      discount_price_promotion: String(body.discountPricePromotion ?? '').trim(),
      cost_ads_online: parseNum(body.costAdsOnline),
      cost_ads_offline: parseNum(body.costAdsOffline),
      cost_production: parseNum(body.costProduction),
      cost_food: parseNum(body.costFood),
      cost_influencer: parseNum(body.costInfluencer),
      budget_total: parseNum(body.budgetTotal),
      kpi_target: parseNum(body.kpiTarget),
      kpi_unit: String(body.kpiUnit ?? 'order').trim(),
      campaign_performance: String(body.campaignPerformance ?? '').trim(),
      conclusion: String(body.conclusion ?? '').trim(),
      updated_at: new Date().toISOString(),
    }

    if (editingId) {
      const existing = (await supabaseSelectFilter(
        'marketing_campaigns',
        `id=eq.${encodeURIComponent(editingId)}`,
        { limit: 1 }
      )) as { id?: number }[] | null
      if (existing && existing.length > 0) {
        await supabaseUpdateByFilter('marketing_campaigns', `id=eq.${editingId}`, row)
        return NextResponse.json({ success: true, message: '수정되었습니다.', id: editingId }, { headers })
      }
    }

    const inserted = (await supabaseInsert('marketing_campaigns', row)) as { id?: number }[]
    const created = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = created?.id

    return NextResponse.json({ success: true, message: '저장되었습니다.', id: newId ? String(newId) : null }, { headers })
  } catch (e) {
    console.error('marketingCampaigns POST:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}
