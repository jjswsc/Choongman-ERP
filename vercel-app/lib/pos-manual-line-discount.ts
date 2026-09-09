/**
 * POS 결제 수동 할인 — 메뉴(줄)마다 다른 % 적용.
 * 같은 메뉴 qty>1 은 접시(단위)별로 다른 % 를 걸 수 있다. 카트 줄은 합쳐 둔 채 키만 나눈다.
 */

export const DISCOUNT_UNIT_KEY_SEP = '::u'

export function normalizeLineDiscountPct(raw: unknown): number {
  const n = Math.trunc(Number(raw) || 0)
  if (n <= 0) return 0
  return Math.min(100, n)
}

export function lineDiscountAmtFromPct(lineTotal: number, pct: number): number {
  const total = Math.max(0, Number(lineTotal) || 0)
  const rate = normalizeLineDiscountPct(pct)
  if (total <= 0.0001 || rate <= 0) return 0
  return Math.min(total, Math.floor((total * rate) / 100))
}

export function buildDiscountUnitKey(itemId: string, unitIndex: number): string {
  return `${itemId}${DISCOUNT_UNIT_KEY_SEP}${unitIndex}`
}

export function parseDiscountUnitKey(key: string): { itemId: string; unitIndex: number | null } {
  const raw = String(key || '')
  const idx = raw.lastIndexOf(DISCOUNT_UNIT_KEY_SEP)
  if (idx <= 0) return { itemId: raw, unitIndex: null }
  const rest = raw.slice(idx + DISCOUNT_UNIT_KEY_SEP.length)
  if (!/^\d+$/.test(rest)) return { itemId: raw, unitIndex: null }
  return { itemId: raw.slice(0, idx), unitIndex: Number(rest) }
}

/** 정수 수량만 접시 단위로 나눈다. 1.5 같은 소수는 기존처럼 한 줄. */
export function discountUnitCount(quantity: unknown): number {
  const n = Math.max(0, Number(quantity) || 0)
  if (n <= 0) return 0
  const rounded = Math.round(n)
  if (rounded >= 1 && Math.abs(n - rounded) < 0.0001) return rounded
  return 1
}

export type DiscountPickerUnit = {
  key: string
  itemId: string
  unitIndex: number
  unitCount: number
  name: string
  price: number
  quantity: number
}

export function expandLinesToDiscountUnits(
  lines: Array<{ id?: string; name?: string; price?: number; quantity?: number; qty?: number }>
): DiscountPickerUnit[] {
  const out: DiscountPickerUnit[] = []
  for (const line of lines) {
    const itemId = String(line.id ?? '')
    if (!itemId) continue
    const qty = Math.max(0, Number(line.quantity ?? line.qty ?? 0) || 0)
    const unitCount = discountUnitCount(qty)
    if (unitCount <= 0) continue
    const price = Math.max(0, Number(line.price) || 0)
    const name = String(line.name ?? '')
    if (unitCount <= 1) {
      out.push({
        key: itemId,
        itemId,
        unitIndex: 0,
        unitCount: 1,
        name,
        price,
        quantity: qty > 0 ? qty : 1,
      })
      continue
    }
    for (let i = 0; i < unitCount; i++) {
      out.push({
        key: buildDiscountUnitKey(itemId, i),
        itemId,
        unitIndex: i,
        unitCount,
        name,
        price,
        quantity: 1,
      })
    }
  }
  return out
}

export function isActiveDiscountSelectionKey(
  key: string,
  items: Array<{ id?: string; quantity?: number; qty?: number }>
): boolean {
  const byId = new Map(items.map((item) => [String(item.id ?? ''), item]))
  if (byId.has(key) && key) return true
  const parsed = parseDiscountUnitKey(key)
  if (parsed.unitIndex == null) return false
  const item = byId.get(parsed.itemId)
  if (!item) return false
  const count = discountUnitCount(item.quantity ?? item.qty)
  return parsed.unitIndex >= 0 && parsed.unitIndex < count
}

export function storedLineDiscountPctForKey(
  currentPcts: Record<string, number> | undefined,
  key: string
): number {
  const direct = normalizeLineDiscountPct(currentPcts?.[key])
  if (direct > 0) return direct
  const parsed = parseDiscountUnitKey(key)
  if (parsed.unitIndex == null) return 0
  return normalizeLineDiscountPct(currentPcts?.[parsed.itemId])
}

export function resolveDiscountPickerUnitMode(
  modeById: Record<string, string> | undefined,
  unit: Pick<DiscountPickerUnit, 'key' | 'itemId'>
): string {
  const lineMode = modeById?.[unit.itemId] ?? 'none'
  if (lineMode === 'service' || lineMode === 'cancel') return lineMode
  return modeById?.[unit.key] ?? (lineMode === 'discount' ? 'discount' : 'none')
}

