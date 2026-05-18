import { describe, expect, it } from "vitest"
import {
  buildMenuOptionsFromLinks,
  buildMenuOptionsFromLinksPerGroup,
  type PosMenuOptionGroupLinkRow,
  type PosOptionGroupItemRow,
  type PosOptionGroupRow,
} from "@/lib/pos-option-groups-build"

describe("buildMenuOptionsFromLinks", () => {
  it("combines multiple linked groups into rows with all step keys", () => {
    const groupsById = new Map<number, PosOptionGroupRow>([
      [1, { id: 1, group_key: "part", name: "Part", is_active: true, sort_order: 0 }],
      [2, { id: 2, group_key: "sidedish", name: "Side", is_active: true, sort_order: 1 }],
    ])
    const itemsByGroupId = new Map<number, PosOptionGroupItemRow[]>([
      [
        1,
        [
          {
            id: 10,
            group_id: 1,
            item_name: "Boneless",
            sort_order: 0,
            base_price_hall: 0,
            base_price_delivery: null,
            sell_hall: true,
            sell_delivery: true,
          },
          {
            id: 11,
            group_id: 1,
            item_name: "Wing",
            sort_order: 1,
            base_price_hall: 20,
            base_price_delivery: null,
            sell_hall: true,
            sell_delivery: true,
          },
        ],
      ],
      [
        2,
        [
          {
            id: 20,
            group_id: 2,
            item_name: "Kimchi",
            sort_order: 0,
            base_price_hall: 15,
            base_price_delivery: null,
            sell_hall: true,
            sell_delivery: true,
          },
        ],
      ],
    ])
    const links: PosMenuOptionGroupLinkRow[] = [
      {
        id: 1,
        menu_id: 99,
        group_id: 1,
        sort_order: 0,
        sell_hall: true,
        sell_delivery: true,
        price_hall_override: null,
        price_delivery_override: null,
        required: true,
        min_select: 1,
        max_select: 1,
      },
      {
        id: 2,
        menu_id: 99,
        group_id: 2,
        sort_order: 1,
        sell_hall: true,
        sell_delivery: true,
        price_hall_override: null,
        price_delivery_override: null,
        required: true,
        min_select: 1,
        max_select: 1,
      },
    ]

    const rows = buildMenuOptionsFromLinks(99, links, groupsById, itemsByGroupId, "C008")
    expect(rows).toHaveLength(2)
    const bonelessKimchi = rows.find((r) => r.optionStepValues.part === "Boneless")
    expect(bonelessKimchi?.optionStepValues.sidedish).toBe("Kimchi")
    expect(bonelessKimchi?.priceModifier).toBe(15)
    const wingKimchi = rows.find((r) => r.optionStepValues.part === "Wing")
    expect(wingKimchi?.priceModifier).toBe(35)
  })

  it("per-group build emits one row per item for Grab modifier groups", () => {
    const groupsById = new Map<number, PosOptionGroupRow>([
      [1, { id: 1, group_key: "part", name: "Part", is_active: true, sort_order: 0 }],
      [2, { id: 2, group_key: "sidedish", name: "Side", is_active: true, sort_order: 1 }],
    ])
    const itemsByGroupId = new Map<number, PosOptionGroupItemRow[]>([
      [
        1,
        [
          {
            id: 10,
            group_id: 1,
            item_name: "Boneless",
            sort_order: 0,
            base_price_hall: 0,
            base_price_delivery: null,
            sell_hall: true,
            sell_delivery: true,
          },
        ],
      ],
      [
        2,
        [
          {
            id: 20,
            group_id: 2,
            item_name: "Kimchi",
            sort_order: 0,
            base_price_hall: 15,
            base_price_delivery: null,
            sell_hall: true,
            sell_delivery: true,
          },
        ],
      ],
    ])
    const links: PosMenuOptionGroupLinkRow[] = [
      {
        id: 1,
        menu_id: 99,
        group_id: 1,
        sort_order: 0,
        sell_hall: true,
        sell_delivery: true,
        price_hall_override: null,
        price_delivery_override: null,
        required: true,
        min_select: 1,
        max_select: 1,
      },
      {
        id: 2,
        menu_id: 99,
        group_id: 2,
        sort_order: 1,
        sell_hall: true,
        sell_delivery: true,
        price_hall_override: null,
        price_delivery_override: null,
        required: true,
        min_select: 1,
        max_select: 1,
      },
    ]
    const perGroup = buildMenuOptionsFromLinksPerGroup(99, links, groupsById, itemsByGroupId)
    expect(perGroup).toHaveLength(2)
    expect(perGroup.map((r) => r.optionStepValues)).toEqual([
      { part: "Boneless" },
      { sidedish: "Kimchi" },
    ])
    expect(perGroup.find((r) => r.optionStepValues.part === "Boneless")?.priceModifier).toBe(0)
    expect(perGroup.find((r) => r.optionStepValues.sidedish === "Kimchi")?.priceModifier).toBe(15)
  })
})
