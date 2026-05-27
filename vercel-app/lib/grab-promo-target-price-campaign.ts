import { bangkokDateStrISO, bangkokYmdRangeToIsoBounds } from '@/lib/bangkok-date'
import { buildGrabMenuItemId } from '@/lib/grab-menu-item-id'
import { grabJsonRequest } from '@/lib/grab-openapi'
import {
  calcPromoRegularPriceForChannel,
  isPromoEligibleForGrabDeliveryApp,
  promoItemsToPricingLines,
  resolvePromoCutPrice,
} from '@/lib/pos-promo-cut-price'
import { isPromoVisibleInContext } from '@/lib/pos-promo-visibility'
import type { PromoOptionLike } from '@/lib/promo-economics'
import { supabaseSelectAllPages, supabaseSelectFilterAllPages } from '@/lib/supabase-server'

const CAMPAIGN_NAME_PREFIX = 'CM-POS-PROMO-'
const ALL_DAY_WORKING_HOUR = {
  sun: { periods: [{ startTime: '00:00', endTime: '23:59' }] },
  mon: { periods: [{ startTime: '00:00', endTime: '23:59' }] },
  tue: { periods: [{ startTime: '00:00', endTime: '23:59' }] },
  wed: { periods: [{ startTime: '00:00', endTime: '23:59' }] },
  thu: { periods: [{ startTime: '00:00', endTime: '23:59' }] },
  fri: { periods: [{ startTime: '00:00', endTime: '23:59' }] },
  sat: { periods: [{ startTime: '00:00', endTime: '23:59' }] },
}

type PromoRow = {
  id?: number
  code?: string
  name?: string
  price?: number
  price_delivery?: number | null
  is_active?: boolean
  channel_delivery?: boolean
  delivery_app_codes?: string[] | null
  valid_from?: string | null
  valid_to?: string | null
}

type PromoItemRow = {
  promo_id?: number
  menu_id?: number | string
  option_id?: number | string | null
  quantity?: number | null
}

type MirrorMenuRow = {
  id?: number
  code?: string
  promo_id?: number | null
  sell_delivery?: boolean
  is_active?: boolean
}

type MenuPriceRow = {
  id?: number
  price?: number
  price_delivery?: number | null
}

type OptionRow = {
  menu_id?: number
  id?: number
  price_modifier?: number
  price_modifier_delivery?: number | null
}

type GrabCampaignListRow = {
  id?: string
  name?: string
  discount?: { type?: string; value?: number; scope?: { objectIDs?: string[] } }
}

export function buildGrabPromoCampaignName(promoId: string | number): string {
  return `${CAMPAIGN_NAME_PREFIX}${String(promoId).trim()}`
}

export function buildGrabTargetPriceCampaignBody(params: {
  merchantID: string
  promoId: string | number
  promoName: string
  grabItemId: string
  salePriceMajor: number
  validFrom?: string | null
  validTo?: string | null
}): Record<string, unknown> {
  const today = bangkokDateStrISO()
  const fromYmd = String(params.validFrom ?? '').trim() || today
  const toYmd = String(params.validTo ?? '').trim() || '2099-12-31'
  const { gteIso, lteIso } = bangkokYmdRangeToIsoBounds(fromYmd, toYmd)
  const minStartMs = Date.now() + 65 * 60_000
  const startMs = Math.max(new Date(gteIso).getTime(), minStartMs)
  const endMs = Math.max(new Date(lteIso).getTime(), startMs + 60 * 60_000)

  return {
    merchantID: params.merchantID,
    name: `${buildGrabPromoCampaignName(params.promoId)} ${String(params.promoName || '').trim()}`.slice(0, 256),
    quotas: { totalCount: 999999, totalCountPerUser: 999 },
    conditions: {
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      eaterType: 'all',
      minBasketAmount: 0,
      bundleQuantity: 0,
      workingHour: ALL_DAY_WORKING_HOUR,
    },
    discount: {
      type: 'fixPrice',
      value: Math.round(params.salePriceMajor),
      scope: {
        type: 'items',
        objectIDs: [params.grabItemId],
      },
    },
    customTag: '',
  }
}

function buildOptionsByMenuId(options: OptionRow[]): Record<string, PromoOptionLike[]> {
  const out: Record<string, PromoOptionLike[]> = {}
  for (const opt of options) {
    const menuId = String(opt.menu_id ?? '').trim()
    if (!menuId) continue
    if (!out[menuId]) out[menuId] = []
    out[menuId].push({
      id: String(opt.id ?? ''),
      priceModifier: Number(opt.price_modifier ?? 0),
      priceModifierDelivery:
        opt.price_modifier_delivery != null ? Number(opt.price_modifier_delivery) : null,
    })
  }
  return out
}

