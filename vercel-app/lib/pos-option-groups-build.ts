export type PosOptionGroupRow = {
  id: number
  group_key: string
  group_code?: string | null
  name: string
  is_active: boolean
  sort_order: number
}

export type PosOptionGroupItemRow = {
  id: number
  group_id: number
  item_name: string
  sort_order: number
  base_price_hall: number
  base_price_delivery: number | null
  sell_hall: boolean
  sell_delivery: boolean
}

export type PosMenuOptionGroupLinkRow = {
  id: number
  menu_id: number
  group_id: number
  sort_order: number
  sell_hall: boolean
  sell_delivery: boolean
  price_hall_override: number | null
  price_delivery_override: number | null
  required: boolean
  min_select: number
  max_select: number
}

export function buildSelectionConfigFromLinks(
  links: PosMenuOptionGroupLinkRow[],
  groupsById: Map<number, PosOptionGroupRow>
) {
  const sorted = [...links].sort((a, b) => {
    const ao = Number(a.sort_order || 0)
    const bo = Number(b.sort_order || 0)
    if (ao !== bo) return ao - bo
    return Number(a.id || 0) - Number(b.id || 0)
  })
  const optionSelectionGroups: string[] = []
  const optionSelectionConfig: {
    key: string
    label: string
    audience: "all" | "hall" | "delivery"
    required: boolean
    minSelect: number
    maxSelect: number
  }[] = []
  for (const link of sorted) {
    const group = groupsById.get(Number(link.group_id || 0))
    if (!group) continue
    const key = String(group.group_key || "").trim()
    if (!key) continue
    if (!optionSelectionGroups.includes(key)) optionSelectionGroups.push(key)
    const hall = link.sell_hall !== false
    const delivery = link.sell_delivery !== false
    const audience: "all" | "hall" | "delivery" =
      hall && delivery ? "all" : hall ? "hall" : "delivery"
    optionSelectionConfig.push({
      key,
      label: String(group.name || key),
      audience,
      required: link.required !== false,
      minSelect: Math.max(0, Number(link.min_select ?? 0)),
      maxSelect: Math.max(1, Number(link.max_select ?? 1)),
    })
  }
  return { optionSelectionGroups, optionSelectionConfig }
}

type BuiltLinkedMenuOption = {
  id: string
  menuId: string
  optionCode?: string
  name: string
  priceModifier: number
  priceModifierDelivery: number | null
  priceModifierPackaging: number | null
  sortOrder: number
  optionType: "substitution"
  optionStepValues: Record<string, string>
  sellHall: boolean
  sellDelivery: boolean
  sellPackaging: boolean
}

type LinkSlice = {
  groupId: number
  groupKey: string
  link: PosMenuOptionGroupLinkRow
  items: PosOptionGroupItemRow[]
}

function hallAndDeliveryPriceForLinkItem(
  link: PosMenuOptionGroupLinkRow,
  item: PosOptionGroupItemRow
): { hall: number; delivery: number } {
  const hallBase = Number(item.base_price_hall ?? 0) || 0
  const deliveryBase =
    item.base_price_delivery != null ? Number(item.base_price_delivery) : hallBase
  return {
    hall: link.price_hall_override != null ? Number(link.price_hall_override) : hallBase,
    delivery:
      link.price_delivery_override != null ? Number(link.price_delivery_override) : deliveryBase,
  }
}

/** Grab 등 그룹별 modifier: 그룹·품목당 1행(단일 step key), 그룹별 가격만 반영 */
export function buildMenuOptionsFromLinksPerGroup(
  menuId: number,
  links: PosMenuOptionGroupLinkRow[],
  groupsById: Map<number, PosOptionGroupRow>,
  itemsByGroupId: Map<number, PosOptionGroupItemRow[]>,
  menuCode?: string
): BuiltLinkedMenuOption[] {
  const sortedLinks = [...links].sort((a, b) => {
    const ao = Number(a.sort_order || 0)
    const bo = Number(b.sort_order || 0)
    if (ao !== bo) return ao - bo
    return Number(a.id || 0) - Number(b.id || 0)
  })
  const out: BuiltLinkedMenuOption[] = []
  let sortCursor = 0
  for (const link of sortedLinks) {
    const gid = Number(link.group_id || 0)
    const group = groupsById.get(gid)
    if (!group) continue
    const groupKey = String(group.group_key || "").trim()
    if (!groupKey) continue
    const items = itemsByGroupId.get(gid) || []
    const sortedItems = [...items].sort((a, b) => {
      const ao = Number(a.sort_order || 0)
      const bo = Number(b.sort_order || 0)
      if (ao !== bo) return ao - bo
      return Number(a.id || 0) - Number(b.id || 0)
    })
    for (const item of sortedItems) {
      const prices = hallAndDeliveryPriceForLinkItem(link, item)
      const idx = sortCursor++
      out.push({
        id: `g${gid}-i${item.id}`,
        menuId: String(menuId),
        optionCode: menuCode ? `${menuCode}-${idx + 1}` : undefined,
        name: String(item.item_name || ""),
        priceModifier: prices.hall,
        priceModifierDelivery: prices.delivery,
        priceModifierPackaging: null,
        sortOrder: idx,
        optionType: "substitution",
        optionStepValues: { [groupKey]: String(item.item_name || "") },
        sellHall: link.sell_hall !== false && item.sell_hall !== false,
        sellDelivery: link.sell_delivery !== false && item.sell_delivery !== false,
        sellPackaging: link.sell_hall !== false && item.sell_hall !== false,
      })
    }
  }
  return out
}

