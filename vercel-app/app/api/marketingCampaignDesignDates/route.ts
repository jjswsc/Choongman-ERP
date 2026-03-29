import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

function parseDate(val: unknown): string | null {
  if (val == null || val === '') return null
  const s = String(val).trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** 캠페인 준비(디자인) 기간만 부분 갱신 — 허브 하위 폼에서 전체 캠페인 저장 없이 반영 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as {
      campaignId?: string
      designStartDate?: string | null
      designEndDate?: string | null
    }
    const campaignId = String(body.campaignId ?? '').trim()
    if (!campaignId) {
      return NextResponse.json({ success: false, message: 'campaignId가 필요합니다.' }, { headers })
    }

    const existing = (await supabaseSelectFilter(
      'marketing_campaigns',
      `id=eq.${encodeURIComponent(campaignId)}`,
      { limit: 1 }
    )) as { id?: number }[] | null
    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '캠페인을 찾을 수 없습니다.' }, { headers })
    }

    await supabaseUpdateByFilter('marketing_campaigns', `id=eq.${encodeURIComponent(campaignId)}`, {
      design_start_date: body.designStartDate != null ? parseDate(body.designStartDate) : null,
      design_end_date: body.designEndDate != null ? parseDate(body.designEndDate) : null,
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, message: '준비 일정이 반영되었습니다.' }, { headers })
  } catch (e) {
    console.error('marketingCampaignDesignDates POST:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}
