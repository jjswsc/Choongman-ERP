import type { PosMenu, PosMenuOption } from "@/lib/api-client"
import { resolveOptionCode } from "./pos-menus-page-helpers"

type Translate = (key: string) => string

export type PosMenuExportRow = Record<string, string | number>

export function emptyPosMenuOptionExportCols() {
  return {
    menuId: "",
    menuCode: "",
    menuName: "",
    optionId: "",
    optionCode: "",
    optionName: "",
    sortOrder: "",
    priceModifierHall: "",
    priceModifierDelivery: "",
    priceModifierPackaging: "",
    optionType: "",
    itemCode: "",
    additiveSourceMenuId: "",
    quantity: "",
    sellHall: "",
    sellDelivery: "",
    sellPackaging: "",
    optionDescriptionDefault: "",
    optionDescriptionDelivery: "",
    optionDescriptionTable: "",
    optionStepValues: "",
  }
}

export function posMenuOptionExportCols(opt: PosMenuOption, menu: PosMenu, t: Translate) {
  const optionCode = resolveOptionCode(opt, menu?.code)
  return {
    menuId: opt.menuId ?? "",
    menuCode: menu?.code ?? "",
    menuName: menu?.name ?? "",
    optionId: opt.id ?? "",
    optionCode,
    optionName: opt.name ?? "",
    sortOrder: opt.sortOrder ?? 0,
    priceModifierHall: Number(opt.priceModifier ?? 0),
    priceModifierDelivery: Number(opt.priceModifierDelivery ?? 0),
    priceModifierPackaging: Number(opt.priceModifierPackaging ?? 0),
    optionType: opt.optionType ?? "",
    itemCode: opt.itemCode ?? "",
    additiveSourceMenuId: opt.additiveSourceMenuId ?? "",
    quantity: opt.quantity ?? "",
    sellHall: opt.sellHall === false ? (t("no") || "N") : (t("yes") || "Y"),
    sellDelivery: opt.sellDelivery === false ? (t("no") || "N") : (t("yes") || "Y"),
    sellPackaging: opt.sellPackaging === false ? (t("no") || "N") : (t("yes") || "Y"),
    optionDescriptionDefault: opt.descriptionDefault ?? "",
    optionDescriptionDelivery: opt.descriptionDelivery ?? "",
    optionDescriptionTable: opt.descriptionTable ?? "",
    optionStepValues: opt.optionStepValues ? JSON.stringify(opt.optionStepValues) : "",
  }
}

export function posMenuExportMenuCols(m: PosMenu, t: Translate) {
  return {
    [t("itemsColCode") || "코드"]: m.code ?? "",
    [t("posMenuName") || "메뉴명"]: m.name ?? "",
    [t("posMenuCategoryMain") || "대분류"]: m.categoryMain ?? "",
    [t("posMenuCategory") || "카테고리"]: m.category ?? "",
    [t("posMenuPriceHall") || "홀 가격"]: Number(m.price ?? 0),
    [t("posMenuPriceDelivery") || "배달 가격"]: Number(m.priceDelivery ?? 0),
    [t("posMenuVatIncluded") || "부가세 포함"]: m.vatIncluded ? (t("yes") || "Y") : (t("no") || "N"),
    [t("posMenuActive") || "활성"]: m.isActive ? (t("yes") || "Y") : (t("no") || "N"),
  }
}

export function posMenuExportDetailedMenuCols(m: PosMenu, t: Translate) {
  return {
    id: m.id ?? "",
    [t("itemsColCode") || "코드"]: m.code ?? "",
    [t("posMenuName") || "메뉴명"]: m.name ?? "",
    [t("posMenuCategoryMain") || "대분류"]: m.categoryMain ?? "",
    [t("posMenuCategory") || "카테고리"]: m.category ?? "",
    [t("posMenuPriceHall") || "홀 가격"]: Number(m.price ?? 0),
    [t("posMenuPriceDelivery") || "배달 가격"]: Number(m.priceDelivery ?? 0),
    [t("posMenuVatIncluded") || "부가세 포함"]: m.vatIncluded ? (t("yes") || "Y") : (t("no") || "N"),
    [t("posMenuActive") || "활성"]: m.isActive ? (t("yes") || "Y") : (t("no") || "N"),
    soldOutDate: m.soldOutDate ?? "",
    isBanban: m.isBanban ? (t("yes") || "Y") : (t("no") || "N"),
    promoId: m.promoId ?? "",
    kitchenPrinter: m.kitchenPrinter ?? "",
    cookingTimeMin: m.cookingTimeMin ?? "",
    optionSelectionGroups: Array.isArray(m.optionSelectionGroups) ? m.optionSelectionGroups.join(", ") : "",
    descriptionDefault: m.descriptionDefault ?? "",
    descriptionDelivery: m.descriptionDelivery ?? "",
    descriptionTable: m.descriptionTable ?? "",
    imageUrl: m.imageUrl ?? "",
  }
}

/** 메뉴 순서대로 메뉴 1행(옵션 없음) 또는 옵션마다 1행. 옵션은 sortOrder 순 */
export function buildPosMenuExportRows(
  menus: PosMenu[],
  allOptions: PosMenuOption[],
  t: Translate,
  menuCols: (m: PosMenu, t: Translate) => PosMenuExportRow
): PosMenuExportRow[] {
  const rowKindCol = t("posMenuExportRowKind") || "행 구분"
  const rowKindMenu = t("posMenuExportRowMenu") || "메뉴"
  const rowKindOption = t("posMenuExportRowOption") || "옵션"
  const menuIdSet = new Set(menus.map((m) => m.id))
  const optionsByMenu = new Map<string, PosMenuOption[]>()
  for (const opt of allOptions) {
    if (opt.menuId == null || opt.menuId === "" || !menuIdSet.has(opt.menuId)) continue
    const arr = optionsByMenu.get(opt.menuId) ?? []
    arr.push(opt)
    optionsByMenu.set(opt.menuId, arr)
  }
  for (const [, list] of optionsByMenu) {
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }

  const unifiedRows: PosMenuExportRow[] = []
  for (const m of menus) {
    const opts = optionsByMenu.get(m.id) ?? []
    const base = menuCols(m, t)
    if (opts.length === 0) {
      unifiedRows.push({ [rowKindCol]: rowKindMenu, ...base, ...emptyPosMenuOptionExportCols() })
      continue
    }
    for (const opt of opts) {
      unifiedRows.push({
        [rowKindCol]: rowKindOption,
        ...base,
        ...posMenuOptionExportCols(opt, m, t),
      })
    }
  }
  return unifiedRows
}
