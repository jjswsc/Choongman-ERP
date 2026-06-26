import { splitPosPrintItemLine } from '@/lib/pos-print-item-line'
import { normalizePromoLookupText } from '@/lib/pos-payment-receipt-from-order'
import type { GrabPosCatalog } from '@/lib/grab-pos-order-enrich'
import {
  appendGrabModsToGrabItemNote,
  collectGrabPrintOptionLines,
  enrichGrabPromoItemsWithDefaultSizeFromCatalog,
  isGrabExplicitSizeOrPartLabel,
  isGrabSidedishOrExtraOptionLabel,
  resolveGrabDeliveryLineNote,
  resolveGrabItemPrintNote,
} from '@/lib/grab-pos-order-enrich'
import {
  isLikelyBanbanSideOrExtraLabel,
  parseBanbanFlavorsFromDisplayName,
  parseBanbanFlavorsFromPersistedNote,
} from '@/lib/pos-banban-utils'

export type GrabSetPosLine = {
  id: string
  name: string
  price: number
  qty: number
  menuId1?: string
  optionCode?: string | null
  optionCode1?: string
  optionCodes?: string[]
  note?: string
  promoId?: string
  promoCode?: string
  promoItems?: {
    menuId: string
    optionId: string | null
    optionCode?: string | null
    optionName?: string
    menuName?: string
    quantity: number
  }[]
  /** 영수증·합계에서는 숨기고 부모 세트 줄의 promoItems 로만 표시 */
  grabSetChild?: boolean
}

