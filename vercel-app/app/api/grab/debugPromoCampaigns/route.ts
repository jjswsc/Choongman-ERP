import { NextRequest, NextResponse } from 'next/server'
import { bangkokDateStrISO } from '@/lib/bangkok-date'
import {
  buildGrabPromoCampaignName,
  isGrabPromoConsumerListPriceAsSaleEnabled,
  listGrabManagedPromoCampaigns,
  listGrabPromoCutPriceTargets,
  shouldSuppressGrabPromoCampaignsForConsumerSale,
} from '@/lib/grab-promo-target-price-campaign'
import {
  resolveGrabMenuNotificationMerchantIDs,
  resolveGrabMenuNotificationMerchantIDsForStore,
} from '@/lib/grab-resolve-menu-notification-merchants'

export const dynamic = 'force-dynamic'

type GrabCampaignWithMerchant = Awaited<ReturnType<typeof listGrabManagedPromoCampaigns>>[number] & {
  merchantID: string
}

function buildHint(params: {
  grabCampaignCount: number
  campaignsSuppressed: boolean
  erpPromoCount: number
}): string {
  if (params.grabCampaignCount > 0) {
    return 'Grab 테스트 화면: 캠페인 startTimeBkk 날짜와 선택 날짜가 같을 때 프로모·컷프라이스 표시. id가 Grab에 전달할 Campaign ID.'
  }
  if (params.campaignsSuppressed) {
    return (
      '현재 Grab Partner Campaign(CM-POS-PROMO)은 사용하지 않고, 메뉴 가격(Menu API·item.price)만 동기화합니다. ' +
      'Grab에 Campaign ID가 없는 것이 정상입니다. 아래 ERP 프로모·Grab 메뉴 item ID를 전달하세요. ' +
      '(캠페인 API를 다시 쓰려면 GRAB_PROMO_SUPPRESS_CAMPAIGNS_FOR_CONSUMER_SALE=0 후 메뉴 알림+forcePromoCampaignResync)'
    )
  }
  if (params.erpPromoCount > 0) {
    return (
      'Grab에 CM-POS-PROMO 캠페인이 0개입니다. ERP에는 프로모가 있으나 캠페인 생성·동기화가 안 된 상태일 수 있습니다. ' +
      'POST /api/grab/updateMenuNotification body에 forcePromoCampaignResync:true 로 재동기화하세요.'
    )
  }
  return (
    'Grab CM-POS-PROMO 캠페인 0개 — 이 매장에 Grab 배달 프로모(컷프라이스) 대상이 없거나, 동기화 실패로 삭제만 된 상태일 수 있습니다.'
  )
}

/**
 * Grab 캠페인·ERP 프로모 기간 진단.
 * `storeCode`(ERP 매장) → `GFSBPOS-…` merchantID 자동 해석.
 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const url = new URL(req.url)
    const storeCode = String(url.searchParams.get('storeCode') || '').trim()
    const merchantIDParam = String(url.searchParams.get('merchantID') || '').trim()
    const todayBkk = bangkokDateStrISO()
    const campaignsSuppressed = shouldSuppressGrabPromoCampaignsForConsumerSale()
    const consumerListPriceMode = isGrabPromoConsumerListPriceAsSaleEnabled() ? 'sale' : 'regular'

    let merchantIDs: string[] = []
    let resolvedFrom: 'storeCode' | 'merchantID' | 'default' = 'default'
    if (storeCode) {
      merchantIDs = await resolveGrabMenuNotificationMerchantIDsForStore(storeCode)
      resolvedFrom = 'storeCode'
    } else if (merchantIDParam) {
      merchantIDs = await resolveGrabMenuNotificationMerchantIDsForStore(merchantIDParam)
      if (merchantIDs.length === 0) {
        const direct = resolveGrabMenuNotificationMerchantIDs(merchantIDParam)
        merchantIDs = direct.length ? direct : [merchantIDParam]
      }
      resolvedFrom = 'merchantID'
    } else {
      merchantIDs = ['3-C6DWPB4VCKK1GT']
      resolvedFrom = 'default'
    }

    const erpGrabPromos = (await listGrabPromoCutPriceTargets({ immediateDisplay: true })).map((t) => ({
      promoId: t.promoId,
      name: t.promoName,
      campaignNameRef: buildGrabPromoCampaignName(t.promoId),
      grabMenuItemId: t.grabItemId,
      salePrice: t.salePrice,
      regularPrice: t.regularPrice,
      validFrom: t.validFrom,
      validTo: t.validTo,
    }))

    if (merchantIDs.length === 0) {
      return NextResponse.json(
        {
          success: true,
          storeCode,
          resolvedFrom,
          resolvedMerchantIDs: [],
          todayBkk,
          campaignsSuppressed,
          consumerListPriceMode,
          grabCampaignCount: 0,
          grabCampaigns: [],
          erpGrabPromos,
          hint:
            'Grab merchantID를 해석하지 못했습니다. Vercel: GRAB_PORTAL_MERCHANT_MAP=3-C6DWPB4VCKK1GT=1040, GRAB_STORE_MAP_JSON에 1040·ERP매장명 연결. True Digital: Prod 3-C6DWPB4VCKK1GT / partner 1040. (ERP 프로모 목록은 아래 참고)',
          hintTh:
            'ไม่พบ Grab merchantID สำหรับร้านที่เลือก — ตรวจ Vercel env (3-C6DWPB4VCKK1GT=1040) หรือแจ้งทีม Korea ตั้งค่า map ร้าน True Digital Park',
        },
        { headers }
      )
    }

    const campaignsByMerchant = await Promise.all(
      merchantIDs.map(async (id) => {
        try {
          const rows = await listGrabManagedPromoCampaigns(id)
          return rows.map((r) => ({ ...r, merchantID: id }) as GrabCampaignWithMerchant)
        } catch (e) {
          console.warn('[debugPromoCampaigns] list_failed', { merchantID: id, error: String(e) })
          return [] as GrabCampaignWithMerchant[]
        }
      })
    )
    const grabCampaigns = campaignsByMerchant.flat()

    return NextResponse.json(
      {
        success: true,
        storeCode,
        resolvedFrom,
        resolvedMerchantIDs: merchantIDs,
        todayBkk,
        campaignsSuppressed,
        consumerListPriceMode,
        grabCampaignCount: grabCampaigns.length,
        grabCampaigns,
        erpGrabPromos,
        hint: buildHint({
          grabCampaignCount: grabCampaigns.length,
          campaignsSuppressed,
          erpPromoCount: erpGrabPromos.length,
        }),
      },
      { headers }
    )
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
