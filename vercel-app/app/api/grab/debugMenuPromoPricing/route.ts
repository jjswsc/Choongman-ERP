import { NextRequest, NextResponse } from 'next/server'
import { buildGrabMenuFromPos } from '@/lib/grab-menu-from-pos'
import { buildGrabMenuItemId } from '@/lib/grab-menu-item-id'
import { loadGrabPromoCutPriceByPromoId, listGrabManagedPromoCampaigns } from '@/lib/grab-promo-target-price-campaign'
import { resolveGrabMenuNotificationMerchantIDs } from '@/lib/grab-resolve-menu-notification-merchants'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type MenuItemRow = {
  id?: string
  name?: string
  price?: number
  advancedPricing?: Record<string, number>
  promo_id?: number | null
}

function walkMenuItems(menu: unknown): MenuItemRow[] {
  const out: MenuItemRow[] = []
  const root = menu as Record<string, unknown>
  const pools: unknown[] = []
  if (Array.isArray(root.categories)) pools.push(...root.categories)
  if (Array.isArray(root.sections)) {
    for (const sec of root.sections) {
      const cats = (sec as { categories?: unknown[] }).categories
      if (Array.isArray(cats)) pools.push(...cats)
    }
  }
  for (const raw of pools) {
    const cat = raw as { items?: unknown[] }
    if (!Array.isArray(cat.items)) continue
    for (const item of cat.items) {
      const row = item as MenuItemRow
      if (!row?.id) continue
      out.push(row)
    }
  }
  return out
}

/** Grab 컷프라이스 진단 — ERP가 보내는 item.price / advancedPricing 확인용 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const url = new URL(req.url)
    const merchantID = String(url.searchParams.get('merchantID') || 'GFSBPOS-811-087').trim()
    const partnerMerchantID = String(url.searchParams.get('partnerMerchantID') || '1040').trim()
    const nameFilter = String(url.searchParams.get('q') || 'april').trim().toLowerCase()

    const resolvedMerchantIDs = resolveGrabMenuNotificationMerchantIDs(partnerMerchantID)
    const grabMerchantID = resolvedMerchantIDs[0] || merchantID

    const [menu, promoCutByPromoId, mirrorMenus, grabCampaigns] = await Promise.all([
      buildGrabMenuFromPos({ merchantID, partnerMerchantID }),
      loadGrabPromoCutPriceByPromoId().catch(() => new Map()),
      supabaseSelectFilterAllPages('pos_menus', 'promo_id=not.is.null', {
        select: 'id,code,name,promo_id',
        pageSize: 3000,
        order: 'id.asc',
      }).catch(() => []) as Promise<
        Array<{ id?: number; code?: string; name?: string; promo_id?: number | null }>
      >,
      listGrabManagedPromoCampaigns(grabMerchantID).catch(() => []),
    ])

    const promoIdByGrabItemId = new Map<string, number>()
    for (const mirror of mirrorMenus || []) {
      const pid = Number(mirror.promo_id ?? 0)
      if (!pid) continue
      promoIdByGrabItemId.set(buildGrabMenuItemId(mirror), pid)
    }

    const items = walkMenuItems(menu)
      .filter((item) => String(item.name || '').toLowerCase().includes(nameFilter))
      .map((item) => {
        const itemId = String(item.id || '')
        const promoId = promoIdByGrabItemId.get(itemId) ?? 0
        const cut = promoId > 0 ? promoCutByPromoId.get(promoId) : undefined
        const priceMinor = Number(item.price ?? 0)
        const adv = item.advancedPricing || {}
        const advVals = Object.values(adv).map((v) => Number(v)).filter(Number.isFinite)
        const saleMinor = advVals.length ? advVals[0] : priceMinor
        return {
          id: item.id,
          name: item.name,
          priceMinor,
          priceMajor: Math.round(priceMinor / 100),
          advancedPricing: adv,
          saleMajorFromAdvanced: advVals.length ? Math.round(saleMinor / 100) : null,
          hasAdvancedPricing: advVals.length > 0,
          promoId: promoId || null,
          promoCut: cut
            ? {
                salePrice: cut.salePrice,
                regularPrice: cut.regularPrice,
                showCutPrice: cut.showCutPrice,
              }
            : null,
          /** Grab 컷프라이스 UI: price=정가(minor), advancedPricing=할인가(minor) */
          cutPriceReady: Boolean(cut?.showCutPrice && advVals.length > 0 && priceMinor > saleMinor),
        }
      })

    const cutReady = items.some((i) => i.cutPriceReady)
    const campaignCount = grabCampaigns.length
    let hint: string
    if (!cutReady) {
      hint =
        'cutPriceReady=false → ERP가 정가+할인가 쌍을 안 보냄. promoCut.showCutPrice 또는 advancedPricing 확인.'
    } else if (campaignCount === 0) {
      hint =
        '메뉴 가격(정가+할인가)은 정상이나 Grab CM-POS-PROMO 캠페인 0개 — 취소선 없음. fixPrice 캠페인 재생성(force sync) 필요.'
    } else {
      hint = 'cutPriceReady=true + Grab 캠페인 있음 → 앱·테스트 화면에서 취소선+할인가 확인.'
    }

    return NextResponse.json(
      {
        success: true,
        merchantID,
        partnerMerchantID,
        /** `1040` 등 파트너 ID로 sync 시 실제 Grab에 알릴 merchantID 목록 */
        resolvedMerchantIDs,
        grabMerchantID,
        grabCampaignCount: campaignCount,
        grabCampaigns: grabCampaigns.slice(0, 20),
        filter: nameFilter,
        itemCount: items.length,
        items,
        hint,
      },
      { headers }
    )
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