/** `[[April] Set 1] Rice` → promo 라벨 + 구성 메뉴명 */
export function parseGrabSetChildLineName(name: string): { promoLabel: string; childName: string } | null {
  const trimmed = String(name ?? '').trim()
  const lastBracket = trimmed.lastIndexOf(']')
  if (lastBracket < 0 || lastBracket >= trimmed.length - 1) return null
  const childName = trimmed.slice(lastBracket + 1).trim()
  if (!childName) return null
  const prefix = trimmed.slice(0, lastBracket + 1)
  if (!prefix.includes('[')) return null
  /** 부모 `[April] Set 2` 는 `[April]` 뒤 Set명 — 구성 줄(`] Rice`)과 구분 */
  const closingBrackets = (prefix.match(/\]/g) ?? []).length
  if (closingBrackets < 2 && !/^\[\[/u.test(trimmed)) return null
  const promoLabel = prefix
    .replace(/^\[+/, '')
    .replace(/\]+$/, '')
    .replace(/\]\s*\[/g, ' ')
    .replace(/[\[\]]/g, '')
    .trim()
  if (!promoLabel) return null
  return { promoLabel, childName }
}

function resolveMenuIdByDisplayName(childName: string, catalog: GrabPosCatalog): string | undefined {
  const key = normalizePromoLookupText(childName)
  if (!key) return undefined
  for (const menu of catalog.menuById.values()) {
    const nameKey = normalizePromoLookupText(menu.name)
    if (!nameKey) continue
    if (nameKey === key) return menu.id
  }
  return undefined
}

function findPromoMetaByLabelExact(
  promoLabel: string,
  catalog: GrabPosCatalog
): { promoId?: string; promoCode?: string } {
  const labelKey = normalizePromoLookupText(promoLabel)
  if (!labelKey) return {}
  for (const promo of catalog.promoByCode.values()) {
    const promoNameKey = normalizePromoLookupText(String(promo.name ?? ''))
    if (promoNameKey !== labelKey) continue
    const promoId = String(promo.id ?? '').trim()
    const promoCode = String(promo.code ?? '').trim()
    return {
      ...(promoId ? { promoId } : {}),
      ...(promoCode ? { promoCode } : {}),
    }
  }
  return {}
}

/** 동일 세트명 부모가 여러 줄일 때 자식에 가장 가까운 앞쪽 부모를 고른다(홀 영수증 mergeSetChildrenForReceipt 와 동일). */
function pickClosestPrecedingParentIndex(candidates: number[], childIndex: number): number {
  if (candidates.length === 0) return -1
  const preceding = candidates.filter((i) => i < childIndex)
  const pool = preceding.length > 0 ? preceding : candidates
  return pool.reduce((best, cur) => (cur > best ? cur : best), pool[0])
}

/**
 * 세트 자식 줄에만 있는 사이드(김치·단무지 등)를 부모 note로 옮긴다.
 * 터미널이 `grabSetChild` 줄을 제거한 뒤에도 홀·주방 영수증에 사이드가 보이게 한다.
 */
export function mergeGrabSetChildAncillaryNoteIntoParent(
  parent: { note?: string | null },
  child: {
    note?: string | null
    name?: string | null
    optionCode?: string | null
    optionCode1?: string | null
    optionCodes?: string[] | null
  },
  optionNameByCode?: Map<string, string> | Record<string, string>
): string {
  const parentNote = resolveGrabItemPrintNote(parent)
  const childNote = resolveGrabItemPrintNote(child)
  if (!childNote) return parentNote

  const parentLines = collectGrabPrintOptionLines({ note: parentNote, optionNameByCode })
  const parentKeys = new Set(parentLines.map((s) => s.toLowerCase()))
  const childLines = collectGrabPrintOptionLines({ note: childNote, optionNameByCode })
  const childParsed = parseGrabSetChildLineName(String(child.name ?? ''))
  const childMenuKey = normalizePromoLookupText(
    (childParsed?.childName ?? '').split('(')[0] ?? ''
  )

  const ancillary = childLines.filter((line) => {
    const k = line.toLowerCase()
    if (parentKeys.has(k)) return false
    if (isGrabExplicitSizeOrPartLabel(line)) return false
    const lineKey = normalizePromoLookupText(line.split('(')[0] ?? line)
    if (
      childMenuKey &&
      lineKey &&
      (lineKey === childMenuKey || childMenuKey.includes(lineKey) || lineKey.includes(childMenuKey))
    ) {
      return false
    }
    return isGrabSidedishOrExtraOptionLabel(line) || isLikelyBanbanSideOrExtraLabel(line)
  })
  if (ancillary.length === 0) return parentNote
  return appendGrabModsToGrabItemNote(parentNote, ancillary)
}

function findParentLineIndex(params: {
  promoLabel: string
  childIndex: number
  expectedPromoId?: string
  expectedPromoCode?: string
  items: GrabSetPosLine[]
  skipIndices: Set<number>
}): number {
  const labelKey = normalizePromoLookupText(params.promoLabel)
  if (!labelKey) return -1
  const expectedPromoId = String(params.expectedPromoId ?? '').trim()
  const expectedPromoCode = String(params.expectedPromoCode ?? '').trim().toUpperCase()

  const candidateIndexes: number[] = []
  for (let i = 0; i < params.items.length; i++) {
    if (params.skipIndices.has(i)) continue
    const it = params.items[i]
    if (it.grabSetChild) continue
    if (parseGrabSetChildLineName(String(it.name ?? ''))) continue
    candidateIndexes.push(i)
  }

  if (expectedPromoId || expectedPromoCode) {
    const promoMatches: number[] = []
    for (const i of candidateIndexes) {
      const it = params.items[i]
      const pid = String(it.promoId ?? '').trim()
      const pcode = String(it.promoCode ?? '').trim().toUpperCase()
      if (expectedPromoId && pid && pid === expectedPromoId) promoMatches.push(i)
      else if (expectedPromoCode && pcode && pcode === expectedPromoCode) promoMatches.push(i)
    }
    const fromPromo = pickClosestPrecedingParentIndex(promoMatches, params.childIndex)
    if (fromPromo >= 0) return fromPromo
  }

  const labelMatches: number[] = []
  for (const i of candidateIndexes) {
    const it = params.items[i]
    const nameKey = normalizePromoLookupText(it.name)
    if (nameKey && nameKey === labelKey) labelMatches.push(i)
  }
  return pickClosestPrecedingParentIndex(labelMatches, params.childIndex)
}

/** 세트 자식 ingest 후 `(맛 / 맛)`·`(L - Boneless)` 등이 name에 있으면 유지 */
export function resolveGrabSetChildKitchenDisplayName(
  row: Pick<GrabSetPosLine, 'name'>,
  childName: string
): string {
  const full = String(row.name ?? '').trim()
  const child = String(childName ?? '').trim()
  if (!child) return full
  const parsed = parseGrabSetChildLineName(full)
  const tail = parsed ? String(parsed.childName ?? '').trim() : full
  if (tail.toLowerCase().startsWith(child.toLowerCase()) && /\([^)]+\)/.test(tail)) {
    return tail
  }
  if (full.toLowerCase().includes(child.toLowerCase()) && /\([^)]+\)/.test(full)) {
    const bracketTail = full.slice(full.lastIndexOf(']') + 1).trim()
    if (bracketTail.toLowerCase().startsWith(child.toLowerCase())) return bracketTail
    const fromDisplay = parseBanbanFlavorsFromDisplayName(full)
    if (fromDisplay && fromDisplay.baseName.toLowerCase() === child.toLowerCase()) {
      return `${fromDisplay.baseName} (${fromDisplay.flavor1} / ${fromDisplay.flavor2})`
    }
  }
  return child
}

function resolveGrabSetChildPromoOptionSummary(
  row: GrabSetPosLine,
  optionNameByCode: Map<string, string>
): string {
  const fromToken = parseBanbanFlavorsFromPersistedNote(row.note)
  if (fromToken) return `${fromToken.flavor1} / ${fromToken.flavor2}`
  const fromName = parseBanbanFlavorsFromDisplayName(row.name)
  if (fromName) return `${fromName.flavor1} / ${fromName.flavor2}`
  return promoOptionSummaryFromChildNote(row.note, optionNameByCode)
}

