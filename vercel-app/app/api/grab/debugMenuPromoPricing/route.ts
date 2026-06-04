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

function summarizeMenuCategories(menu: unknown): Array<{
  id: string
  name: string
  itemCount: number
  sampleItemNames: string[]
}> {
  const out: Array<{ id: string; name: string; itemCount: number; sampleItemNames: string[] }> = []
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
    const cat = raw as { id?: string; name?: string; items?: unknown[] }
    const items = Array.isArray(cat.items) ? cat.items : []
    out.push({
      id: String(cat.id ?? ''),
      name: String(cat.name ?? ''),
      itemCount: items.length,
      sampleItemNames: items
        .slice(0, 5)
        .map((it) => String((it as { name?: string }).name ?? ''))
        .filter(Boolean),
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** 루트 categories에서 이름 매칭되는 첫 카테고리의 원본 JSON 전체를 반환 (검증 깨짐 진단용) */
function pickRawCategory(menu: unknown, nameMatch: string): unknown {
  const root = menu as Record<string, unknown>
  const cats = Array.isArray(root.categories) ? root.categories : []
  const want = nameMatch.trim().toLowerCase()
  for (const raw of cats) {
    const cat = raw as { name?: string }
    if (String(cat.name ?? '').toLowerCase() === want) return raw
  }
  return null
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
    const rawCategoryName = String(url.searchParams.get('raw') || '').trim()

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

    const root = menu as Record<string, unknown>
    const sellingTimesSummary = (Array.isArray(root.sellingTimes) ? root.sellingTimes : []).map(
      (st) => {
        const row = st as { id?: string; name?: string }
        return { id: String(row.id ?? ''), name: String(row.name ?? '') }
      }
    )
    const includesLegacySections = Array.isArray(root.sections) && root.sections.length > 0

    const categories = summarizeMenuCategories(menu)
    const setCategory = categories.filter((c) => /set/i.test(c.name))
    const setCategoryItems = setCategory.flatMap((cat) => {
      const raw = pickRawCategory(menu, cat.name) as { items?: Array<Record<string, unknown>> } | null
      const items = raw?.items
      return Array.isArray(items) ? items : []
    })
    const setAvailableCount = setCategoryItems.filter(
      (it) => String(it.availableStatus ?? '') === 'AVAILABLE'
    ).length
    const promotionSellingTime = (Array.isArray(root.sellingTimes) ? root.sellingTimes : []).find(
      (st) => String((st as { name?: string }).name ?? '').toLowerCase() === 'promotion'
    )

    if (rawCategoryName) {
      const root = menu as Record<string, unknown>
      return NextResponse.json(
        {
          success: true,
          merchantID,
          partnerMerchantID,
          rawCategoryName,
          rawCategory: pickRawCategory(menu, rawCategoryName),
          sellingTimes: Array.isArray(root.sellingTimes) ? root.sellingTimes : [],
        },
        { headers }
      )
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
    const ongoingCount = grabCampaigns.filter((c) => c.section === 'ongoing').length
    const upcomingCount = grabCampaigns.filter((c) => c.section === 'upcoming').length
    const earliestStartBkk = grabCampaigns
      .map((c) => c.startTimeBkk)
      .filter(Boolean)
      .sort()[0]
    let hint: string
    if (!cutReady) {
      hint =
        'cutPriceReady=false → ERP가 정가+할인가 쌍을 안 보냄. promoCut.showCutPrice 또는 advancedPricing 확인.'
    } else if (ongoingCount === 0 && upcomingCount > 0) {
      hint = `Grab App Simulator "Now"는 캠페인 ongoing 전엔 취소선 없음(할인가만). upcoming ${upcomingCount}개 — earliest startTimeBkk=${earliestStartBkk ?? '?'}. force sync 반복 시 시작 시각이 계속 밀림.`
    } else if (campaignCount === 0) {
      hint =
        '메뉴 가격(정가+할인가)은 정상이나 Grab CM-POS-PROMO 캠페인 0개 — 취소선 없음. fixPrice 캠페인 재생성 필요.'
    } else {
      hint = `ongoing ${ongoingCount}개 — App Simulator "Now"에서 취소선+할인가 확인 가능.`
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
        grabCampaignOngoingCount: ongoingCount,
        grabCampaignUpcomingCount: upcomingCount,
        grabCampaignEarliestStartBkk: earliestStartBkk ?? null,
        grabCampaigns: grabCampaigns.slice(0, 20),
        filter: nameFilter,
        categoryCount: categories.length,
        sellingTimesCount: sellingTimesSummary.length,
        sellingTimesSummary,
        includesLegacySections,
        categories,
        setCategories: setCategory,
        setCategoryDiagnostics: {
          itemCount: setCategoryItems.length,
          availableCount: setAvailableCount,
          unavailableCount: setCategoryItems.length - setAvailableCount,
          promotionSellingTimeOpenPeriodType: (
            promotionSellingTime as { serviceHours?: { mon?: { openPeriodType?: string } } } | undefined
          )?.serviceHours?.mon?.openPeriodType ?? null,
          hint:
            setCategoryItems.length === 0
              ? 'Set 카테고리에 항목 0 — 메뉴 사용/배달 체크·배달앱 운영(Grab ON) 확인'
              : setAvailableCount === 0
                ? 'Set 항목은 있으나 전부 UNAVAILABLE — 배달앱 운영에서 Grab ON·품절·판매시간 확인'
                : null,
        },
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
