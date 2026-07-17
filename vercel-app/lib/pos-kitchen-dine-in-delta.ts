/**
 * 홀 추가 주문: 장바구니에 기존 테이블 줄이 섞여 있으면 주방은 "새로 넣은 줄"만 찍는다.
 * id가 기존 주문 items_json 과 동일하면 제외. cart-existing-{n}-{원본id} 형태도 원본 id로 비교.
 * 기존 줄 수량(qty/quantity)이 있으면 증가분만 반환한다.
 */

import { normalizeCartLineIdForSave } from '@/lib/pos-order-item-map'

type KitchenComparableLine = {
  id?: string
  name?: string
  price?: number
  quantity?: number
  qty?: number
  note?: string
  menuId?: string
  menuId1?: string
  menu_id1?: string
  optionCode?: string
  optionCode1?: string
  option_code1?: string
}

/** items_json(camel/snake) · 카트 · UI 스냅샷 공통 menu id */
export function resolveKitchenLineMenuId(line: {
  menuId?: string
  menuId1?: string
  menu_id1?: string
}): string {
  return String(line.menuId ?? line.menuId1 ?? line.menu_id1 ?? '').trim()
}

function resolveKitchenLineOptionCode(line: {
  optionCode?: string
  optionCode1?: string
  option_code1?: string
}): string {
  return String(line.optionCode ?? line.optionCode1 ?? line.option_code1 ?? '').trim()
}

/**
 * note 표현이 카트(`optc:` 토큰/빈 값)와 DB(해석된 "M - Boneless")에서 어긋나면
 * 기존 줄이 "신규"로 오인되어 주방에 중복 출력된다. 스냅샷 키와 동일한 normalizer를
 * 받아 양쪽 note를 같은 형태로 맞춰 비교한다(미전달 시 단순 trim).
 */
type DineInNoteNormalizer = (note: string) => string
const defaultDineInNoteNormalize: DineInNoteNormalizer = (note) => note.trim()

function lineSignature(
  line: KitchenComparableLine,
  formatNote: DineInNoteNormalizer = defaultDineInNoteNormalize
): string {
  const name = String(line.name ?? '').trim()
  const price = Number(line.price ?? 0) || 0
  const qty = lineQty(line)
  const note = formatNote(String(line.note ?? '').trim())
  return [name, price, qty, note].join('\u001f')
}

function lineContentSignature(
  line: KitchenComparableLine,
  formatNote: DineInNoteNormalizer = defaultDineInNoteNormalize
): string {
  const menuId = resolveKitchenLineMenuId(line)
  const name = String(line.name ?? '').trim()
  const price = Number(line.price ?? 0) || 0
  const note = formatNote(String(line.note ?? '').trim())
  return [menuId, name, price, note].join('\u001f')
}

/** 한쪽만 menuId가 비어 있어도 name·price·note가 같으면 동일 품목으로 본다 */
function linesMatchByKitchenContent(
  a: KitchenComparableLine,
  b: KitchenComparableLine,
  formatNote: DineInNoteNormalizer
): boolean {
  if (lineContentSignature(a, formatNote) === lineContentSignature(b, formatNote)) return true
  const menuIdA = resolveKitchenLineMenuId(a)
  const menuIdB = resolveKitchenLineMenuId(b)
  if (menuIdA && menuIdB && menuIdA !== menuIdB) return false
  const nameA = String(a.name ?? '').trim()
  const nameB = String(b.name ?? '').trim()
  const priceA = Number(a.price ?? 0) || 0
  const priceB = Number(b.price ?? 0) || 0
  const noteA = formatNote(String(a.note ?? '').trim())
  const noteB = formatNote(String(b.note ?? '').trim())
  if (nameA === nameB && priceA === priceB && noteA === noteB) return true
  if (menuIdA && menuIdA === menuIdB && nameA === nameB && priceA === priceB) {
    const rawA = String(a.note ?? '').trim()
    const rawB = String(b.note ?? '').trim()
    if (looksLikeOptionTokenNote(rawA) || looksLikeOptionTokenNote(rawB)) return true
  }
  return false
}

function looksLikeOptionTokenNote(note: string): boolean {
  if (!note) return false
  return /(?:^|\s|·)(?:optc:|mods?:)/i.test(note)
}

/** 추가 주문 주방·홀 자동인쇄 dedupe — 줄 수만 쓰면 연속 1품목 추가가 막힘 */
export function buildDineInAddKitchenPrintDedupeSuffix(
  lines: KitchenComparableLine[],
  opts?: { formatNote?: DineInNoteNormalizer }
): string {
  if (!lines.length) return '0'
  const formatNote = opts?.formatNote ?? defaultDineInNoteNormalize
  const parts = lines.map((line) => {
    const menuId = resolveKitchenLineMenuId(line)
    const qty = lineQty(line)
    const note = formatNote(String(line.note ?? '').trim())
    const name = String(line.name ?? '').trim()
    const price = Number(line.price ?? 0) || 0
    const id = resolveExistingId(line)
    if (menuId) return `m:${menuId}@${qty}:${note}`
    return `s:${name}\u001f${price}\u001f${note}@${qty}:${id}`
  })
  parts.sort()
  return parts.join('|')
}

