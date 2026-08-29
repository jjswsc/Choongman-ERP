/** 홍보물 총수량을 매장 수로 나눈 개수. 나머지는 앞쪽 매장에 1개씩. */
export function splitStoreQuantities(total: number, storeCount: number): number[] {
  const n = Math.max(0, Math.floor(storeCount))
  const q = Math.max(0, Math.round(Number(total) || 0))
  if (n <= 0) return []
  if (q <= 0) return Array.from({ length: n }, () => 0)
  const base = Math.floor(q / n)
  const rem = q % n
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0))
}

export function parseStoreQuantity(val: unknown): number | null {
  if (val == null || val === "") return null
  const n = Number(val)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

/** 매장에 기록된 출고 수량. 없으면 총수량을 매장 수로 나눈 값(추정). */
export function storeDispatchQuantity(params: {
  checkQuantity?: number | null
  materialQuantity?: number | null
  storeCount: number
  storeIndex: number
}): { qty: number; estimated: boolean } {
  const recorded = parseStoreQuantity(params.checkQuantity)
  if (recorded != null) return { qty: recorded, estimated: false }
  const splits = splitStoreQuantities(params.materialQuantity ?? 0, params.storeCount)
  const idx = Math.max(0, Math.min(splits.length - 1, params.storeIndex))
  return { qty: splits[idx] ?? 0, estimated: true }
}