export function selectedDiscountQuantityForLine(
  line: { id?: string; quantity?: number; qty?: number },
  modeById: Record<string, string> | undefined
): number {
  const id = String(line.id ?? '')
  const qty = Math.max(0, Number(line.quantity ?? line.qty ?? 0) || 0)
  const lineMode = modeById?.[id] ?? 'none'
  if (lineMode === 'service' || lineMode === 'cancel') return 0
  const unitCount = discountUnitCount(qty)
  if (unitCount <= 1) return lineMode === 'discount' ? qty : 0
  let n = 0
  for (let i = 0; i < unitCount; i++) {
    const key = buildDiscountUnitKey(id, i)
    const mode = modeById?.[key] ?? (lineMode === 'discount' ? 'discount' : 'none')
    if (mode === 'discount') n += 1
  }
  return n
}

export function lineHasSelectedDiscount(
  line: { id?: string; quantity?: number; qty?: number },
  modeById: Record<string, string> | undefined
): boolean {
  return selectedDiscountQuantityForLine(line, modeById) > 0
}

export function selectedDiscountAmountForLine(
  line: { id?: string; price?: number; quantity?: number; qty?: number },
  modeById: Record<string, string> | undefined
): number {
  return Math.max(0, Number(line.price) || 0) * selectedDiscountQuantityForLine(line, modeById)
}

export function collectSelectedDiscountTargetKeys(
  lines: Array<{ id?: string; quantity?: number; qty?: number }>,
  modeById: Record<string, string>
): string[] {
  const keys: string[] = []
  for (const line of lines) {
    const id = String(line.id ?? '')
    if (!id) continue
    const qty = Math.max(0, Number(line.quantity ?? line.qty ?? 0) || 0)
    const lineMode = modeById[id] ?? 'none'
    if (lineMode === 'service' || lineMode === 'cancel') continue
    const unitCount = discountUnitCount(qty)
    if (unitCount <= 1) {
      if (lineMode === 'discount') keys.push(id)
      continue
    }
    for (let i = 0; i < unitCount; i++) {
      const key = buildDiscountUnitKey(id, i)
      const mode = modeById[key] ?? (lineMode === 'discount' ? 'discount' : 'none')
      if (mode === 'discount') keys.push(key)
    }
  }
  return keys
}

function explodeWholeLineDiscountModes(
  next: Record<string, ManualLineDiscountMode>,
  itemId: string,
  unitCount: number
): void {
  if (unitCount <= 1) return
  if ((next[itemId] ?? 'none') !== 'discount') return
  delete next[itemId]
  for (let i = 0; i < unitCount; i++) {
    const key = buildDiscountUnitKey(itemId, i)
    if ((next[key] ?? 'none') === 'none') next[key] = 'discount'
  }
}

function clearUnitDiscountKeys(
  next: Record<string, ManualLineDiscountMode>,
  itemId: string,
  unitCount: number
): void {
  const n = Math.max(unitCount, 1)
  for (let i = 0; i < n; i++) {
    delete next[buildDiscountUnitKey(itemId, i)]
  }
}

export type ManualLineDiscountMode = 'none' | 'discount' | 'service' | 'cancel'

export function nextDiscountModesForTargetChange(input: {
  prev: Record<string, string>
  targetKey: string
  nextMode: string
  itemId: string
  unitCount: number
}): Record<string, ManualLineDiscountMode> {
  const next: Record<string, ManualLineDiscountMode> = {}
  for (const [key, mode] of Object.entries(input.prev)) {
    if (mode === 'discount' || mode === 'service' || mode === 'cancel') next[key] = mode
  }
  const { targetKey, nextMode, itemId, unitCount } = input
  const parsed = parseDiscountUnitKey(targetKey)
  const isUnitKey = parsed.unitIndex != null && unitCount > 1

  if (nextMode === 'service' || nextMode === 'cancel') {
    clearUnitDiscountKeys(next, itemId, unitCount)
    next[itemId] = nextMode
    return next
  }

  if (nextMode === 'none') {
    if (isUnitKey) {
      explodeWholeLineDiscountModes(next, itemId, unitCount)
      delete next[targetKey]
      delete next[itemId]
      return next
    }
    clearUnitDiscountKeys(next, itemId, unitCount)
    delete next[itemId]
    return next
  }

  if (nextMode !== 'discount') {
    return next
  }

  if (isUnitKey) {
    explodeWholeLineDiscountModes(next, itemId, unitCount)
    delete next[itemId]
    next[targetKey] = 'discount'
    return next
  }

  if (unitCount > 1) {
    clearUnitDiscountKeys(next, itemId, unitCount)
  }
  next[itemId] = 'discount'
  return next
}

export function explodeLineDiscountPctsToUnits(
  prev: Record<string, number>,
  itemId: string,
  unitCount: number
): Record<string, number> {
  const linePct = normalizeLineDiscountPct(prev[itemId])
  if (linePct <= 0 || unitCount <= 1) return prev
  const next = { ...prev }
  delete next[itemId]
  for (let i = 0; i < unitCount; i++) {
    const key = buildDiscountUnitKey(itemId, i)
    if (normalizeLineDiscountPct(next[key]) <= 0) next[key] = linePct
  }
  return next
}

