/**
 * POS 주문 줄 UI/API 키.
 * Grab 반반 등 동일 menu id가 여러 줄에 반복되면 `item.id`가 겹쳐
 * 체크리스트·부분취소가 한 번에 묶이는 문제를 막기 위해,
 * 중복 id는 `line-{배열순번}`(items_json 인덱스, markPosOrderItemServed와 동일)을 쓴다.
 */
export function buildPosOrderLineKeys(items: Array<{ id?: string | null } | null | undefined>): string[] {
  const counts = new Map<string, number>()
  for (const it of items) {
    const id = String(it?.id ?? '').trim()
    if (!id) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return items.map((it, i) => {
    const id = String(it?.id ?? '').trim()
    if (!id || (counts.get(id) ?? 0) > 1) return `line-${i}`
    return id
  })
}

/** `line-N` 또는 고유 id → items 배열 인덱스. 없으면 -1 */
export function resolvePosOrderLineIndex(
  items: Array<{ id?: string | null } | null | undefined>,
  lineKey: string
): number {
  const key = String(lineKey ?? '').trim()
  if (!key || !items.length) return -1
  const indexMatch = /^line-(\d+)$/u.exec(key)
  if (indexMatch) {
    const n = Number(indexMatch[1])
    return Number.isInteger(n) && n >= 0 && n < items.length ? n : -1
  }
  let found = -1
  for (let i = 0; i < items.length; i += 1) {
    if (String(items[i]?.id ?? '').trim() !== key) continue
    if (found >= 0) return -1
    found = i
  }
  return found
}

export function getPosOrderLineByKey<T extends { id?: string | null }>(
  items: T[],
  lineKey: string
): T | null {
  const idx = resolvePosOrderLineIndex(items, lineKey)
  return idx >= 0 ? items[idx]! : null
}
