import { NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { PROMOTION_MAIN_CATEGORY } from '@/lib/pos-promo-constants'

const SELECT_EXTENDED =
  'id,code,name,category,category_main,price,price_delivery,vat_included,is_active,sort_order,channel_hall,channel_takeout,channel_delivery,delivery_app_codes,discount_percent,valid_from,valid_to'

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
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    let promos: RawPromo[] | null = null
    for (const sel of [SELECT_EXTENDED, SELECT_BASE]) {
      try {
        promos = (await supabaseSelect('pos_promos', {
          order: 'sort_order.asc,name.asc',
          limit: 500,
          select: sel,
        })) as RawPromo[] | null
        break
      } catch {
        if (sel === SELECT_BASE) promos = []
      }
    }

    const promoList = (promos || []).map((p) => ({
      id: String(p.id ?? ''),
      code: String(p.code ?? ''),
      name: String(p.name ?? ''),
      category: String(p.category ?? ''),
      categoryMain: String(p.category_main ?? '').trim() || PROMOTION_MAIN_CATEGORY,
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
    }))

    const itemsByPromo: Record<string, { menuId: string; optionId: string | null; quantity: number }[]> = {}
    for (const p of promoList) {
      const rows = (await supabaseSelectFilter(
        'pos_promo_items',
        `promo_id=eq.${p.id}`,
        { order: 'sort_order.asc', limit: 50, select: 'menu_id,option_id,quantity' }
      )) as { menu_id?: number; option_id?: number | null; quantity?: number }[] | null
      itemsByPromo[p.id] = (rows || []).map((r) => ({
        menuId: String(r.menu_id ?? ''),
        optionId: r.option_id != null ? String(r.option_id) : null,
        quantity: Number(r.quantity) ?? 1,
      }))
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
