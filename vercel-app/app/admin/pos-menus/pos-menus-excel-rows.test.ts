import { describe, expect, it } from "vitest"
import type { PosMenu, PosMenuOption } from "@/lib/api-client"
import {
  buildPosMenuExportRows,
  posMenuExportDetailedMenuCols,
  posMenuExportMenuCols,
} from "./pos-menus-excel-rows"

const t = (_key: string) => ""

function menu(over: Partial<PosMenu>): PosMenu {
  return {
    id: "m1",
    code: "A001",
    name: "Fried chicken",
    categoryMain: "Chicken",
    category: "Set",
    price: 199,
    priceDelivery: 229,
    vatIncluded: true,
    isActive: true,
    ...over,
  } as PosMenu
}

function option(over: Partial<PosMenuOption>): PosMenuOption {
  return { id: "o1", menuId: "m1", name: "Extra sauce", sortOrder: 1, priceModifier: 10, ...over } as PosMenuOption
}

describe("buildPosMenuExportRows", () => {
  it("writes one menu row with empty option columns when the menu has no options", () => {
    const rows = buildPosMenuExportRows([menu({})], [], t, posMenuExportMenuCols)
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]!).slice(0, 9)).toEqual([
      "행 구분",
      "코드",
      "메뉴명",
      "대분류",
      "카테고리",
      "홀 가격",
      "배달 가격",
      "부가세 포함",
      "활성",
    ])
    expect(rows[0]!["행 구분"]).toBe("메뉴")
    expect(rows[0]!["홀 가격"]).toBe(199)
    expect(rows[0]!.optionName).toBe("")
  })

  it("writes one row per option in sortOrder and ignores options of other menus", () => {
    const rows = buildPosMenuExportRows(
      [menu({})],
      [
        option({ id: "o2", name: "Cheese", sortOrder: 2 }),
        option({ id: "o1", name: "Extra sauce", sortOrder: 1, sellDelivery: false }),
        option({ id: "x", menuId: "other", name: "Other menu option" }),
        option({ id: "y", menuId: "", name: "No menu" }),
      ],
      t,
      posMenuExportMenuCols
    )
    expect(rows.map((r) => r.optionName)).toEqual(["Extra sauce", "Cheese"])
    expect(rows[0]!["행 구분"]).toBe("옵션")
    expect(rows[0]!.menuCode).toBe("A001")
    expect(rows[0]!.priceModifierHall).toBe(10)
    expect(rows[0]!.sellHall).toBe("Y")
    expect(rows[0]!.sellDelivery).toBe("N")
  })

  it("keeps the menu order given by the caller", () => {
    const rows = buildPosMenuExportRows(
      [menu({ id: "m2", code: "B001" }), menu({ id: "m1", code: "A001" })],
      [],
      t,
      posMenuExportMenuCols
    )
    expect(rows.map((r) => r["코드"])).toEqual(["B001", "A001"])
  })

  it("adds id and kitchen columns in the detailed export", () => {
    const rows = buildPosMenuExportRows(
      [menu({ kitchenPrinter: 2, optionSelectionGroups: ["size", "part"] })],
      [],
      t,
      posMenuExportDetailedMenuCols
    )
    expect(Object.keys(rows[0]!).slice(0, 3)).toEqual(["행 구분", "id", "코드"])
    expect(rows[0]!.kitchenPrinter).toBe(2)
    expect(rows[0]!.optionSelectionGroups).toBe("size, part")
  })
})