async function loadPromoBundle(): Promise<{
  promos: PromoRow[]
  itemsByPromoId: Map<number, PromoItemRow[]>
  mirrorByPromoId: Map<number, MirrorMenuRow>
  menus: MenuPriceRow[]
  optionsByMenuId: Record<string, PromoOptionLike[]>
}> {
  const [promos, promoItems, mirrorMenus, menus, options] = await Promise.all([
    supabaseSelectAllPages('pos_promos', {
      select:
        'id,code,name,price,price_delivery,is_active,channel_delivery,delivery_app_codes,valid_from,valid_to',
      pageSize: 2000,
      order: 'id.asc',
    }).catch(() => []) as Promise<PromoRow[]>,
    supabaseSelectAllPages('pos_promo_items', {
      select: 'promo_id,menu_id,option_id,quantity',
      pageSize: 5000,
      order: 'promo_id.asc,sort_order.asc',
    }).catch(() => []) as Promise<PromoItemRow[]>,
    supabaseSelectFilterAllPages('pos_menus', 'promo_id=not.is.null', {
      select: 'id,code,promo_id,sell_delivery,is_active',
      pageSize: 3000,
      order: 'id.asc',
    }).catch(() => []) as Promise<MirrorMenuRow[]>,
    supabaseSelectAllPages('pos_menus', {
      select: 'id,price,price_delivery',
      pageSize: 3000,
      order: 'id.asc',
    }).catch(() => []) as Promise<MenuPriceRow[]>,
    supabaseSelectAllPages('pos_menu_options', {
      select: 'id,menu_id,price_modifier,price_modifier_delivery',
      pageSize: 5000,
      order: 'menu_id.asc',
    }).catch(() => []) as Promise<OptionRow[]>,
  ])

  const itemsByPromoId = new Map<number, PromoItemRow[]>()
  for (const row of promoItems || []) {
    const pid = Number(row.promo_id ?? 0)
    if (!pid) continue
    const list = itemsByPromoId.get(pid) || []
    list.push(row)
    itemsByPromoId.set(pid, list)
  }

  const mirrorByPromoId = new Map<number, MirrorMenuRow>()
  for (const row of mirrorMenus || []) {
    const pid = Number(row.promo_id ?? 0)
    if (!pid) continue
    mirrorByPromoId.set(pid, row)
  }

  return {
    promos: Array.isArray(promos) ? promos : [],
    itemsByPromoId,
    mirrorByPromoId,
    menus: Array.isArray(menus) ? menus : [],
    optionsByMenuId: buildOptionsByMenuId(Array.isArray(options) ? options : []),
  }
}

function listCampaignRows(payload: unknown): GrabCampaignListRow[] {
  if (!payload || typeof payload !== 'object') return []
  const o = payload as Record<string, unknown>
  const ongoing = Array.isArray(o.ongoing) ? o.ongoing : []
  const upcoming = Array.isArray(o.upcoming) ? o.upcoming : []
  return [...ongoing, ...upcoming].filter((r) => r && typeof r === 'object') as GrabCampaignListRow[]
}