/** 로컬·Realtime·폴링 공통 — 동일 추가분 주방 중복 인쇄 방지 */
export function buildDineInAddKitchenAutoPrintDedupeKey(
  orderId: number | string,
  lines: KitchenComparableLine[],
  opts?: { formatNote?: DineInNoteNormalizer }
): string {
  const id = String(orderId ?? '').trim()
  return `order:${id}:kitchen:add:${buildDineInAddKitchenPrintDedupeSuffix(lines, opts)}`
}

function lineQty(line: KitchenComparableLine): number {
  return Math.max(0, Math.trunc(Number(line.quantity ?? line.qty ?? 1) || 1))
}

function resolveExistingId(line: { id?: string }): string {
  const raw = String(line.id ?? '').trim()
  if (!raw) return ''
  const m = raw.match(/^cart-existing-\d+-(.+)$/)
  return (m?.[1] ?? raw).trim()
}

function isEphemeralPosCartLineId(id: string): boolean {
  const normalized = resolveExistingId({ id })
  return /^cart-/i.test(normalized) || /^promo-cart-/i.test(normalized)
}

/** dine-in Realtime 스냅샷·주방 delta — POS 카트 임시 id(cart-*)는 품목 서명으로 고정 */
export function resolveDineInKitchenSnapshotItemKey(
  item: {
    id?: unknown
    name?: unknown
    price?: unknown
    note?: unknown
    menuId?: unknown
    menuId1?: unknown
    menu_id1?: unknown
    optionCode?: unknown
    optionCode1?: unknown
    option_code1?: unknown
  },
  opts?: { formatNote?: (note: string) => string }
): string {
  const rawId = String(item.id ?? '').trim()
  if (rawId && !isEphemeralPosCartLineId(rawId)) {
    const id = normalizeCartLineIdForSave(item.id)
    if (id && !isEphemeralPosCartLineId(id)) return id
  }
  const formatNote = opts?.formatNote ?? ((note: string) => note.trim())
  const name = String(item.name ?? '').trim()
  const price = Number(item.price ?? 0) || 0
  const note = formatNote(String(item.note ?? '').trim())
  const menuId = resolveKitchenLineMenuId({
    menuId: item.menuId != null ? String(item.menuId) : undefined,
    menuId1: item.menuId1 != null ? String(item.menuId1) : undefined,
    menu_id1: item.menu_id1 != null ? String(item.menu_id1) : undefined,
  })
  const optionCode = resolveKitchenLineOptionCode({
    optionCode: item.optionCode != null ? String(item.optionCode) : undefined,
    optionCode1: item.optionCode1 != null ? String(item.optionCode1) : undefined,
    option_code1: item.option_code1 != null ? String(item.option_code1) : undefined,
  })
  return `sig:${name}\u001f${price}\u001f${menuId}\u001f${optionCode}\u001f${note}`
}

export function buildDineInQtySnapshotMap(
  items: Array<{
    id?: unknown
    qty?: unknown
    quantity?: unknown
    name?: unknown
    price?: unknown
    note?: unknown
    menuId?: unknown
    menuId1?: unknown
    optionCode?: unknown
    optionCode1?: unknown
  }>,
  resolveKey: (item: (typeof items)[number]) => string
): Map<string, number> {
  const map = new Map<string, number>()
  for (const it of items) {
    const key = resolveKey(it)
    if (!key) continue
    map.set(key, (map.get(key) ?? 0) + lineQty(it as KitchenComparableLine))
  }
  return map
}

/** Realtime/폴링 스냅샷 diff — 증가한 key만, 증가분 qty로 주방 줄 생성 */
export function buildKitchenCartLinesFromSnapshotDelta<T extends KitchenComparableLine>(
  cartLines: T[],
  prevQtyByKey: Map<string, number>,
  newQtyByKey: Map<string, number>,
  resolveKey: (line: T) => string
): T[] {
  const out: T[] = []
  const remainingDeltaByKey = new Map<string, number>()
  for (const [key, nextQty] of newQtyByKey) {
    const prevQty = Number(prevQtyByKey.get(key) ?? 0)
    const delta = nextQty - prevQty
    if (delta > 0) remainingDeltaByKey.set(key, delta)
  }
  for (const line of cartLines) {
    const key = resolveKey(line)
    if (!key) continue
    const remaining = Number(remainingDeltaByKey.get(key) ?? 0)
    if (remaining <= 0) continue
    const lineQ = lineQty(line)
    const take = Math.min(remaining, lineQ)
    remainingDeltaByKey.set(key, remaining - take)
    if (take >= lineQ) {
      out.push(line)
    } else {
      out.push({ ...line, quantity: take, qty: take })
    }
  }
  return out
}

