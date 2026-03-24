import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { PROMOTION_MAIN_CATEGORY, normalizePromotionCategoryMain } from '@/lib/pos-promo-constants'

const SELECT_EXTENDED =
  'id,code,name,category,category_main,price,price_delivery,vat_included,is_active,sort_order,marketing_campaign_id,channel_hall,channel_takeout,channel_delivery,delivery_app_codes,discount_percent,valid_from,valid_to'

const SELECT_BASE =
  'id,code,name,category,price,price_delivery,vat_included,is_active,sort_order,marketing_campaign_id'

type RawRow = {
  id?: number
  code?: string
  name?: string
  category?: string
  category_main?: string
  price?: number
  price_delivery?: number | null
  vat_included?: boolean
  is_active?: boolean
  sort_order?: number
  marketing_campaign_id?: number | null
  channel_hall?: boolean
  channel_takeout?: boolean
  channel_delivery?: boolean
  delivery_app_codes?: unknown
  discount_percent?: number | null
  valid_from?: string | null
  valid_to?: string | null
}

function mapRow(row: RawRow) {
  let deliveryAppCodes: string[] | null = null
  const dac = row.delivery_app_codes
  if (Array.isArray(dac)) {
    deliveryAppCodes = dac.map((x) => String(x)).filter(Boolean)
  } else if (dac && typeof dac === 'string') {
    try {
      const p = JSON.parse(dac) as unknown
      if (Array.isArray(p)) deliveryAppCodes = p.map((x) => String(x)).filter(Boolean)
    } catch {
      /* ignore */
    }
  }

  return {
    id: String(row.id ?? ''),
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    category: String(row.category ?? '').trim(),
    categoryMain: normalizePromotionCategoryMain(row.category_main) || PROMOTION_MAIN_CATEGORY,
    price: Number(row.price) ?? 0,
    priceDelivery: row.price_delivery != null ? Number(row.price_delivery) : null,
    vatIncluded: !!row.vat_included,
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order) ?? 0,
    marketingCampaignId: row.marketing_campaign_id != null ? String(row.marketing_campaign_id) : null,
    channelHall: row.channel_hall !== false,
    channelTakeout: row.channel_takeout !== false,
    channelDelivery: row.channel_delivery !== false,
    deliveryAppCodes,
    discountPercent:
      row.discount_percent != null && Number.isFinite(Number(row.discount_percent))
        ? Number(row.discount_percent)
        : null,
    validFrom: row.valid_from ? String(row.valid_from).slice(0, 10) : null,
    validTo: row.valid_to ? String(row.valid_to).slice(0, 10) : null,
  }
}

/** POS 프로모션 목록 조회 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get('campaignId')?.trim()
    let rows: RawRow[] | null = null
    for (const sel of [SELECT_EXTENDED, SELECT_BASE]) {
      try {
        rows = campaignId
          ? ((await supabaseSelectFilter(
              'pos_promos',
              `marketing_campaign_id=eq.${encodeURIComponent(campaignId)}`,
              {
                order: 'sort_order.asc,name.asc',
                limit: 10000,
                select: sel,
              }
            )) as RawRow[] | null)
          : ((await supabaseSelect('pos_promos', {
              order: 'sort_order.asc,name.asc',
              limit: 10000,
              select: sel,
            })) as RawRow[] | null)
        break
      } catch {
        if (sel === SELECT_BASE) rows = []
      }
    }

    const list = (rows || []).map((row) => mapRow(row))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosPromos:', e)
    return NextResponse.json([], { headers })
  }
}
