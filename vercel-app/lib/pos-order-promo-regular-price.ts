import {
  calcRegularPriceSum,
  type PromoLineLike,
  type PromoMenuLike,
  type PromoOptionLike,
  type RegularPriceChannel,
} from '@/lib/promo-economics'
import { promoItemsToPricingLines } from '@/lib/pos-promo-cut-price'
import { normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'

import type { PosPromoSalesKind } from '@/lib/pos-promo-sales-kind'

export type PromoPricingCatalogPromoMeta = {
  code: string
  name: string
  marketingCampaignId?: string
  kind: PosPromoSalesKind
}

export type PromoPricingCatalog = {
  menus: PromoMenuLike[]
  optionsByMenuId: Record<string, PromoOptionLike[]>
  promoMetaById: Map<string, PromoPricingCatalogPromoMeta>
  promoItemsByPromoId: Map<string, PromoLineLike[]>
  /** POS 세트 미러 메뉴 id → pos_promos.id */
  promoIdByMirrorMenuId: Map<string, string>
}

export function orderTypeToPromoRegularPriceChannel(orderType: unknown): RegularPriceChannel {
  return normalizePosOrderTypeKey(String(orderType ?? '')) === 'delivery' ? 'delivery' : 'hall'
}

export type PromoRegularPriceSource = 'snapshot' | 'line_items' | 'db_template' | null

export type PromoRegularPriceResolveResult = {
  regularPerSet: number
  source: PromoRegularPriceSource
  /** snapshot·주문 promoItems가 아닌 DB 구성만 쓴 경우 */
  estimated: boolean
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function linePromoItems(row: Record<string, unknown>): PromoLineLike[] {
  const raw = row.promoItems ?? row.promo_items
  if (!Array.isArray(raw) || raw.length === 0) return []
  return promoItemsToPricingLines(raw)
}

/** items_json 줄에 저장된 1세트당 정가 스냅샷 */
export function readPromoRegularPriceSnapshot(row: Record<string, unknown>): number | null {
  const v = row.promoRegularPrice ?? row.promo_regular_price
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

export function resolvePromoRegularPricePerSet(params: {
  row: Record<string, unknown>
  promoId: string
  channel: RegularPriceChannel
  catalog: PromoPricingCatalog
}): PromoRegularPriceResolveResult {
  const snapshot = readPromoRegularPriceSnapshot(params.row)
  if (snapshot != null) {
    return { regularPerSet: snapshot, source: 'snapshot', estimated: false }
  }

  const lineItems = linePromoItems(params.row)
  const fromLine = lineItems.length > 0 ? lineItems : null
  const fromDb =
    !fromLine && params.promoId
      ? params.catalog.promoItemsByPromoId.get(params.promoId) ?? null
      : null
  const items = fromLine ?? fromDb
  if (!items?.length) {
    return { regularPerSet: 0, source: null, estimated: false }
  }

  const regularPerSet = Math.max(
    0,
    calcRegularPriceSum({
      items,
      menus: params.catalog.menus,
      optionsByMenuId: params.catalog.optionsByMenuId,
      channel: params.channel,
    })
  )
  return {
    regularPerSet,
    source: fromLine ? 'line_items' : 'db_template',
    estimated: !fromLine,
  }
}

export function resolvePromoRegularChannelForItem(
  row: Record<string, unknown>,
  orderTypeFallback?: unknown
): RegularPriceChannel {
  const lineType = row.orderType ?? row.order_type
  if (lineType != null && String(lineType).trim()) {
    return orderTypeToPromoRegularPriceChannel(lineType)
  }
  return orderTypeToPromoRegularPriceChannel(orderTypeFallback)
}

/** 저장 직전 — promoId 줄에 정가 스냅샷이 없으면 당시 카탈로그로 채움 */
export function stampPromoRegularPriceOnItems<T extends Record<string, unknown>>(
  items: T[],
  catalog: PromoPricingCatalog,
  orderTypeFallback?: unknown
): T[] {
  return items.map((raw) => {
    const row = raw as Record<string, unknown>
    const promoId = str(row.promoId ?? row.promo_id)
    const promoCode = str(row.promoCode ?? row.promo_code)
    if (!promoId && !promoCode) return raw
    if (readPromoRegularPriceSnapshot(row) != null) return raw

    const channel = resolvePromoRegularChannelForItem(row, orderTypeFallback)
    const resolved = resolvePromoRegularPricePerSet({
      row,
      promoId,
      channel,
      catalog,
    })
    if (resolved.source == null || resolved.regularPerSet <= 0.0001) return raw

    return {
      ...raw,
      promoRegularPrice: resolved.regularPerSet,
    } as T
  })
}

export type { PromoMenuLike, PromoOptionLike, PromoLineLike, RegularPriceChannel }
