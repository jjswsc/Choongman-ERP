import { resolveCartLineQuantityForSave } from '@/lib/pos-order-item-map'
import type { KitchenSlipRoutingItem } from '@/lib/pos-kitchen-slip-routing'

export type KitchenSlipPrintLine = {
  name: string
  qty: number
  note?: string
  cancelled?: boolean
  /** 홀 주문서와 동일: 세트 구성품을 `- 메뉴명 (옵션) x수량` 줄로 */
  promoComposeLines?: string[]
}

type PromoSnapshot = NonNullable<KitchenSlipRoutingItem['promoItems']>[number]

function normalizePromoParentKey(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** `[CODE] [세트명] 구성메뉴` 또는 `[세트명] 구성메뉴` 분리 */
export function parseKitchenSplitPromoLineName(rawName: string): {
  codePrefix: string
  parentLabel: string
  childLabel: string
} | null {
  let rest = String(rawName ?? '').trim()
  if (!rest) return null
  let codePrefix = ''
  const codeLead = rest.match(/^(\[[^\]]+\]\s*)(?=\[)/u)
  if (codeLead) {
    codePrefix = codeLead[1]
    rest = rest.slice(codeLead[1].length).trim()
  }
  const promo = /^\[([^\]]+)\]\s*(.+)$/u.exec(rest)
  if (!promo) return null
  const parentLabel = String(promo[1] ?? '').trim()
  const childLabel = String(promo[2] ?? '').trim()
  if (!parentLabel || !childLabel) return null
  return { codePrefix, parentLabel, childLabel }
}

function formatPromoComposeLine(
  p: PromoSnapshot,
  menuNameByMenuId?: Record<string, string>
): string {
  const menuName =
    String((p as { menuName?: unknown }).menuName ?? '').trim() ||
    (menuNameByMenuId && p.menuId ? String(menuNameByMenuId[p.menuId] ?? '').trim() : '') ||
    (p.menuId ? `#${p.menuId}` : '')
  const optName = String((p as { optionName?: unknown }).optionName ?? '').trim()
  const optLabel = optName ? ` (${optName})` : ''
  return `${menuName}${optLabel} x${Math.max(1, Number(p.quantity) || 1)}`
}

function promoComposeFromOrderParent(
  parent: KitchenSlipRoutingItem,
  menuNameByMenuId?: Record<string, string>
): string[] {
  const pi = parent.promoItems
  if (!Array.isArray(pi) || pi.length === 0) return []
  return pi.slice(0, 12).map((p) => formatPromoComposeLine(p, menuNameByMenuId))
}

function promoComposeFromSplitChildren(
  children: KitchenSlipRoutingItem[],
  menuNameByMenuId?: Record<string, string>
): string[] {
  const lines: string[] = []
  for (const ch of children) {
    const parsed = parseKitchenSplitPromoLineName(String(ch.name ?? ''))
    if (!parsed) continue
    const childLabel = parsed.childLabel
    const optMatch = /^(.+?)\s+\(([^)]+)\)\s*$/u.exec(childLabel)
    const routeMid = String((ch as { kitchenRouteMenuId?: string }).kitchenRouteMenuId ?? '').trim()
    const menuNameFromId =
      routeMid && menuNameByMenuId ? String(menuNameByMenuId[routeMid] ?? '').trim() : ''
    const menuName = menuNameFromId || (optMatch ? optMatch[1].trim() : childLabel)
    const optName = optMatch ? optMatch[2].trim() : ''
    const optLabel = optName ? ` (${optName})` : ''
    const parentQty = Math.max(
      1,
      Number(
        (ch as { kitchenPromoParentQty?: number }).kitchenPromoParentQty ??
          resolveCartLineQuantityForSave(ch as { qty?: unknown; quantity?: unknown })
      ) || 1
    )
    const lineQty = Math.max(0.0001, Number(ch.qty ?? 1) || 1)
    const componentQty = Math.max(1, Math.round(lineQty / parentQty) || 1)
    lines.push(`${menuName}${optLabel} x${componentQty}`)
  }
  return lines
}

function resolveParentOrderItem(
  groupId: string,
  parentLabel: string,
  orderById: Map<string, KitchenSlipRoutingItem>,
  orderByParentKey: Map<string, KitchenSlipRoutingItem>
): KitchenSlipRoutingItem | undefined {
  if (groupId && orderById.has(groupId)) return orderById.get(groupId)
  const key = normalizePromoParentKey(parentLabel)
  if (key && orderByParentKey.has(key)) return orderByParentKey.get(key)
  return undefined
}

/**
 * 주방 라우팅으로 펼쳐진 `[세트] 구성` 줄을 홀 주문서처럼 세트 헤더 + 구성품 목록으로 묶는다.
 * `orderItems`에 promoItems 스냅샷이 있으면 라우팅에서 빠진 구성(밥·음료 등)도 함께 표기한다.
 */