function promoOptionSummaryFromChildNote(
  note: string | undefined,
  optionNameByCode: Map<string, string>
): string {
  const raw = String(note ?? '').trim()
  if (!raw) return ''
  const meta = resolveGrabDeliveryLineNote(raw, optionNameByCode)
  return [meta.optionSummary, meta.requestSummary].filter(Boolean).join(' · ').trim()
}

function findOptionLabelByCode(optionNameByCode: Map<string, string>, optionCode: string): string {
  const key = String(optionCode ?? '').trim().toUpperCase()
  if (!key) return ''
  const direct = optionNameByCode.get(key)
  if (direct) return String(direct).trim()
  for (const [k, v] of optionNameByCode.entries()) {
    if (String(k ?? '').trim().toUpperCase() === key) return String(v ?? '').trim()
  }
  return ''
}

/**
 * Grab 이 세트를 부모 1줄 + `[프로모] 구성메뉴` 자식 줄로 보낼 때,
 * 자식 선택(사이즈 등)을 부모 promoItems 스냅샷으로 모은다.
 */
export function mergeGrabSetChildLinesIntoPromoParents(
  items: GrabSetPosLine[],
  catalog: GrabPosCatalog
): GrabSetPosLine[] {
  if (!items.length) return items
  const out = items.map((it) => ({ ...it }))
  const children: { index: number; promoLabel: string; childName: string }[] = []

  for (let i = 0; i < out.length; i++) {
    const parsed = parseGrabSetChildLineName(out[i].name)
    if (!parsed) continue
    children.push({ index: i, ...parsed })
  }
  if (children.length === 0) return out
  const childIndices = new Set(children.map((c) => c.index))

  for (const child of children) {
    const row = out[child.index]
    const childMenuName = splitPosPrintItemLine(child.childName).mainName || child.childName
    const promoMeta = findPromoMetaByLabelExact(child.promoLabel, catalog)
    const parentIdx = findParentLineIndex({
      promoLabel: child.promoLabel,
      childIndex: child.index,
      expectedPromoId: promoMeta.promoId,
      expectedPromoCode: promoMeta.promoCode,
      items: out,
      skipIndices: childIndices,
    })
    const menuId =
      String(row.menuId1 ?? '').trim() ||
      resolveMenuIdByDisplayName(childMenuName, catalog) ||
      resolveMenuIdByDisplayName(child.childName, catalog) ||
      ''
    const optionCode = String(row.optionCode1 ?? row.optionCode ?? '').trim() || undefined
    const optionName =
      resolveGrabSetChildPromoOptionSummary(row, catalog.optionNameByCode) ||
      (optionCode ? findOptionLabelByCode(catalog.optionNameByCode, optionCode) : '')
    const promoLineRaw = {
      menuId: menuId || '',
      optionId: null as string | null,
      ...(optionCode ? { optionCode } : {}),
      ...(optionName ? { optionName } : {}),
      menuName: childMenuName,
      quantity: Math.max(1, Number(row.qty) || 1),
    }
    const promoLine =
      enrichGrabPromoItemsWithDefaultSizeFromCatalog([promoLineRaw], catalog)?.[0] ?? promoLineRaw

    if (parentIdx >= 0 && parentIdx !== child.index) {
      const parent = out[parentIdx]
      const list = Array.isArray(parent.promoItems) ? [...parent.promoItems] : []
      const childKey = normalizePromoLookupText(childMenuName)
      const existingIdx = list.findIndex((p) => {
        const byName = normalizePromoLookupText(String(p.menuName ?? ''))
        if (childKey && byName && byName === childKey) return true
        const pid = String(p.menuId ?? '').trim()
        return Boolean(menuId && pid && pid === menuId)
      })
      if (existingIdx >= 0) {
        const prev = list[existingIdx]
        list[existingIdx] = {
          ...prev,
          ...promoLine,
          quantity: Math.max(1, Number(prev.quantity) || 1),
          ...(promoLine.optionName || prev.optionName
            ? { optionName: promoLine.optionName || prev.optionName }
            : {}),
        }
      } else {
        list.push(promoLine)
      }
      const enrichedList = enrichGrabPromoItemsWithDefaultSizeFromCatalog(list, catalog) ?? list
      const mergedParentNote = mergeGrabSetChildAncillaryNoteIntoParent(
        parent,
        row,
        catalog.optionNameByCode
      )
      out[parentIdx] = {
        ...parent,
        promoItems: enrichedList,
        ...(mergedParentNote ? { note: mergedParentNote } : {}),
      }
      out[child.index] = { ...row, grabSetChild: true }
      continue
    }

    // 부모 줄이 없으면 자식 이름만 정리해 주방·영수증에 구성명이 보이게 한다
    const displayName = resolveGrabSetChildKitchenDisplayName(row, childMenuName)
    out[child.index] = {
      ...row,
      name: displayName,
      ...(optionName && !String(row.note ?? '').trim() ? { note: `mods:${optionName}` } : {}),
    }
  }

  return out
}
