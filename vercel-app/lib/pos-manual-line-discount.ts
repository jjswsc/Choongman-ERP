/**
 * POS 결제 수동 할인 — 메뉴(줄)마다 다른 % 적용
 */

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
  const pending = selectedIds.filter((id) => normalizeLineDiscountPct(current[id]) <= 0)
  const next = { ...current }
  if (pending.length > 0) {
    for (const id of pending) next[id] = pct
    return next
  }

  const focused = String(input.lastFocusedId || '').trim()
  const target = selectedIds.includes(focused) ? focused : selectedIds[selectedIds.length - 1]
  if (!target) return current
  if (normalizeLineDiscountPct(next[target]) === pct) return current
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

export function computeManualLineDiscountAllocations(input: {
  lines: Array<{ id: string; price: number; quantity?: number; qty?: number }>
  lineDiscountModeByItemId: Record<string, string>
  lineDiscountPctByItemId: Record<string, number>
  fallbackPct?: number
}): { lineAlloc: number[]; total: number } {
  const fallbackPct = normalizeLineDiscountPct(input.fallbackPct)
  const lineAlloc = input.lines.map((line) => {
    const id = String(line.id ?? '')
    if ((input.lineDiscountModeByItemId[id] ?? 'none') !== 'discount') return 0
    const qty = Math.max(0, Number(line.quantity ?? line.qty ?? 0) || 0)
    const lineTotal = Math.max(0, Number(line.price) || 0) * qty
    const pct = effectiveLineDiscountPct({
      itemId: id,
      selected: true,
      storedPct: input.lineDiscountPctByItemId[id],
      fallbackPct,
    })
    return lineDiscountAmtFromPct(lineTotal, pct)
  })
  const total = lineAlloc.reduce((sum, v) => sum + v, 0)
  return { lineAlloc, total }
}

export function summarizeLineDiscountPcts(
  lines: Array<{ id: string }>,
  lineDiscountModeByItemId: Record<string, string>,
  lineDiscountPctByItemId: Record<string, number>,
  fallbackPct?: number
): Array<{ pct: number; count: number }> {
  const counts = new Map<number, number>()
  for (const line of lines) {
    const id = String(line.id ?? '')
    if ((lineDiscountModeByItemId[id] ?? 'none') !== 'discount') continue
    const pct = effectiveLineDiscountPct({
      itemId: id,
      selected: true,
      storedPct: lineDiscountPctByItemId[id],
      fallbackPct,
    })
    if (pct <= 0) continue
    counts.set(pct, (counts.get(pct) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pct, count]) => ({ pct, count }))
}