export function collectDineInSnapshotIncreasedKeys(
  prevQtyByKey: Map<string, number>,
  newQtyByKey: Map<string, number>
): Set<string> {
  const changed = new Set<string>()
  for (const [key, nextQty] of newQtyByKey) {
    const prevQty = Number(prevQtyByKey.get(key) ?? 0)
    if (nextQty > prevQty) changed.add(key)
  }
  return changed
}

function existingHasQtyInfo(items: Array<{ quantity?: number; qty?: number }>): boolean {
  return items.some((it) => it.quantity != null || it.qty != null)
}

export function filterKitchenCartLinesForDineInAdd<T extends KitchenComparableLine>(
  cartLines: T[],
  existingOrderItems: Array<{ id?: string; quantity?: number; qty?: number }> | null | undefined,
  opts?: { formatNote?: DineInNoteNormalizer }
): T[] {
  if (!existingOrderItems?.length) return cartLines

  const formatNote = opts?.formatNote ?? defaultDineInNoteNormalize

  const existingQtyById = new Map<string, number>()
  for (const it of existingOrderItems) {
    const id = resolveExistingId(it)
    if (!id) continue
    existingQtyById.set(id, (existingQtyById.get(id) ?? 0) + lineQty(it))
  }
  if (existingQtyById.size === 0) return cartLines

  if (existingHasQtyInfo(existingOrderItems)) {
    const deltaLines: T[] = []
    for (const line of cartLines) {
      const baseId = resolveExistingId(line)
      if (baseId && existingQtyById.has(baseId)) {
        const delta = lineQty(line) - (existingQtyById.get(baseId) ?? 0)
        if (delta > 0) {
          deltaLines.push({ ...line, quantity: delta, qty: delta })
        }
        continue
      }
      let matchedExistingQty = 0
      for (const ex of existingOrderItems) {
        if (linesMatchByKitchenContent(line, ex, formatNote)) {
          matchedExistingQty += lineQty(ex)
        }
      }
      if (matchedExistingQty > 0) {
        const delta = lineQty(line) - matchedExistingQty
        if (delta > 0) {
          deltaLines.push({ ...line, quantity: delta, qty: delta })
        }
        continue
      }
      deltaLines.push(line)
    }
    return deltaLines
  }

  const existingIds = new Set(existingQtyById.keys())
  const filteredById = cartLines.filter((line) => {
    const baseId = resolveExistingId(line)
    if (!baseId) return true
    return !existingIds.has(baseId)
  })

  if (filteredById.length > 0) return filteredById

  // id 충돌/재생성 케이스 보정: 서명(name/price/qty/note) 다중집합으로 "추가분"만 계산.
  const existingCounts = new Map<string, number>()
  for (const line of existingOrderItems) {
    const key = lineSignature(line, formatNote)
    existingCounts.set(key, (existingCounts.get(key) || 0) + 1)
  }
  const filteredBySignature: T[] = []
  for (const line of cartLines) {
    const key = lineSignature(line, formatNote)
    const remain = existingCounts.get(key) || 0
    if (remain > 0) {
      existingCounts.set(key, remain - 1)
      continue
    }
    filteredBySignature.push(line)
  }
  return filteredBySignature
}

/**
 * 추가 주문 제출 시 주방 줄 — delta가 비면 전체 카트를 찍지 않는다.
 * (리패치 레이스로 filter가 0줄이어도 incoming 전체 fallback 시 기존+신규가 함께 출력됨)
 */
export function resolveDineInKitchenLinesForAddSubmit<T extends KitchenComparableLine>(
  incomingLines: T[],
  existingOrderItems: Array<{ id?: string; quantity?: number; qty?: number }> | null | undefined,
  opts?: { formatNote?: DineInNoteNormalizer }
): T[] {
  return filterKitchenCartLinesForDineInAdd(incomingLines, existingOrderItems, opts)
}

/**
 * 영수증 모달·수동 주방 인쇄 — 추가 주문(`add_order`) 맥락에서는 `isAddon` 줄만 주방에 보낸다.
 * 플래그가 없으면 추가분을 구분할 수 없어 빈 배열(인쇄 생략).
 */
export function kitchenSlipSourceItemsForAddOrderReceipt<T extends { isAddon?: boolean }>(
  items: T[],
  receiptAutoPrintContext?: string | null
): T[] {
  if (String(receiptAutoPrintContext ?? '').trim() !== 'add_order') return items
  return items.filter((it) => it.isAddon === true)
}