export function nextLineDiscountPctsAfterPercentTap(input: {
  selectedIds: string[]
  currentPcts: Record<string, number>
  lastFocusedId: string | null | undefined
  pct: number
}): Record<string, number> {
  const pct = normalizeLineDiscountPct(input.pct)
  const selectedIds = input.selectedIds.map((id) => String(id || '').trim()).filter(Boolean)
  if (pct <= 0 || selectedIds.length === 0) return input.currentPcts

  const current = input.currentPcts
  const pending = selectedIds.filter((id) => storedLineDiscountPctForKey(current, id) <= 0)
  const next = { ...current }
  if (pending.length > 0) {
    for (const id of pending) next[id] = pct
    return next
  }

  const focused = String(input.lastFocusedId || '').trim()
  const target = selectedIds.includes(focused) ? focused : selectedIds[selectedIds.length - 1]
  if (!target) return current
  if (storedLineDiscountPctForKey(next, target) === pct) return current
  next[target] = pct
  return next
}

export function effectiveLineDiscountPct(input: {
  itemId: string
  selected: boolean
  storedPct?: number
  fallbackPct?: number
}): number {
  if (!input.selected) return 0
  const stored = normalizeLineDiscountPct(input.storedPct)
  if (stored > 0) return stored
  return normalizeLineDiscountPct(input.fallbackPct)
}

function unitDiscountPct(input: {
  key: string
  itemId: string
  selected: boolean
  pcts: Record<string, number>
  fallbackPct: number
}): number {
  if (!input.selected) return 0
  const stored = storedLineDiscountPctForKey(input.pcts, input.key)
  return effectiveLineDiscountPct({
    itemId: input.key,
    selected: true,
    storedPct: stored,
    fallbackPct: input.fallbackPct,
  })
}

export function computeManualLineDiscountAllocations(input: {
  lines: Array<{ id: string; price: number; quantity?: number; qty?: number }>
  lineDiscountModeByItemId: Record<string, string>
  lineDiscountPctByItemId: Record<string, number>
  fallbackPct?: number
}): { lineAlloc: number[]; total: number } {
  const fallbackPct = normalizeLineDiscountPct(input.fallbackPct)
  const lineAlloc = input.lines.map((line) => {
    const id = String(line.id ?? '')
    const lineMode = input.lineDiscountModeByItemId[id] ?? 'none'
    if (lineMode === 'service' || lineMode === 'cancel') return 0
    const qty = Math.max(0, Number(line.quantity ?? line.qty ?? 0) || 0)
    const unitPrice = Math.max(0, Number(line.price) || 0)
    const unitCount = discountUnitCount(qty)
    if (unitCount <= 1) {
      if (lineMode !== 'discount') return 0
      return lineDiscountAmtFromPct(
        unitPrice * qty,
        unitDiscountPct({
          key: id,
          itemId: id,
          selected: true,
          pcts: input.lineDiscountPctByItemId,
          fallbackPct,
        })
      )
    }
    let sum = 0
    for (let i = 0; i < unitCount; i++) {
      const key = buildDiscountUnitKey(id, i)
      const mode = input.lineDiscountModeByItemId[key] ?? (lineMode === 'discount' ? 'discount' : 'none')
      if (mode !== 'discount') continue
      sum += lineDiscountAmtFromPct(
        unitPrice,
        unitDiscountPct({
          key,
          itemId: id,
          selected: true,
          pcts: input.lineDiscountPctByItemId,
          fallbackPct,
        })
      )
    }
    return sum
  })
  const total = lineAlloc.reduce((sum, v) => sum + v, 0)
  return { lineAlloc, total }
}

export function summarizeLineDiscountPcts(
  lines: Array<{ id?: string; quantity?: number; qty?: number }>,
  lineDiscountModeByItemId: Record<string, string>,
  lineDiscountPctByItemId: Record<string, number>,
  fallbackPct?: number
): Array<{ pct: number; count: number }> {
  const fallback = normalizeLineDiscountPct(fallbackPct)
  const counts = new Map<number, number>()
  for (const line of lines) {
    const id = String(line.id ?? '')
    const qty = Math.max(0, Number(line.quantity ?? line.qty ?? 0) || 0)
    const lineMode = lineDiscountModeByItemId[id] ?? 'none'
    if (lineMode === 'service' || lineMode === 'cancel') continue
    const unitCount = discountUnitCount(qty)
    const visit = (key: string, selected: boolean) => {
      if (!selected) return
      const pct = unitDiscountPct({
        key,
        itemId: id,
        selected: true,
        pcts: lineDiscountPctByItemId,
        fallbackPct: fallback,
      })
      if (pct <= 0) return
      counts.set(pct, (counts.get(pct) || 0) + 1)
    }
    if (unitCount <= 1) {
      visit(id, lineMode === 'discount')
      continue
    }
    for (let i = 0; i < unitCount; i++) {
      const key = buildDiscountUnitKey(id, i)
      const mode = lineDiscountModeByItemId[key] ?? (lineMode === 'discount' ? 'discount' : 'none')
      visit(key, mode === 'discount')
    }
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pct, count]) => ({ pct, count }))
}
