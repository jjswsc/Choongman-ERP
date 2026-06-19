import type { PosMenu, PosMenuOption } from "@/lib/api-client"
import { isBanbanMenu } from "@/lib/pos-banban-utils"

/** 회원앱 픽업 주문에 노출할 메뉴 — POS 포장(sell_packaging)과 동일 기준 */
export function isMemberPortalPickupMenu(menu: PosMenu, todayYmd: string): boolean {
  if (menu.isActive === false) return false
  if (isBanbanMenu(menu)) return false
  if (menu.soldOutDate && menu.soldOutDate === todayYmd) return false
  if (menu.sellPackaging === false) return false
  if (menu.sellHall === false && menu.sellPackaging !== true) return false
  return true
}

/** 배달 전용(포장·홀 모두 off, 배달만 on) 세트 등 */
export function isDeliveryExclusiveMenu(menu: PosMenu): boolean {
  return menu.sellDelivery === true && menu.sellHall === false && menu.sellPackaging === false
}

export function filterMemberPortalPickupOptions(options: PosMenuOption[]): PosMenuOption[] {
  return (options || []).filter((o) => {
    if (o.sellPackaging === false) return false
    if (o.sellDelivery === true && o.sellHall === false && o.sellPackaging !== true) return false
    return true
  })
}

export function packagingMenuBasePrice(menu: PosMenu): number {
  return Math.max(0, Number(menu.price || 0))
}

export function packagingOptionPriceModifier(opt: PosMenuOption): number {
  if (opt.priceModifierPackaging != null) return Number(opt.priceModifierPackaging)
  return Number(opt.priceModifier || 0)
}

export function resolvePickupMenuListPriceLabel(
  menu: PosMenu,
  options: PosMenuOption[],
  formatBaht: (n: number) => string
): string {
  const base = packagingMenuBasePrice(menu)
  const subs = filterMemberPortalPickupOptions(options).filter((o) => o.optionType === "substitution")
  if (subs.length === 0) return formatBaht(base)
  const totals = subs.map((o) => base + packagingOptionPriceModifier(o))
  const min = Math.min(...totals)
  const max = Math.max(...totals)
  if (min === max) return formatBaht(min)
  return `${formatBaht(min)} – ${formatBaht(max)}`
}
