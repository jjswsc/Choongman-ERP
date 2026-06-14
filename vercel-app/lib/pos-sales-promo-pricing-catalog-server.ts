import 'server-only'

import { supabaseSelect, supabaseSelectAllPages } from '@/lib/supabase-server'
import type { PromoLineLike, PromoMenuLike, PromoOptionLike } from '@/lib/promo-economics'
import { promoItemsToPricingLines } from '@/lib/pos-promo-cut-price'
import type { PromoPricingCatalog } from '@/lib/pos-order-promo-regular-price'
import { resolvePosPromoSalesKind } from '@/lib/pos-promo-sales-kind'

function buildOptionsByMenuId(
  rows: {
    id?: number | string
    menu_id?: number | string
    price_modifier?: number | null
    price_modifier_delivery?: number | null
  }[]
): Record<string, PromoOptionLike[]> {
  const out: Record<string, PromoOptionLike[]> = {}
  for (const row of rows) {
    const menuId = String(row.menu_id ?? '').trim()
    const id = String(row.id ?? '').trim()
    if (!menuId || !id) continue
    const hall = Number(row.price_modifier ?? 0) || 0
    const del =
      row.price_modifier_delivery != null && Number.isFinite(Number(row.price_modifier_delivery))
        ? Number(row.price_modifier_delivery)
        : hall
    const opt: PromoOptionLike = {
      id,
      priceModifier: hall,
      priceModifierDelivery: del,
    }
    if (!out[menuId]) out[menuId] = []
    out[menuId].push(opt)
  }
  return out
}

/** 매출 리포트 — 세트 정가 역산용 메뉴·옵션·프로모 구성 카탈로그 */
export async function loadPosSalesPromoPricingCatalog(): Promise<PromoPricingCatalog> {
  const menusRaw = (await supabaseSelect('pos_menus', {
    limit: 10000,
    select: 'id,name,price,price_delivery',
  })) as { id?: number | string; name?: string; price?: number; price_delivery?: number | null }[] | null

  const menus: PromoMenuLike[] = (menusRaw || []).map((m) => ({
    id: String(m.id ?? ''),
    name: String(m.name ?? '').trim() || undefined,
    price: Number(m.price ?? 0) || 0,
    priceDelivery: m.price_delivery != null ? Number(m.price_delivery) : null,
  }))

  let optionRows: {
    id?: number | string
    menu_id?: number | string
    price_modifier?: number | null
    price_modifier_delivery?: number | null
  }[] = []
  for (const select of [
    'id,menu_id,price_modifier,price_modifier_delivery',
    'id,menu_id,price_modifier',
    'id,menu_id',
  ]) {
    try {
      optionRows =
        ((await supabaseSelectAllPages('pos_menu_options', {
          order: 'menu_id.asc,id.asc',
          pageSize: 3000,
          maxRows: 200000,
          select,
        })) as typeof optionRows) ?? []
      break
    } catch {
      if (select === 'id,menu_id') optionRows = []
    }
  }

  let promoRows: {
    id?: number | string
    code?: string
    name?: string
    marketing_campaign_id?: number | string | null
  }[] = []
  for (const select of ['id,code,name,marketing_campaign_id', 'id,code,name']) {
    try {
      promoRows =
        ((await supabaseSelect('pos_promos', {
          limit: 10000,
          select,
        })) as typeof promoRows) ?? []
      break
    } catch {
      if (select === 'id,code,name') promoRows = []
    }
  }

  const promoMetaById = new Map<
    string,
    {
      code: string
      name: string
      marketingCampaignId?: string
      kind: ReturnType<typeof resolvePosPromoSalesKind>
    }
  >()
  for (const p of promoRows || []) {
    const id = String(p.id ?? '').trim()
    if (!id) continue
    const code = String(p.code ?? '').trim()
    const marketingCampaignId = String(p.marketing_campaign_id ?? '').trim() || undefined
    promoMetaById.set(id, {
      code,
      name: String(p.name ?? '').trim() || code || id,
      marketingCampaignId,
      kind: resolvePosPromoSalesKind({ marketingCampaignId, promoCode: code }),
    })
  }

  let promoItemRows: {
    promo_id?: number | string
    menu_id?: number | string
    option_id?: number | string | null
    quantity?: number | null
  }[] = []
  try {
    promoItemRows =
      ((await supabaseSelectAllPages('pos_promo_items', {
        order: 'promo_id.asc,id.asc',
        pageSize: 3000,
        maxRows: 200000,
        select: 'promo_id,menu_id,option_id,quantity',
      })) as typeof promoItemRows) ?? []
  } catch {
    promoItemRows = []
  }

  const promoItemsByPromoId = new Map<string, PromoLineLike[]>()
  for (const row of promoItemRows) {
    const promoId = String(row.promo_id ?? '').trim()
    if (!promoId) continue
    const lines = promoItemsByPromoId.get(promoId) ?? []
    lines.push(
      ...promoItemsToPricingLines([
        {
          menuId: row.menu_id,
          optionId: row.option_id,
          quantity: row.quantity,
        },
      ])
    )
    promoItemsByPromoId.set(promoId, lines)
  }

  return {
    menus,
    optionsByMenuId: buildOptionsByMenuId(optionRows),
    promoMetaById,
    promoItemsByPromoId,
  }
}
