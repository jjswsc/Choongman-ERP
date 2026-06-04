import { NextRequest, NextResponse } from 'next/server'
import { bangkokDateStrISO } from '@/lib/bangkok-date'
import { listGrabManagedPromoCampaigns, loadGrabPromoCutPriceByPromoId } from '@/lib/grab-promo-target-price-campaign'
import { resolveGrabMenuNotificationMerchantIDs } from '@/lib/grab-resolve-menu-notification-merchants'
import { supabaseSelectAllPages } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type PromoRow = { id?: number; valid_from?: string | null; valid_to?: string | null; name?: string }

type GrabCampaignWithMerchant = Awaited<ReturnType<typeof listGrabManagedPromoCampaigns>>[number] & {
  merchantID: string
}

/**
 * Grab 캠페인·ERP 프로모 기간 진단 — 테스트 화면 ‘오늘/내일’ 미리보기용.
 * `storeCode`(ERP 매장코드/표시명)를 주면 `GFSBPOS-…` merchantID를 자동 해석해 매장별 캠페인을 모아 보여준다.
 * `merchantID`를 직접 줄 수도 있다(미지정 시 기본 GFSBPOS-811-087).
 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const url = new URL(req.url)
    const storeCode = String(url.searchParams.get('storeCode') || '').trim()
    const merchantIDParam = String(url.searchParams.get('merchantID') || '').trim()
    const todayBkk = bangkokDateStrISO()

    let merchantIDs: string[] = []
    let resolvedFrom: 'storeCode' | 'merchantID' | 'default' = 'default'
    if (storeCode) {
      merchantIDs = resolveGrabMenuNotificationMerchantIDs(storeCode)
      resolvedFrom = 'storeCode'
    } else if (merchantIDParam) {
      merchantIDs = resolveGrabMenuNotificationMerchantIDs(merchantIDParam)
      if (merchantIDs.length === 0) merchantIDs = [merchantIDParam]
      resolvedFrom = 'merchantID'
    } else {
      merchantIDs = ['GFSBPOS-811-087']
      resolvedFrom = 'default'
    }

    if (merchantIDs.length === 0) {
      return NextResponse.json(
        {
          success: true,
          storeCode,
          resolvedFrom,
          resolvedMerchantIDs: [],
          todayBkk,
          grabCampaignCount: 0,
          grabCampaigns: [],
          erpPromoSchedule: [],
          hint:
            'Grab merchantID(GFSBPOS-…)를 해석하지 못했습니다. GRAB_STORE_MAP_JSON·GRAB_PORTAL_MERCHANT_MAP 환경변수에 이 매장이 연결돼 있는지 확인하세요.',
        },
        { headers }
      )
    }

    const [campaignsByMerchant, promoRows, cutByPromoId] = await Promise.all([
      Promise.all(
        merchantIDs.map(async (id) => {
          try {
            const rows = await listGrabManagedPromoCampaigns(id)
            return rows.map((r) => ({ ...r, merchantID: id }) as GrabCampaignWithMerchant)
          } catch (e) {
            console.warn('[debugPromoCampaigns] list_failed', { merchantID: id, error: String(e) })
            return [] as GrabCampaignWithMerchant[]
          }
        })
      ),
      supabaseSelectAllPages('pos_promos', {
        select: 'id,name,valid_from,valid_to',
        pageSize: 500,
        order: 'id.asc',
      }).catch(() => []) as Promise<PromoRow[]>,
      loadGrabPromoCutPriceByPromoId().catch(() => new Map()),
    ])

    const grabCampaigns = campaignsByMerchant.flat()

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
        storeCode,
        resolvedFrom,
        resolvedMerchantIDs: merchantIDs,
        todayBkk,
        grabCampaignCount: grabCampaigns.length,
        grabCampaigns,
        erpPromoSchedule,
        hint:
          grabCampaigns.length === 0
            ? 'Grab CM-POS-PROMO 캠페인 0개 — 현재 이 매장에 살아있는 프로모션 캠페인이 없습니다(force sync 실패로 삭제만 된 상태일 수 있음). 배포 후 forcePromoCampaignResync 재실행.'
            : 'Grab 테스트 화면: 캠페인 startTimeBkk 날짜와 선택 날짜가 같을 때 프로모·컷프라이스 표시. id가 Grab에 전달할 Campaign ID.',
      },
      { headers }
    )
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
