import {
  collectGrabPrintOptionLines,
  enrichGrabPromoItemsForPrint,
  formatGrabOptionFragmentForPrint,
  formatGrabOrderLineNoteForPrint,
  formatGrabPromoComposeLinesForPrint,
  isGrabInboundPosOrder,
  isLikelyPosOptionCode,
} from '@/lib/grab-pos-order-enrich'
import { resolveCartLineQuantityForSave } from '@/lib/pos-order-item-map'
import { splitPosPrintItemLine, stripLeadingPrintCodeBrackets } from '@/lib/pos-print-item-line'
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
    .replace(/[\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
}

function stripOneLeadingBracketTag(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/^\[[^\]]+\]\s*/u, '')
    .trim()
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

function resolvePromoOptionLabel(
  p: PromoSnapshot,
  optionNameByCode?: Map<string, string> | Record<string, string>
): string {
  const direct = String((p as { optionName?: unknown }).optionName ?? '').trim()
  if (direct) return direct
  const optCode = String((p as { optionCode?: unknown }).optionCode ?? '').trim()
  if (optCode) {
    const labels = formatGrabOrderLineNoteForPrint(`optc:${optCode}`, optionNameByCode)
    if (labels) return labels
  }
  return ''
}

function formatPromoComposeLine(
  p: PromoSnapshot,
  menuNameByMenuId?: Record<string, string>,
  optionNameByCode?: Map<string, string> | Record<string, string>,
  grabSplit?: boolean,
  parentItemName?: string,
  menuCodeByMenuId?: Record<string, string>
): string[] {
  const menuName =
    String((p as { menuName?: unknown }).menuName ?? '').trim() ||
    (menuNameByMenuId && p.menuId ? String(menuNameByMenuId[p.menuId] ?? '').trim() : '') ||
    (p.menuId ? `#${p.menuId}` : '')
  const rows =
    grabSplit && menuCodeByMenuId
      ? enrichGrabPromoItemsForPrint(
          [
            {
              menuId: String(p.menuId ?? ''),
              optionId: (p as { optionId?: string | null }).optionId ?? null,
              optionCode: (p as { optionCode?: string | null }).optionCode ?? null,
              optionName: (p as { optionName?: string | null }).optionName ?? null,
              menuName,
              quantity: Math.max(1, Number(p.quantity) || 1),
            },
          ],
          { optionNameByCode, menuCodeByMenuId }
        )
      : [{ optionName: resolvePromoOptionLabel(p, optionNameByCode) }]
  const optName = String(rows[0]?.optionName ?? resolvePromoOptionLabel(p, optionNameByCode)).trim()
  return formatGrabPromoComposeLinesForPrint(
    {
      menuName,
      optionName: optName,
      quantity: Math.max(1, Number(p.quantity) || 1),
      parentItemName,
    },
    Boolean(grabSplit)
  )
}

function promoComposeFromOrderParent(
  parent: KitchenSlipRoutingItem,
  menuNameByMenuId?: Record<string, string>,
  optionNameByCode?: Map<string, string> | Record<string, string>,
  grabSplit?: boolean,
  parentItemName?: string,
  menuCodeByMenuId?: Record<string, string>
): string[] {
  const pi = parent.promoItems
  if (!Array.isArray(pi) || pi.length === 0) return []
  const headerName = parentItemName ?? stripLeadingPrintCodeBrackets(String(parent.name ?? ''))
  return pi
    .slice(0, 12)
    .flatMap((p) =>
      formatPromoComposeLine(
        p,
        menuNameByMenuId,
        optionNameByCode,
        grabSplit,
        headerName,
        menuCodeByMenuId
      )
    )
}

