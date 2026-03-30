import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

/** 협업 관리 목록 포함 여부만 갱신 (캠페인 허브 전체 저장 없이) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as { campaignId?: string; enabled?: boolean }
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
      collab_management: body.enabled === true,
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, message: '반영되었습니다.' }, { headers })
  } catch (e) {
    console.error('marketingCampaignCollabManagementToggle:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}