/** 연결된 그룹이 2개 이상이면 단계 조합(곱집합) 행을 만든다 — POS 다단계 선택·장바구니 매칭용 */
export function buildMenuOptionsFromLinks(
  menuId: number,
  links: PosMenuOptionGroupLinkRow[],
  groupsById: Map<number, PosOptionGroupRow>,
  itemsByGroupId: Map<number, PosOptionGroupItemRow[]>,
  menuCode?: string
): BuiltLinkedMenuOption[] {
  const sortedLinks = [...links].sort((a, b) => {
    const ao = Number(a.sort_order || 0)
    const bo = Number(b.sort_order || 0)
    if (ao !== bo) return ao - bo
    return Number(a.id || 0) - Number(b.id || 0)
  })

  const slices: LinkSlice[] = []
  for (const link of sortedLinks) {
    const gid = Number(link.group_id || 0)
    const group = groupsById.get(gid)
    if (!group) continue
    const groupKey = String(group.group_key || "").trim()
    if (!groupKey) continue
    const items = itemsByGroupId.get(gid) || []
    const sortedItems = [...items].sort((a, b) => {
      const ao = Number(a.sort_order || 0)
      const bo = Number(b.sort_order || 0)
      if (ao !== bo) return ao - bo
      return Number(a.id || 0) - Number(b.id || 0)
    })
    if (sortedItems.length === 0) continue
    slices.push({ groupId: gid, groupKey, link, items: sortedItems })
  }

  if (slices.length === 0) return []

  type ComboPiece = {
    groupKey: string
    groupId: number
    item: PosOptionGroupItemRow
    link: PosMenuOptionGroupLinkRow
  }
  let combos: ComboPiece[][] = [[]]
  for (const slice of slices) {
    const next: ComboPiece[][] = []
    for (const base of combos) {
      for (const item of slice.items) {
        next.push([
          ...base,
          { groupKey: slice.groupKey, groupId: slice.groupId, item, link: slice.link },
        ])
      }
    }
    combos = next
  }

  const out: BuiltLinkedMenuOption[] = []
  let sortCursor = 0
  for (const combo of combos) {
    const stepValues: Record<string, string> = {}
    const nameParts: string[] = []
    let hallTotal = 0
    let deliveryTotal = 0
    let sellHall = true
    let sellDelivery = true
    const idParts: string[] = [`m${menuId}`]

    for (const piece of combo) {
      const itemName = String(piece.item.item_name || "").trim()
      stepValues[piece.groupKey] = itemName
      if (itemName) nameParts.push(itemName)
      const prices = hallAndDeliveryPriceForLinkItem(piece.link, piece.item)
      hallTotal += prices.hall
      deliveryTotal += prices.delivery
      sellHall = sellHall && piece.link.sell_hall !== false && piece.item.sell_hall !== false
      sellDelivery = sellDelivery && piece.link.sell_delivery !== false && piece.item.sell_delivery !== false
      idParts.push(`g${piece.groupId}i${piece.item.id}`)
    }

    const idx = sortCursor++
    out.push({
      id: idParts.join("-"),
      menuId: String(menuId),
      optionCode: menuCode ? `${menuCode}-${idx + 1}` : undefined,
      name: nameParts.join(" - ") || Object.values(stepValues).join(" - "),
      priceModifier: hallTotal,
      priceModifierDelivery: deliveryTotal,
      priceModifierPackaging: null,
      sortOrder: idx,
      optionType: "substitution",
      optionStepValues: stepValues,
      sellHall,
      sellDelivery,
      sellPackaging: sellHall,
    })
  }
  return out
}
