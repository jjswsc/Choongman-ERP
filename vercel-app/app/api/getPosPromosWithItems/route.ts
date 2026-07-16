import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { PROMOTION_MAIN_CATEGORY, normalizePromotionCategoryMain } from '@/lib/pos-promo-constants'
import { requireAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  isSaasTenantQueryBlocked,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

const SELECT_EXTENDED =
  'id,code,name,category,category_main,price,price_delivery,vat_included,is_active,sort_order,channel_hall,channel_takeout,channel_delivery,delivery_app_codes,discount_percent,valid_from,valid_to,grab_campaign_start_time_bkk,grab_campaign_end_time_bkk'

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
  grab_campaign_start_time_bkk?: string | null
  grab_campaign_end_time_bkk?: string | null
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
  const authResult = await requireAuth(req, 'any')
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, 'pos_promos')) return NextResponse.json([], { headers })

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
          promos = (await supabaseSelectFilter('pos_promos', appendSaasTenantFilter(filterParts.join('&'), tenantScope, 'pos_promos'), {
            order: 'sort_order.asc,name.asc',
            limit: 10000,
            select: sel,
          })) as RawPromo[] | null
        } else {
          promos = (await supabaseSelectFilter('pos_promos', appendSaasTenantFilter('id=gt.0', tenantScope, 'pos_promos'), {
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
      grabCampaignStartTimeBkk: p.grab_campaign_start_time_bkk
        ? String(p.grab_campaign_start_time_bkk).trim().slice(0, 5) || null
        : null,
      grabCampaignEndTimeBkk: p.grab_campaign_end_time_bkk
        ? String(p.grab_campaign_end_time_bkk).trim().slice(0, 5) || null
        : null,
      composePricingBasis: normalizeComposePricingBasis(p.compose_pricing_basis),
    }))

    const itemsByPromo: Record<
      string,
      {
        menuId: string
        optionId: string | null
        optionCode?: string | null
        quantity: number
        choiceGroup?: string | null
        choicePickCount?: number | null
        menuName?: string
        menuCode?: string
      }[]
    > = {}
    for (const p of promoList) itemsByPromo[p.id] = []

    const promoIds = promoList.map((p) => p.id).filter(Boolean)
    if (promoIds.length > 0) {
      type PromoComposeRow = {
        promo_id?: number
        menu_id?: number
        option_id?: number | null
        option_code?: string | null
        quantity?: number
        choice_group?: string | null
        choice_pick_count?: number | null
      }
      const chunkSize = 300
      for (let i = 0; i < promoIds.length; i += chunkSize) {
        const chunk = promoIds.slice(i, i + chunkSize)
        let rows: PromoComposeRow[] | null = null
        const itemSelectAttempts = [
          'promo_id,menu_id,option_id,option_code,quantity,choice_group,choice_pick_count',
          'promo_id,menu_id,option_id,quantity,choice_group,choice_pick_count',
          'promo_id,menu_id,option_id,quantity',
        ]
        for (const select of itemSelectAttempts) {
          try {
            rows = (await supabaseSelectFilter(
              'pos_promo_items',
              `promo_id=in.(${chunk.join(',')})`,
              { order: 'sort_order.asc,id.asc', limit: 10000, select }
            )) as PromoComposeRow[] | null
            break
          } catch {
            /* 다음 select 조합 */
          }
        }

        for (const r of rows || []) {
          const pid = r.promo_id != null ? String(r.promo_id) : ''
          if (!pid || !itemsByPromo[pid]) continue
          itemsByPromo[pid].push({
            menuId: String(r.menu_id ?? ''),
            optionId: r.option_id != null ? String(r.option_id) : null,
            optionCode: r.option_code != null ? String(r.option_code).trim() || null : null,
            quantity: Number(r.quantity) ?? 1,
            choiceGroup: r.choice_group != null ? String(r.choice_group).trim() || null : null,
            choicePickCount:
              r.choice_pick_count != null && Number.isFinite(Number(r.choice_pick_count))
                ? Math.max(1, Math.floor(Number(r.choice_pick_count)))
                : null,
          })
        }
      }
    }

    // 구성품 메뉴명·코드 보강: pos_promo_items 에는 menu_id 만 있어 주방 슬립이 #ID 로 찍힌다.
    // 매장 스코프와 무관하게 항상 이름을 표기하도록 서버에서 pos_menus 를 조인해 채운다.
    const allMenuIds = new Set<string>()
    for (const list of Object.values(itemsByPromo)) {
      for (const it of list) {
        const mid = String(it.menuId ?? '').trim()
        if (mid) allMenuIds.add(mid)
      }
    }
    const menuNameById = new Map<string, string>()
    const menuCodeById = new Map<string, string>()
    if (allMenuIds.size > 0) {
      const ids = [...allMenuIds]
      const menuChunkSize = 300
      for (let i = 0; i < ids.length; i += menuChunkSize) {
        const chunk = ids.slice(i, i + menuChunkSize)
        try {
          const menuRows = (await supabaseSelectFilter(
            'pos_menus',
            `id=in.(${chunk.join(',')})`,
            { limit: 10000, select: 'id,name,code' }
          )) as { id?: number; name?: string; code?: string }[] | null
          for (const m of menuRows || []) {
            const id = String(m.id ?? '').trim()
            if (!id) continue
            const name = String(m.name ?? '').trim()
            if (name) menuNameById.set(id, name)
            const code = String(m.code ?? '').trim()
            if (code) menuCodeById.set(id, code)
          }
        } catch {
          /* 메뉴명 보강 실패 시 menu_id 그대로 (주방에서 #ID 로 표기) */
        }
      }
    }

    return NextResponse.json(
      promoList.map((p) => ({
        ...p,
        items: (itemsByPromo[p.id] || []).map((it) => {
          const mid = String(it.menuId ?? '').trim()
          const menuName = mid ? menuNameById.get(mid) : undefined
          const menuCode = mid ? menuCodeById.get(mid) : undefined
          return {
            ...it,
            ...(menuName ? { menuName } : {}),
            ...(menuCode ? { menuCode } : {}),
          }
        }),
      })),
      { headers }
    )
  } catch (e) {
    console.error('getPosPromosWithItems:', e)
    return NextResponse.json([], { headers })
  }
}