export function buildKitchenHallStyleSlipLines(
  slipItems: KitchenSlipRoutingItem[],
  opts?: {
    orderItems?: KitchenSlipRoutingItem[]
    menuNameByMenuId?: Record<string, string>
  }
): KitchenSlipPrintLine[] {
  const orderItems = opts?.orderItems ?? []
  const menuNameByMenuId = opts?.menuNameByMenuId

  const orderById = new Map<string, KitchenSlipRoutingItem>()
  const orderByParentKey = new Map<string, KitchenSlipRoutingItem>()
  for (const it of orderItems) {
    const id = String(it.id ?? '').trim()
    if (id) orderById.set(id, it)
    const pi = it.promoItems
    if (Array.isArray(pi) && pi.length > 0) {
      const key = normalizePromoParentKey(String(it.name ?? ''))
      if (key) orderByParentKey.set(key, it)
    }
  }

  type PromoGroup = {
    groupId: string
    parentLabel: string
    parentQty: number
    children: KitchenSlipRoutingItem[]
    codePrefix: string
  }
  const promoGroups = new Map<string, PromoGroup>()
  const regular: KitchenSlipRoutingItem[] = []

  for (const it of slipItems) {
    const groupId = String((it as { kitchenPromoGroupId?: string }).kitchenPromoGroupId ?? '').trim()
    const metaParent = String((it as { kitchenPromoParentName?: string }).kitchenPromoParentName ?? '').trim()
    const parsed = parseKitchenSplitPromoLineName(String(it.name ?? ''))
    if (groupId || metaParent || parsed) {
      const parentLabel = metaParent || parsed?.parentLabel || ''
      const key = groupId || normalizePromoParentKey(parentLabel)
      if (!key) {
        regular.push(it)
        continue
      }
      const prev = promoGroups.get(key)
      const parentQty = Math.max(
        1,
        Number(
          (it as { kitchenPromoParentQty?: number }).kitchenPromoParentQty ??
            prev?.parentQty ??
            resolveCartLineQuantityForSave(it as { qty?: unknown; quantity?: unknown })
        ) || 1
      )
      const codePrefix = parsed?.codePrefix ?? prev?.codePrefix ?? ''
      const g: PromoGroup = prev ?? {
        groupId: groupId || key,
        parentLabel,
        parentQty,
        children: [],
        codePrefix,
      }
      g.children.push(it)
      g.parentQty = parentQty
      if (!g.parentLabel && parentLabel) g.parentLabel = parentLabel
      if (!g.codePrefix && codePrefix) g.codePrefix = codePrefix
      promoGroups.set(key, g)
      continue
    }

    const pi = it.promoItems
    if (Array.isArray(pi) && pi.length > 0) {
      const key = String(it.id ?? normalizePromoParentKey(String(it.name ?? ''))).trim()
      promoGroups.set(key, {
        groupId: key,
        parentLabel: String(it.name ?? '').trim(),
        parentQty: Math.max(
          1,
          resolveCartLineQuantityForSave(it as { qty?: unknown; quantity?: unknown }) || 1
        ),
        children: [],
        codePrefix: '',
      })
      continue
    }

    regular.push(it)
  }

  const out: KitchenSlipPrintLine[] = []

  for (const g of promoGroups.values()) {
    const parentOrder = resolveParentOrderItem(g.groupId, g.parentLabel, orderById, orderByParentKey)
    const parentName = String(parentOrder?.name ?? g.parentLabel).trim() || g.parentLabel
    const displayParentName = `${g.codePrefix}${parentName}`.trim()
    const parentQty = Math.max(
      1,
      Number(
        parentOrder
          ? resolveCartLineQuantityForSave(
              parentOrder as { qty?: unknown; quantity?: unknown }
            )
          : g.parentQty
      ) || 1
    )
    const fromOrder = parentOrder ? promoComposeFromOrderParent(parentOrder, menuNameByMenuId) : []
    const fromChildren = promoComposeFromSplitChildren(g.children, menuNameByMenuId)
    const promoComposeLines = fromOrder.length > 0 ? fromOrder : fromChildren
    const noteParts = g.children
      .map((ch) => String(ch.note ?? '').trim())
      .filter(Boolean)
    const note = noteParts.length ? [...new Set(noteParts)].join(' · ') : undefined
    const cancelled =
      g.children.length > 0 &&
      g.children.every((ch) => Boolean((ch as { kitchenLineCancelled?: boolean }).kitchenLineCancelled))
    out.push({
      name: displayParentName,
      qty: parentQty,
      ...(note ? { note } : {}),
      ...(cancelled ? { cancelled: true } : {}),
      ...(promoComposeLines.length > 0 ? { promoComposeLines } : {}),
    })
  }

  for (const it of regular) {
    const pi = it.promoItems
    if (Array.isArray(pi) && pi.length > 0) {
      const promoComposeLines = promoComposeFromOrderParent(it, menuNameByMenuId)
      out.push({
        name: String(it.name ?? '').trim(),
        qty: Math.max(1, resolveCartLineQuantityForSave(it as { qty?: unknown; quantity?: unknown }) || 1),
        ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
        ...(promoComposeLines.length > 0 ? { promoComposeLines } : {}),
      })
      continue
    }
    out.push({
      name: String(it.name ?? '').trim(),
      qty: Math.max(1, Number(it.qty ?? 1) || 1),
      ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
      ...((it as { kitchenLineCancelled?: boolean }).kitchenLineCancelled
        ? { cancelled: true }
        : {}),
    })
  }

  return out
}

export function mapKitchenSlipGroupItemsForPrint(
  slipItems: KitchenSlipRoutingItem[],
  opts: {
    orderItems?: KitchenSlipRoutingItem[]
    menuNameByMenuId?: Record<string, string>
    translateName: (name: string) => string
    formatNote?: (note?: string) => string | undefined
    cancelled?: boolean
  }
): KitchenSlipPrintLine[] {
  const hallLines = buildKitchenHallStyleSlipLines(slipItems, {
    orderItems: opts.orderItems,
    menuNameByMenuId: opts.menuNameByMenuId,
  })
  return hallLines.map((row) => ({
    name: opts.translateName(row.name),
    qty: row.qty,
    ...(row.promoComposeLines?.length
      ? {
          promoComposeLines: row.promoComposeLines.map((line) => opts.translateName(line)),
        }
      : {}),
    ...(opts.formatNote && row.note
      ? { note: opts.formatNote(row.note) }
      : row.note
        ? { note: row.note }
        : {}),
    ...((opts.cancelled ?? row.cancelled) ? { cancelled: true } : {}),
  }))
}
