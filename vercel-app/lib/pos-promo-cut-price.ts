import {
  calcRegularPriceSum,
  type PromoLineLike,
  type PromoMenuLike,
  type PromoOptionLike,
  type RegularPriceChannel,
} from '@/lib/promo-economics'

export type PromoCutPrice = {
  salePrice: number
  regularPrice: number
  showCutPrice: boolean
}

export function resolvePromoCutPrice(params: {
  salePrice: number
  regularPrice: number
}): PromoCutPrice {
  const salePrice = Math.max(0, Number(params.salePrice) || 0)
  const regularPrice = Math.max(0, Number(params.regularPrice) || 0)
  const showCutPrice = regularPrice > salePrice + 0.009
  return {
    salePrice,
    regularPrice: showCutPrice ? regularPrice : salePrice,
    showCutPrice,
  }
}

export function calcPromoRegularPriceForChannel(params: {
  items: PromoLineLike[]
  menus: PromoMenuLike[]
  optionsByMenuId: Record<string, PromoOptionLike[]>
  channel?: RegularPriceChannel
}): number {
  if (!params.items.length) return 0
  return calcRegularPriceSum({
    items: params.items,
    menus: params.menus,
    optionsByMenuId: params.optionsByMenuId,
    channel: params.channel ?? 'hall',
  })
}

/**
 * Grab 컷프라이스용 정가 — 배달 구성 합만 쓰면 판매가와 같아져 취소선이 안 나오는 경우가 많아
 * 홀·배달 구성 정가 중 큰 값을 쓴다 (다른 매장과 동일한 `<Promotion>` 표시).
 */
export function calcPromoRegularPriceForGrabCut(params: {
  items: PromoLineLike[]
  menus: PromoMenuLike[]
  optionsByMenuId: Record<string, PromoOptionLike[]>
}): number {
  if (!params.items.length) return 0
  const delivery = calcPromoRegularPriceForChannel({ ...params, channel: 'delivery' })
  const hall = calcPromoRegularPriceForChannel({ ...params, channel: 'hall' })
  return Math.max(delivery, hall)
}

export function promoItemsToPricingLines(
  items: Array<{
    menuId?: string | number
    menu_id?: string | number
    optionId?: string | number | null
    option_id?: string | number | null
    quantity?: number | null
  }>
): PromoLineLike[] {
  return items
    .map((it) => {
      const menuId = String(it.menuId ?? it.menu_id ?? '').trim()
      const optionRaw = it.optionId ?? it.option_id
      return {
        menuId,
        optionId: optionRaw != null ? String(optionRaw).trim() || null : null,
        quantity: Math.max(1, Number(it.quantity) || 1),
      }
    })
    .filter((it) => it.menuId)
}

export function isPromoEligibleForGrabDeliveryApp(
  deliveryAppCodes: string[] | null | undefined
): boolean {
  if (!deliveryAppCodes || deliveryAppCodes.length === 0) return true
  return deliveryAppCodes
    .map((c) => String(c).trim().toLowerCase())
    .filter(Boolean)
    .some((c) => c === 'grab' || c === 'grabfood')
}

export function buildPromoRegularPriceById(params: {
  promos: Array<{
    id: string
    items?: Array<{
      menuId: string
      optionId?: string | null
      quantity?: number
    }>
  }>
  menus: PromoMenuLike[]
  optionsByMenuId: Record<string, PromoOptionLike[]>
  channel?: RegularPriceChannel
}): Map<string, number> {
  const channel = params.channel ?? 'hall'
  const out = new Map<string, number>()
  for (const promo of params.promos) {
    const pid = String(promo.id ?? '').trim()
    if (!pid) continue
    const lines = promoItemsToPricingLines(promo.items || [])
    if (!lines.length) continue
    out.set(
      pid,
      calcPromoRegularPriceForChannel({
        items: lines,
        menus: params.menus,
        optionsByMenuId: params.optionsByMenuId,
        channel,
      })
    )
  }
  return out
}