function promoComposeFromSplitChildren(
  children: KitchenSlipRoutingItem[],
  menuNameByMenuId?: Record<string, string>,
  optionNameByCode?: Map<string, string> | Record<string, string>,
  grabSplit?: boolean,
  parentItemName?: string,
  menuCodeByMenuId?: Record<string, string>
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
    let optName = optMatch ? formatGrabOptionFragmentForPrint(optMatch[2].trim(), optionNameByCode) : ''
    if (!optName) {
      if (grabSplit) {
        const chips = collectGrabPrintOptionLines({ note: ch.note, optionNameByCode })
        if (chips.length) optName = chips.join(', ')
      } else {
        const fromNote = formatGrabOrderLineNoteForPrint(String(ch.note ?? ''), optionNameByCode)
        if (fromNote && !fromNote.split(',').every((x) => isLikelyPosOptionCode(x.trim()))) {
          optName = fromNote
        }
      }
    }
    const parentQty = Math.max(
      1,
      Number(
        (ch as { kitchenPromoParentQty?: number }).kitchenPromoParentQty ??
          resolveCartLineQuantityForSave(ch as { qty?: unknown; quantity?: unknown })
      ) || 1
    )
    const lineQty = Math.max(0.0001, Number(ch.qty ?? 1) || 1)
    const componentQty = Math.max(1, Math.round(lineQty / parentQty) || 1)
    let resolvedOptName = optName
    if (grabSplit && menuCodeByMenuId && routeMid) {
      const optcMatch = /optc:([^\s,]+)/i.exec(String(ch.note ?? ''))
      const enriched = enrichGrabPromoItemsForPrint(
        [
          {
            menuId: routeMid,
            optionId: (ch as { optionId?: string | null }).optionId ?? null,
            optionCode: optcMatch?.[1] ?? null,
            optionName: resolvedOptName || null,
            menuName,
            quantity: componentQty,
          },
        ],
        { optionNameByCode, menuCodeByMenuId }
      )
      const en = String(enriched[0]?.optionName ?? '').trim()
      if (en) resolvedOptName = en
    }
    lines.push(
      ...formatGrabPromoComposeLinesForPrint(
        {
          menuName,
          optionName: resolvedOptName,
          quantity: componentQty,
          parentItemName,
        },
        Boolean(grabSplit)
      )
    )
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
  const strippedKey = normalizePromoParentKey(stripOneLeadingBracketTag(parentLabel))
  if (strippedKey && orderByParentKey.has(strippedKey)) return orderByParentKey.get(strippedKey)
  return undefined
}

/**
 * 주방 라우팅으로 펼쳐진 `[세트] 구성` 줄을 홀 주문서처럼 세트 헤더 + 구성품 목록으로 묶는다.
 * `orderItems`에 promoItems 스냅샷이 있으면 라우팅에서 빠진 구성(밥·음료 등)도 함께 표기한다.
 */
function noteCoveredByPromoCompose(formattedNote: string, promoComposeLines: string[]): boolean {
  const note = String(formattedNote ?? '').trim()
  if (!note || promoComposeLines.length === 0) return false
  const composeBlob = promoComposeLines.join(' ').toLowerCase()
  const parts = note
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  if (!parts.length) return false
  return parts.every((part) => composeBlob.includes(part.toLowerCase()))
}

function noteForGroupedPromoParent(
  children: KitchenSlipRoutingItem[],
  promoComposeLines: string[],
  optionNameByCode?: Map<string, string> | Record<string, string>
): string | undefined {
  const noteParts = children
    .map((ch) => formatGrabOrderLineNoteForPrint(String(ch.note ?? ''), optionNameByCode))
    .filter(Boolean)
  const note = noteParts.length ? [...new Set(noteParts)].join(' · ') : undefined
  if (!note) return undefined
  if (promoComposeLines.length > 0) {
    const onlyCodes = note
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .every((x) => isLikelyPosOptionCode(x))
    if (onlyCodes) return undefined
    if (noteCoveredByPromoCompose(note, promoComposeLines)) return undefined
  }
  return note
}

