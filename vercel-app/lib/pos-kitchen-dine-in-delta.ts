/**
 * 홀 추가 주문: 장바구니에 기존 테이블 줄이 섞여 있으면 주방은 "새로 넣은 줄"만 찍는다.
 * id가 기존 주문 items_json 과 동일하면 제외. cart-existing-{n}-{원본id} 형태도 원본 id로 비교.
 */

export function filterKitchenCartLinesForDineInAdd<T extends { id?: string }>(
  cartLines: T[],
  existingOrderItems: Array<{ id?: string }> | null | undefined
): T[] {
  if (!existingOrderItems?.length) return cartLines
  const existingIds = new Set(
    existingOrderItems.map((it) => String(it.id ?? '').trim()).filter(Boolean)
  )
  if (existingIds.size === 0) return cartLines

  const filtered = cartLines.filter((line) => {
    const raw = String(line.id ?? '').trim()
    if (!raw) return true
    if (existingIds.has(raw)) return false
    const m = raw.match(/^cart-existing-\d+-(.+)$/)
    if (m?.[1] && existingIds.has(m[1])) return false
    return true
  })

  return filtered.length > 0 ? filtered : cartLines
}
