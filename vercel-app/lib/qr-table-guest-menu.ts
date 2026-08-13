/** QR 손님 앱 — 이미 주방으로 보낸 라인 집계 (표시용). */

export type QrGuestSentLine = {
  name: string
  qty: number
  price: number
  buffetIncluded: boolean
}

export function aggregateQrGuestSentLines(
  items: Array<{
    name?: string
    qty?: number
    quantity?: number
    price?: number
    buffetIncluded?: boolean
    cancelled?: boolean
  }> | null | undefined
): QrGuestSentLine[] {
  const map = new Map<string, QrGuestSentLine>()
  for (const raw of items || []) {
    if (raw?.cancelled === true) continue
    const qty = Math.max(0, Math.floor(Number(raw.qty ?? raw.quantity ?? 0) || 0))
    if (!qty) continue
    const name = String(raw.name || '').trim() || '—'
    const buffetIncluded = raw.buffetIncluded === true
    const price = Math.max(0, Number(raw.price) || 0)
    const key = `${buffetIncluded ? 'in' : 'ex'}|${name}|${price}`
    const prev = map.get(key)
    if (prev) prev.qty += qty
    else map.set(key, { name, qty, price, buffetIncluded })
  }
  return [...map.values()]
}

/**
 * 패키지별 Included / Extra 분리.
 * extraIds가 비어 있으면 Extra = 포함이 아닌 홀 메뉴 전체(기존 동작).
 * extraIds가 있으면 Extra 탭에는 그 메뉴만 표시.
 */
export function splitQrGuestMenusByTier<T extends { menuId: number }>(params: {
  menus: T[]
  includedIds: Iterable<number>
  extraIds?: Iterable<number> | null
}): { included: T[]; extras: T[] } {
  const included = new Set([...params.includedIds].map((n) => Math.floor(Number(n) || 0)).filter(Boolean))
  const extraAllow = new Set(
    [...(params.extraIds || [])].map((n) => Math.floor(Number(n) || 0)).filter(Boolean)
  )
  const limitExtras = extraAllow.size > 0
  const includedOut: T[] = []
  const extrasOut: T[] = []
  for (const m of params.menus) {
    const id = Math.floor(Number(m.menuId) || 0)
    if (!id) continue
    if (included.has(id)) {
      includedOut.push(m)
      continue
    }
    if (limitExtras && !extraAllow.has(id)) continue
    extrasOut.push(m)
  }
  return { included: includedOut, extras: extrasOut }
}