export async function syncGrabPromoTargetPriceCampaigns(params: {
  merchantID: string
}): Promise<{ created: number; updated: number; skipped: number; deleted: number }> {
  const merchantID = String(params.merchantID || '').trim()
  if (!merchantID) return { created: 0, updated: 0, skipped: 0, deleted: 0 }

  const bundle = await loadPromoBundle()
  const businessDateYmd = bangkokDateStrISO()
  const menuRows = bundle.menus.map((m) => ({
    id: String(m.id ?? ''),
    price: Number(m.price ?? 0),
    priceDelivery: m.price_delivery != null ? Number(m.price_delivery) : null,
  }))

  const targets: Array<{
    promoId: number
    grabItemId: string
    salePrice: number
    promoName: string
    validFrom: string | null
    validTo: string | null
  }> = []

  for (const promo of bundle.promos) {
    const promoId = Number(promo.id ?? 0)
    if (!promoId) continue
    const mirror = bundle.mirrorByPromoId.get(promoId)
    if (!mirror || mirror.is_active === false || mirror.sell_delivery === false) continue

    const visible = isPromoVisibleInContext(
      {
        isActive: promo.is_active !== false,
        validFrom: promo.valid_from ?? null,
        validTo: promo.valid_to ?? null,
        channelHall: true,
        channelTakeout: true,
        channelDelivery: promo.channel_delivery !== false,
        deliveryAppCodes: promo.delivery_app_codes ?? null,
      },
      { businessDateYmd, orderType: 'delivery', deliveryAppCode: 'grab' }
    )
    if (!visible) continue
    if (!isPromoEligibleForGrabDeliveryApp(promo.delivery_app_codes)) continue

    const itemRows = bundle.itemsByPromoId.get(promoId) || []
    const pricingItems = promoItemsToPricingLines(itemRows)
    if (!pricingItems.length) continue

    const salePrice =
      promo.price_delivery != null && Number.isFinite(Number(promo.price_delivery))
        ? Number(promo.price_delivery)
        : Number(promo.price ?? 0)
    const regularPrice = calcPromoRegularPriceForChannel({
      items: pricingItems,
      menus: menuRows,
      optionsByMenuId: bundle.optionsByMenuId,
      channel: 'delivery',
    })
    const cut = resolvePromoCutPrice({ salePrice, regularPrice })
    if (!cut.showCutPrice) continue

    targets.push({
      promoId,
      grabItemId: buildGrabMenuItemId(mirror),
      salePrice: cut.salePrice,
      promoName: String(promo.name ?? promo.code ?? '').trim(),
      validFrom: promo.valid_from ? String(promo.valid_from).slice(0, 10) : null,
      validTo: promo.valid_to ? String(promo.valid_to).slice(0, 10) : null,
    })
  }

  let existing: GrabCampaignListRow[] = []
  try {
    const listed = await grabJsonRequest<unknown>({
      path: '/partner/v1/campaigns',
      method: 'GET',
      query: { merchantID },
    })
    existing = listCampaignRows(listed)
  } catch (e) {
    console.warn('[grab-promo-campaign] list_failed', { merchantID, error: String(e) })
    return { created: 0, updated: 0, skipped: targets.length, deleted: 0 }
  }

  const existingByName = new Map<string, GrabCampaignListRow>()
  for (const row of existing) {
    const name = String(row.name ?? '').trim()
    if (name.startsWith(CAMPAIGN_NAME_PREFIX)) existingByName.set(name, row)
  }

  let created = 0
  let updated = 0
  let skipped = 0
  const keepNames = new Set<string>()

  for (const target of targets) {
    const campaignName = buildGrabPromoCampaignName(target.promoId)
    keepNames.add(campaignName)
    const body = buildGrabTargetPriceCampaignBody({
      merchantID,
      promoId: target.promoId,
      promoName: target.promoName,
      grabItemId: target.grabItemId,
      salePriceMajor: target.salePrice,
      validFrom: target.validFrom,
      validTo: target.validTo,
    })
    const fullName = String(body.name ?? '')
    const hit =
      existingByName.get(campaignName) ||
      existing.find((row) => String(row.name ?? '').startsWith(campaignName))

    try {
      if (hit?.id) {
        await grabJsonRequest({
          path: `/partner/v1/campaigns/${encodeURIComponent(String(hit.id))}`,
          method: 'PUT',
          body,
          expectNoContentOk: true,
        })
        updated += 1
      } else {
        await grabJsonRequest({
          path: '/partner/v1/campaigns',
          method: 'POST',
          body,
        })
        created += 1
      }
    } catch (e) {
      skipped += 1
      console.warn('[grab-promo-campaign] upsert_failed', {
        merchantID,
        promoId: target.promoId,
        campaignName: fullName,
        error: String(e),
      })
    }
  }

  let deleted = 0
  for (const row of existing) {
    const name = String(row.name ?? '').trim()
    if (!name.startsWith(CAMPAIGN_NAME_PREFIX)) continue
    const prefix = name.split(' ')[0]
    if (keepNames.has(prefix)) continue
    const id = String(row.id ?? '').trim()
    if (!id) continue
    try {
      await grabJsonRequest({
        path: `/partner/v1/campaigns/${encodeURIComponent(id)}`,
        method: 'DELETE',
        expectNoContentOk: true,
      })
      deleted += 1
    } catch (e) {
      console.warn('[grab-promo-campaign] delete_stale_failed', { merchantID, id, error: String(e) })
    }
  }

  return { created, updated, skipped, deleted }
}

/** 메뉴 빌드용: promo_id → 정가·할인가 (Grab 메뉴 item price = 정가) */
export async function loadGrabPromoCutPriceByPromoId(): Promise<
  Map<
    number,
    {
      salePrice: number
      regularPrice: number
      showCutPrice: boolean
    }
  >
> {
  const bundle = await loadPromoBundle()
  const menuRows = bundle.menus.map((m) => ({
    id: String(m.id ?? ''),
    price: Number(m.price ?? 0),
    priceDelivery: m.price_delivery != null ? Number(m.price_delivery) : null,
  }))
  const out = new Map<number, { salePrice: number; regularPrice: number; showCutPrice: boolean }>()

  for (const [promoId, itemRows] of bundle.itemsByPromoId.entries()) {
    const promo = bundle.promos.find((p) => Number(p.id ?? 0) === promoId)
    if (!promo) continue
    const pricingItems = promoItemsToPricingLines(itemRows)
    if (!pricingItems.length) continue
    const salePrice =
      promo.price_delivery != null && Number.isFinite(Number(promo.price_delivery))
        ? Number(promo.price_delivery)
        : Number(promo.price ?? 0)
    const regularPrice = calcPromoRegularPriceForChannel({
      items: pricingItems,
      menus: menuRows,
      optionsByMenuId: bundle.optionsByMenuId,
      channel: 'delivery',
    })
    const cut = resolvePromoCutPrice({ salePrice, regularPrice })
    if (cut.showCutPrice) out.set(promoId, cut)
  }
  return out
}
