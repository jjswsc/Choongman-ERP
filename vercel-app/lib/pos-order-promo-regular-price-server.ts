import 'server-only'

import { loadPosSalesPromoPricingCatalog } from '@/lib/pos-sales-promo-pricing-catalog-server'
import { stampPromoRegularPriceOnItems } from '@/lib/pos-order-promo-regular-price'

let catalogCache: {
  loadedAt: number
  catalog: Awaited<ReturnType<typeof loadPosSalesPromoPricingCatalog>>
} | null = null

const CATALOG_TTL_MS = 60_000

async function getPromoPricingCatalogCached() {
  const now = Date.now()
  if (catalogCache && now - catalogCache.loadedAt < CATALOG_TTL_MS) {
    return catalogCache.catalog
  }
  const catalog = await loadPosSalesPromoPricingCatalog()
  catalogCache = { loadedAt: now, catalog }
  return catalog
}

/** POS 주문 저장 — 세트 줄 promoRegularPrice 스냅샷 보강 */
export async function enrichOrderItemsWithPromoRegularPrice<T extends Record<string, unknown>>(
  items: T[],
  orderTypeFallback?: unknown
): Promise<T[]> {
  if (!items.length) return items
  const hasPromo = items.some((it) => {
    const row = it as Record<string, unknown>
    return Boolean(str(row.promoId ?? row.promo_id) || str(row.promoCode ?? row.promo_code))
  })
  if (!hasPromo) return items

  const catalog = await getPromoPricingCatalogCached()
  return stampPromoRegularPriceOnItems(items, catalog, orderTypeFallback)
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}