function deriveParentNameFromPromoComposeLines(lines: string[]): string {
  const first = String(lines[0] ?? '').trim()
  if (!first) return ''
  const plain = first.replace(/\s*x\s*[\d.]+\s*$/iu, '').trim()
  const menuOnly = /^(.+?)\s*\(([^)]+)\)\s*$/u.exec(plain)?.[1] ?? plain
  return stripLeadingPrintCodeBrackets(String(menuOnly ?? '').trim())
}

export function buildKitchenHallStyleSlipLines(
  slipItems: KitchenSlipRoutingItem[],
  opts?: {
    orderItems?: KitchenSlipRoutingItem[]
    menuNameByMenuId?: Record<string, string>
    menuCodeByMenuId?: Record<string, string>
    optionNameByCode?: Map<string, string> | Record<string, string>
    /** Grab 웹훅/API 주문만 옵션·세트 구성 줄 분리 */
    grabInbound?: boolean
  }
): KitchenSlipPrintLine[] {
  const orderItems = opts?.orderItems ?? []
  const grabInbound =
    opts?.grabInbound ??
    isGrabInboundPosOrder({ items: [...orderItems, ...slipItems] })
  const menuNameByMenuId = opts?.menuNameByMenuId
  const codeToMenuName = new Map<string, string>()
  if (opts?.menuCodeByMenuId && menuNameByMenuId) {
    for (const [mid, code] of Object.entries(opts.menuCodeByMenuId)) {
      const codeKey = String(code ?? '').trim().toUpperCase()
      const menuName = String(menuNameByMenuId[mid] ?? '').trim()
      if (!codeKey || !menuName || codeToMenuName.has(codeKey)) continue
      codeToMenuName.set(codeKey, menuName)
    }
  }
  const resolveCodeLikeLineName = (rawName: string): string => {
    const plain = stripLeadingPrintCodeBrackets(String(rawName ?? '').trim())
    if (!plain) return plain
    const upper = plain.toUpperCase()
    const mapped = codeToMenuName.get(upper)
    if (mapped) return mapped
    const grabBundle = /^(\d{5,})-S\d+$/i.exec(plain)
    if (grabBundle) {
      const baseMapped = codeToMenuName.get(grabBundle[1].toUpperCase())
      if (baseMapped) return baseMapped
    }
    if (!/^[A-Z]{1,3}\d{2,4}$/i.test(plain) && !/^\d{5,}-S\d+$/i.test(plain)) return plain
    return String(codeToMenuName.get(upper) ?? plain).trim() || plain
  }
  const menuCodeByMenuId = opts?.menuCodeByMenuId
  const formatItemNoteForPrint = (note: string, optionFragment?: string): string | undefined => {
    const raw = String(note ?? '').trim()
    if (!raw && !optionFragment) return undefined
    if (grabInbound) {
      const lines = collectGrabPrintOptionLines({
        note: raw,
        optionFragment,
        optionNameByCode,
      })
      return lines.length > 0 ? lines.join('\n') : undefined
    }
    const formatted = formatGrabOrderLineNoteForPrint(raw, optionNameByCode)
    return formatted || undefined
  }
  const menuCodeMap = new Map<string, string>()
  if (opts?.menuCodeByMenuId) {
    for (const [id, code] of Object.entries(opts.menuCodeByMenuId)) {
      if (id && code) menuCodeMap.set(id, String(code))
    }
  }
  const optionNameByCode = opts?.optionNameByCode

  const orderById = new Map<string, KitchenSlipRoutingItem>()
  const orderByParentKey = new Map<string, KitchenSlipRoutingItem>()
  for (const it of orderItems) {
    const id = String(it.id ?? '').trim()
    if (id) orderById.set(id, it)
    const pi = it.promoItems
    if (Array.isArray(pi) && pi.length > 0) {
      const key = normalizePromoParentKey(String(it.name ?? ''))
      if (key) orderByParentKey.set(key, it)
      const stripped = normalizePromoParentKey(stripOneLeadingBracketTag(String(it.name ?? '')))
      if (stripped && !orderByParentKey.has(stripped)) orderByParentKey.set(stripped, it)
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
    let displayParentName = resolveCodeLikeLineName(String(parentName ?? g.parentLabel).trim() || g.parentLabel)
    const fromOrder = parentOrder
      ? promoComposeFromOrderParent(
          parentOrder,
          menuNameByMenuId,
          optionNameByCode,
          grabInbound,
          displayParentName,
          menuCodeByMenuId
        )
      : []
    const fromChildren = promoComposeFromSplitChildren(
      g.children,
      menuNameByMenuId,
      optionNameByCode,
      grabInbound,
      displayParentName,
      menuCodeByMenuId
    )
    const promoComposeLines = fromOrder.length > 0 ? fromOrder : fromChildren
    if (isLikelyPosOptionCode(displayParentName) || /^[A-Z]{1,3}\d{2,4}$/i.test(displayParentName)) {
      const derived = deriveParentNameFromPromoComposeLines(promoComposeLines)
      if (derived && !/^[A-Z]{1,3}\d{2,4}$/i.test(derived)) displayParentName = derived
    }
    const note = noteForGroupedPromoParent(g.children, promoComposeLines, optionNameByCode)
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
      const headerName = stripLeadingPrintCodeBrackets(String(it.name ?? ''))
      const promoComposeLines = promoComposeFromOrderParent(
        it,
        menuNameByMenuId,
        optionNameByCode,
        grabInbound,
        headerName,
        menuCodeByMenuId
      )
      out.push({
        name: stripLeadingPrintCodeBrackets(String(it.name ?? '')),
        qty: Math.max(1, resolveCartLineQuantityForSave(it as { qty?: unknown; quantity?: unknown }) || 1),
        ...(() => {
          const note = formatItemNoteForPrint(String(it.note ?? '').trim())
          return note ? { note } : {}
        })(),
        ...(promoComposeLines.length > 0 ? { promoComposeLines } : {}),
      })
      continue
    }
    const lineSplit = splitPosPrintItemLine(String(it.name ?? ''))
    out.push({
      name: resolveCodeLikeLineName(lineSplit.mainName || String(it.name ?? '')),
      qty: Math.max(1, Number(it.qty ?? 1) || 1),
      ...(() => {
        const note = formatItemNoteForPrint(String(it.note ?? '').trim(), lineSplit.optionLine)
        return note ? { note } : {}
      })(),
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
    menuCodeByMenuId?: Record<string, string>
    optionNameByCode?: Map<string, string> | Record<string, string>
    grabInbound?: boolean
    translateName: (name: string) => string
    formatNote?: (note?: string) => string | undefined
    cancelled?: boolean
  }
): KitchenSlipPrintLine[] {
  const grabInbound =
    opts.grabInbound ??
    isGrabInboundPosOrder({ items: [...(opts.orderItems ?? []), ...slipItems] })
  const formatNote =
    opts.formatNote ??
    (grabInbound
      ? (note?: string) => {
          const lines = collectGrabPrintOptionLines({
            note,
            optionNameByCode: opts.optionNameByCode,
          })
          return lines.length > 0 ? lines.join('\n') : undefined
        }
      : (note?: string) => formatGrabOrderLineNoteForPrint(note, opts.optionNameByCode) || undefined)
  const hallLines = buildKitchenHallStyleSlipLines(slipItems, {
    orderItems: opts.orderItems,
    menuNameByMenuId: opts.menuNameByMenuId,
    menuCodeByMenuId: opts.menuCodeByMenuId,
    optionNameByCode: opts.optionNameByCode,
    grabInbound,
  })
  return hallLines.map((row) => ({
    name: opts.translateName(row.name),
    qty: row.qty,
    ...(row.promoComposeLines?.length
      ? {
          promoComposeLines: row.promoComposeLines.map((line) => opts.translateName(line)),
        }
      : {}),
    ...(row.note ? { note: formatNote(row.note) ?? row.note } : {}),
    ...((opts.cancelled ?? row.cancelled) ? { cancelled: true } : {}),
  }))
}
