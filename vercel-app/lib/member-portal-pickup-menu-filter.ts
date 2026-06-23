import type { PosMenu, PosMenuOption } from "@/lib/api-client"
import { isBanbanMenu } from "@/lib/pos-banban-utils"
import { computeChickenMultistepRowPrice } from "@/lib/pos-chicken-option-inference"
import { resolveChickenOptionPickerPlan } from "@/lib/pos-chicken-option-picker-plan"

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

function roundMenuPrice(n: number): number {
  return Math.round(Math.max(0, Number(n) || 0) * 100) / 100
}

function pushMenuPrice(prices: Set<number>, value: number): void {
  prices.add(roundMenuPrice(value))
}

/** 회원앱 픽업 메뉴 목록 — 주문 가능한 모든 가격 후보(기본가·옵션·2단계 조합) */
export function collectPickupMenuListPrices(menu: PosMenu, options: PosMenuOption[]): number[] {
  const base = packagingMenuBasePrice(menu)
  const filtered = filterMemberPortalPickupOptions(options)
  const prices = new Set<number>()
  pushMenuPrice(prices, base)

  const subs = filtered.filter((o) => o.optionType === "substitution" || o.optionType == null)
  for (const opt of subs) {
    pushMenuPrice(prices, base + packagingOptionPriceModifier(opt))
  }

  if (filtered.length === 0 && (menu.optionSelectionGroups?.length ?? 0) === 0) {
    return Array.from(prices)
  }

  const noopT = () => ""
  const basePlan = resolveChickenOptionPickerPlan({
    menu,
    options: filtered,
    orderType: "takeout",
    twoPhasePhase: null,
    optionPickerStep: 0,
    optionPickerSelections: {},
    t: noopT,
  })

  for (const opt of basePlan.flatListOpts) {
    if (opt.optionType === "substitution" || opt.optionType == null) {
      pushMenuPrice(prices, base + packagingOptionPriceModifier(opt))
    }
  }

  if (basePlan.multistep?.usePriceList && basePlan.multistep.priceListRows.length > 0) {
    const { groupKey, priceListRows } = basePlan.multistep
    for (const row of priceListRows) {
      pushMenuPrice(
        prices,
        computeChickenMultistepRowPrice({
          menuBasePrice: base,
          groupKey,
          option: row.option,
          groups: basePlan.activeStepGroups,
          menuCode: menu.code,
          pendingSelections: {},
          optionsWithSteps: basePlan.optsWithStepsToShow,
          getOptionModifier: packagingOptionPriceModifier,
        })
      )
    }
  }

  return Array.from(prices)
}

export function resolvePickupMenuListPriceLabel(
  menu: PosMenu,
  options: PosMenuOption[],
  formatBaht: (n: number) => string
): string {
  const totals = collectPickupMenuListPrices(menu, options)
  if (totals.length === 0) return formatBaht(packagingMenuBasePrice(menu))
  const min = Math.min(...totals)
  const max = Math.max(...totals)
  if (min === max) return formatBaht(min)
  return `${formatBaht(min)} – ${formatBaht(max)}`
}
