/**
 * 홀 추가 주문: 장바구니에 기존 테이블 줄이 섞여 있으면 주방은 "새로 넣은 줄"만 찍는다.
 * id가 기존 주문 items_json 과 동일하면 제외. cart-existing-{n}-{원본id} 형태도 원본 id로 비교.
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
  const qty = Number(line.quantity ?? line.qty ?? 1) || 1
  const note = String(line.note ?? '').trim()
  return [name, price, qty, note].join('\u001f')
}

export function filterKitchenCartLinesForDineInAdd<T extends KitchenComparableLine>(
  cartLines: T[],
  existingOrderItems: Array<{ id?: string }> | null | undefined
): T[] {
  if (!existingOrderItems?.length) return cartLines
  const existingIds = new Set(
    existingOrderItems.map((it) => String(it.id ?? '').trim()).filter(Boolean)
  )
  if (existingIds.size === 0) return cartLines

  const filteredById = cartLines.filter((line) => {
    const raw = String(line.id ?? '').trim()
    if (!raw) return true
    if (existingIds.has(raw)) return false
    const m = raw.match(/^cart-existing-\d+-(.+)$/)
    if (m?.[1] && existingIds.has(m[1])) return false
    return true
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
