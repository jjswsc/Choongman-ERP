import type { PosMenu, PosMenuOption } from "@/lib/api-client"
import { isBanbanMenu } from "@/lib/pos-banban-utils"

function menuSellMemberAllowed(menu: PosMenu): boolean {
  if (menu.sellMember != null) return menu.sellMember !== false
  if (menu.sellPackaging === false) return false
  if (isDeliveryExclusiveMenu(menu)) return false
  return true
}

function optionSellMemberAllowed(opt: PosMenuOption): boolean {
  if (opt.sellMember != null) return opt.sellMember !== false
  if (opt.sellPackaging === false) return false
  if (opt.sellDelivery === true && opt.sellHall === false && opt.sellPackaging !== true) return false
  return true
}

/** 회원앱 픽업 주문에 노출할 메뉴 — sell_member(미설정 시 포장·배달전용 규칙 폴백) */
export function isMemberPortalPickupMenu(menu: PosMenu, todayYmd: string): boolean {
  if (menu.isActive === false) return false
  if (isBanbanMenu(menu)) return false
  if (menu.soldOutDate && menu.soldOutDate === todayYmd) return false
  return menuSellMemberAllowed(menu)
}

/** 배달 전용(포장·홀 모두 off, 배달만 on) 세트 등 */
export function isDeliveryExclusiveMenu(menu: PosMenu): boolean {
  return menu.sellDelivery === true && menu.sellHall === false && menu.sellPackaging === false
}

export function filterMemberPortalPickupOptions(options: PosMenuOption[]): PosMenuOption[] {
  return (options || []).filter((o) => optionSellMemberAllowed(o))
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
