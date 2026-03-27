import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

function toErr(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (
    raw.includes('42501') ||
    (raw.includes('PGRST') && raw.includes('row-level security')) ||
    /row-level security policy/i.test(raw)
  ) {
    return 'Supabase RLS로 저장이 거부되었습니다. Vercel에 SUPABASE_SERVICE_ROLE_KEY를 설정하거나 RLS 정책을 확인하세요.'
  }
  return raw
}

/** 협업 관리 전용 collab_detail JSON만 갱신 (캠페인 본문은 건드리지 않음) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as {
      campaignId?: string
      collabDetail?: Record<string, unknown> | null
    }
    const campaignId = String(body.campaignId ?? '').trim()
    if (!campaignId) {
      return NextResponse.json({ success: false, message: 'campaignId가 필요합니다.' }, { headers })
    }

    const rows = (await supabaseSelectFilter(
      'marketing_campaigns',
      `id=eq.${encodeURIComponent(campaignId)}`,
      { limit: 1 }
    )) as { id?: number; collab_management?: boolean }[] | null

    if (!rows?.length) {
      return NextResponse.json({ success: false, message: '캠페인을 찾을 수 없습니다.' }, { headers })
    }

    if (rows[0].collab_management !== true) {
      return NextResponse.json(
        { success: false, message: '「협업 관리 목록에 포함」된 캠페인만 여기서 저장할 수 있습니다.' },
        { headers }
      )
    }

    const collabDetail =
      body.collabDetail && typeof body.collabDetail === 'object' && !Array.isArray(body.collabDetail)
        ? body.collabDetail
        : {}

    await supabaseUpdateByFilter('marketing_campaigns', `id=eq.${campaignId}`, {
      collab_detail: collabDetail,
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, message: '협업 상세가 저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('marketingCampaignCollabDetail POST:', e)
    return NextResponse.json({ success: false, message: toErr(e) || '저장 실패' }, { headers })
  }
}
