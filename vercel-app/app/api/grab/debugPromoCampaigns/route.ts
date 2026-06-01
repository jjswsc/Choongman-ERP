import { NextRequest, NextResponse } from 'next/server'
import { bangkokDateStrISO } from '@/lib/bangkok-date'
import { listGrabManagedPromoCampaigns, loadGrabPromoCutPriceByPromoId } from '@/lib/grab-promo-target-price-campaign'
import { supabaseSelectAllPages } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type PromoRow = { id?: number; valid_from?: string | null; valid_to?: string | null; name?: string }

/** Grab 캠페인·ERP 프로모 기간 진단 — 테스트 화면 ‘오늘/내일’ 미리보기용 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const url = new URL(req.url)
    const merchantID = String(url.searchParams.get('merchantID') || 'GFSBPOS-811-087').trim()
    const todayBkk = bangkokDateStrISO()

    const [grabCampaigns, promoRows, cutByPromoId] = await Promise.all([
      listGrabManagedPromoCampaigns(merchantID),
      supabaseSelectAllPages('pos_promos', {
        select: 'id,name,valid_from,valid_to',
        pageSize: 500,
        order: 'id.asc',
      }).catch(() => []) as Promise<PromoRow[]>,
      loadGrabPromoCutPriceByPromoId().catch(() => new Map()),
    ])

    const erpPromoSchedule = (promoRows || [])
      .filter((p) => cutByPromoId.has(Number(p.id ?? 0)))
      .map((p) => ({
        promoId: p.id,
        name: p.name,
        validFrom: p.valid_from ? String(p.valid_from).slice(0, 10) : null,
        validTo: p.valid_to ? String(p.valid_to).slice(0, 10) : null,
        cut: cutByPromoId.get(Number(p.id ?? 0)),
      }))

    return NextResponse.json(
      {
        success: true,
        merchantID,
        todayBkk,
        grabCampaignCount: grabCampaigns.length,
        grabCampaigns,
        erpPromoSchedule,
        hint:
          grabCampaigns.length === 0
            ? 'Grab CM-POS-PROMO 캠페인 0개 — force sync 실패로 삭제만 된 상태일 수 있음. 배포 후 forcePromoCampaignResync 재실행.'
            : 'Grab 테스트 화면: 캠페인 startTimeBkk 날짜와 선택 날짜가 같을 때 프로모·컷프라이스 표시.',
      },
      { headers }
    )
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
