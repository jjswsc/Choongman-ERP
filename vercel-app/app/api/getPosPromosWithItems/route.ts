import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { PROMOTION_MAIN_CATEGORY, normalizePromotionCategoryMain } from '@/lib/pos-promo-constants'

const SELECT_EXTENDED =
  'id,code,name,category,category_main,price,price_delivery,vat_included,is_active,sort_order,channel_hall,channel_takeout,channel_delivery,delivery_app_codes,discount_percent,valid_from,valid_to'

const SELECT_EXTENDED_WITH_COMPOSE = SELECT_EXTENDED + ',compose_pricing_basis'

const SELECT_BASE =
  'id,code,name,category,price,price_delivery,vat_included,is_active,sort_order'

type RawPromo = {
  id?: number
  code?: string
  name?: string
  category?: string
  category_main?: string
  price?: number
  price_delivery?: number | null
  is_active?: boolean
  channel_hall?: boolean
  channel_takeout?: boolean
  channel_delivery?: boolean
  delivery_app_codes?: unknown
  discount_percent?: number | null
  valid_from?: string | null
  valid_to?: string | null
  compose_pricing_basis?: string | null
}

function normalizeComposePricingBasis(v: unknown): 'hall' | 'delivery' {
  const s = String(v ?? '')
    .toLowerCase()
    .trim()
  return s === 'delivery' ? 'delivery' : 'hall'
}

function parseDeliveryCodes(dac: unknown): string[] | null {
  if (Array.isArray(dac)) return dac.map((x) => String(x)).filter(Boolean)
  if (dac && typeof dac === 'string') {
    try {
      const p = JSON.parse(dac) as unknown
      if (Array.isArray(p)) return p.map((x) => String(x)).filter(Boolean)
    } catch {
      /* ignore */
    }
  }
  return null
}

/** POS 프로모션 목록 + 구성 메뉴 (재고 차감용) */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get('campaignId')?.trim() || ''
    const includeInactive = searchParams.get('includeInactive') === 'true'

    let promos: RawPromo[] | null = null
    for (const sel of [SELECT_EXTENDED_WITH_COMPOSE, SELECT_EXTENDED, SELECT_BASE]) {
      try {
        const filterParts: string[] = []
        if (campaignId) filterParts.push(`marketing_campaign_id=eq.${encodeURIComponent(campaignId)}`)
        if (!includeInactive) filterParts.push('is_active=eq.true')
        if (filterParts.length > 0) {
          promos = (await supabaseSelectFilter('pos_promos', filterParts.join('&'), {
            order: 'sort_order.asc,name.asc',
            limit: 10000,
            select: sel,
          })) as RawPromo[] | null
        } else {
          promos = (await supabaseSelect('pos_promos', {
            order: 'sort_order.asc,name.asc',
            limit: 10000,
            select: sel,
          })) as RawPromo[] | null
        }
        break
      } catch {
        if (sel === SELECT_BASE) promos = []
      }
    }

    const promoList = (promos || []).map((p) => ({
      id: String(p.id ?? ''),
      code: String(p.code ?? ''),
      name: String(p.name ?? ''),
      category: String(p.category ?? '').trim(),
      categoryMain: normalizePromotionCategoryMain(p.category_main) || PROMOTION_MAIN_CATEGORY,
      price: Number(p.price) ?? 0,
      priceDelivery: p.price_delivery != null ? Number(p.price_delivery) : null,
      isActive: p.is_active !== false,
      channelHall: p.channel_hall !== false,
      channelTakeout: p.channel_takeout !== false,
      channelDelivery: p.channel_delivery !== false,
      deliveryAppCodes: parseDeliveryCodes(p.delivery_app_codes),
      discountPercent:
        p.discount_percent != null && Number.isFinite(Number(p.discount_percent))
          ? Number(p.discount_percent)
          : null,
      validFrom: p.valid_from ? String(p.valid_from).slice(0, 10) : null,
      validTo: p.valid_to ? String(p.valid_to).slice(0, 10) : null,
      composePricingBasis: normalizeComposePricingBasis(p.compose_pricing_basis),
    }))

    const itemsByPromo: Record<string, { menuId: string; optionId: string | null; quantity: number }[]> = {}
    for (const p of promoList) itemsByPromo[p.id] = []

    const promoIds = promoList.map((p) => p.id).filter(Boolean)
    if (promoIds.length > 0) {
      const chunkSize = 300
      for (let i = 0; i < promoIds.length; i += chunkSize) {
        const chunk = promoIds.slice(i, i + chunkSize)
        const rows = (await supabaseSelectFilter(
          'pos_promo_items',
          `promo_id=in.(${chunk.join(',')})`,
          { order: 'sort_order.asc,id.asc', limit: 10000, select: 'promo_id,menu_id,option_id,quantity' }
        )) as { promo_id?: number; menu_id?: number; option_id?: number | null; quantity?: number }[] | null

        for (const r of rows || []) {
          const pid = r.promo_id != null ? String(r.promo_id) : ''
          if (!pid || !itemsByPromo[pid]) continue
          itemsByPromo[pid].push({
            menuId: String(r.menu_id ?? ''),
            optionId: r.option_id != null ? String(r.option_id) : null,
            quantity: Number(r.quantity) ?? 1,
          })
        }
      }
    }

    return NextResponse.json(
      promoList.map((p) => ({ ...p, items: itemsByPromo[p.id] || [] })),
      { headers }
    )
  } catch (e) {
    console.error('getPosPromosWithItems:', e)
    return NextResponse.json([], { headers })
  }
}
