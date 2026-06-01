import { normalizePromoLookupText } from '@/lib/pos-payment-receipt-from-order'
import type { GrabPosCatalog } from '@/lib/grab-pos-order-enrich'
import { resolveGrabDeliveryLineNote } from '@/lib/grab-pos-order-enrich'

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

function findParentLineIndex(params: {
  promoLabel: string
  expectedPromoId?: string
  expectedPromoCode?: string
  items: GrabSetPosLine[],
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
    for (const i of candidateIndexes) {
      const it = params.items[i]
      const pid = String(it.promoId ?? '').trim()
      const pcode = String(it.promoCode ?? '').trim().toUpperCase()
      if (expectedPromoId && pid && pid === expectedPromoId) return i
      if (expectedPromoCode && pcode && pcode === expectedPromoCode) return i
    }
  }

  for (const i of candidateIndexes) {
    const it = params.items[i]
    const nameKey = normalizePromoLookupText(it.name)
    if (nameKey && nameKey === labelKey) return i
  }
  return -1
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
    const promoMeta = findPromoMetaByLabelExact(child.promoLabel, catalog)
    const parentIdx = findParentLineIndex({
      promoLabel: child.promoLabel,
      expectedPromoId: promoMeta.promoId,
      expectedPromoCode: promoMeta.promoCode,
      items: out,
      skipIndices: childIndices,
    })
    const menuId =
      String(row.menuId1 ?? '').trim() || resolveMenuIdByDisplayName(child.childName, catalog) || ''
    const optionCode = String(row.optionCode1 ?? row.optionCode ?? '').trim() || undefined
    const optionName =
      promoOptionSummaryFromChildNote(row.note, catalog.optionNameByCode) ||
      (optionCode ? findOptionLabelByCode(catalog.optionNameByCode, optionCode) : '')
    const promoLine = {
      menuId: menuId || '',
      optionId: null as string | null,
      ...(optionCode ? { optionCode } : {}),
      ...(optionName ? { optionName } : {}),
      menuName: child.childName,
      quantity: Math.max(1, Number(row.qty) || 1),
    }

    if (parentIdx >= 0 && parentIdx !== child.index) {
      const parent = out[parentIdx]
      const list = Array.isArray(parent.promoItems) ? [...parent.promoItems] : []
      list.push(promoLine)
      out[parentIdx] = { ...parent, promoItems: list }
      out[child.index] = { ...row, grabSetChild: true }
      continue
    }

    // 부모 줄이 없으면 자식 이름만 정리해 주방·영수증에 구성명이 보이게 한다
    out[child.index] = {
      ...row,
      name: child.childName,
      ...(optionName && !String(row.note ?? '').trim() ? { note: `mods:${optionName}` } : {}),
    }
  }

  return out
}
