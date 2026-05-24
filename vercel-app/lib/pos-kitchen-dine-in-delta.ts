/**
 * 홀 추가 주문: 장바구니에 기존 테이블 줄이 섞여 있으면 주방은 "새로 넣은 줄"만 찍는다.
 * id가 기존 주문 items_json 과 동일하면 제외. cart-existing-{n}-{원본id} 형태도 원본 id로 비교.
 * 기존 줄 수량(qty/quantity)이 있으면 증가분만 반환한다.
 */

type KitchenComparableLine = {
  id?: string
  name?: string
  price?: number
  quantity?: number
  qty?: number
  note?: string
}

function lineSignature(line: KitchenComparableLine): string {
  const name = String(line.name ?? '').trim()
  const price = Number(line.price ?? 0) || 0
  const qty = lineQty(line)
  const note = String(line.note ?? '').trim()
  return [name, price, qty, note].join('\u001f')
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

function existingHasQtyInfo(items: Array<{ quantity?: number; qty?: number }>): boolean {
  return items.some((it) => it.quantity != null || it.qty != null)
}

export function filterKitchenCartLinesForDineInAdd<T extends KitchenComparableLine>(
  cartLines: T[],
  existingOrderItems: Array<{ id?: string; quantity?: number; qty?: number }> | null | undefined
): T[] {
  if (!existingOrderItems?.length) return cartLines

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
    const key = lineSignature(line)
    existingCounts.set(key, (existingCounts.get(key) || 0) + 1)
  }
  const filteredBySignature: T[] = []
  for (const line of cartLines) {
    const key = lineSignature(line)
    const remain = existingCounts.get(key) || 0
    if (remain > 0) {
      existingCounts.set(key, remain - 1)
      continue
    }
    filteredBySignature.push(line)
  }
  return filteredBySignature
}
