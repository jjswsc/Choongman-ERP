import { describe, expect, it } from "vitest"
import type { PosMenu, PosMenuOption } from "@/lib/api-client"
import {
  collectPickupMenuListPrices,
  resolvePickupMenuListPriceLabel,
} from "@/lib/member-portal-pickup-menu-filter"

const menu = (partial: Partial<PosMenu> & Pick<PosMenu, "id" | "name" | "code">): PosMenu => ({
  category: "Chicken",
  categoryMain: "Chicken",
  price: 149,
  imageUrl: "",
  vatIncluded: true,
  isActive: true,
  sortOrder: 0,
  ...partial,
})

const opt = (partial: Partial<PosMenuOption> & Pick<PosMenuOption, "id" | "menuId" | "name">): PosMenuOption => ({
  optionType: "substitution",
  priceModifier: 0,
  sellPackaging: true,
  ...partial,
})

describe("collectPickupMenuListPrices", () => {
  it("옵션 없는 메뉴는 기본가만", () => {
    const prices = collectPickupMenuListPrices(menu({ id: "1", name: "Ice", code: "D001", price: 20 }), [])
    expect(prices).toEqual([20])
  })

  it("치킨 M 옵션만 있어도 S 기본가(최저)를 포함한다", () => {
    const m = menu({
      id: "9",
      name: "GARLIC Bar.B.Q FRIED CHICKEN",
      code: "C010",
      category: "Bar.B.Q",
      price: 149,
      optionSelectionGroups: ["size", "sidedish"],
    })
    const options = [
      opt({ id: "m1", menuId: "9", name: "M - Boneless", priceModifier: 100, priceModifierPackaging: 100 }),
      opt({ id: "m2", menuId: "9", name: "M - Joint Wing", priceModifier: 100, priceModifierPackaging: 100 }),
    ]
    const prices = collectPickupMenuListPrices(m, options)
    expect(Math.min(...prices)).toBe(149)
    expect(Math.max(...prices)).toBe(249)
  })

  it("옵션별 가격이 다르면 최저·최대 모두 반영", () => {
    const m = menu({ id: "2", name: "CURRY Bar.B.Q", code: "C023", category: "Bar.B.Q", price: 149 })
    const options = [
      opt({ id: "a", menuId: "2", name: "M - Boneless", priceModifier: 100 }),
      opt({ id: "b", menuId: "2", name: "L - Boneless", priceModifier: 150 }),
    ]
    const prices = collectPickupMenuListPrices(m, options)
    expect(Math.min(...prices)).toBe(149)
    expect(Math.max(...prices)).toBe(299)
  })
})

describe("resolvePickupMenuListPriceLabel", () => {
  const formatBaht = (n: number) => `฿${Math.round(n)}`

  it("범위가 있으면 en-dash로 표시", () => {
    const label = resolvePickupMenuListPriceLabel(
      menu({ id: "9", name: "GARLIC", code: "C010", category: "Bar.B.Q", price: 149 }),
      [opt({ id: "m1", menuId: "9", name: "M - Boneless", priceModifier: 100 })],
      formatBaht
    )
    expect(label).toBe("฿149 – ฿249")
  })

  it("단일 가격이면 하나만 표시", () => {
    const label = resolvePickupMenuListPriceLabel(
      menu({ id: "3", name: "Aquafina", code: "D002", price: 20 }),
      [],
      formatBaht
    )
    expect(label).toBe("฿20")
  })
})
