/** 주방 주문서 분할 (카테고리 → 주방1/2/3). kitchenMode 2·3에서 kitchen2·kitchen3 목록만 분류에 사용, 나머지는 주방1. */

export type KitchenSlipRoutingItem = { id?: string }

export function buildKitchenSlipGroups<T extends KitchenSlipRoutingItem>(
  items: T[],
  opts: {
    kitchenMode: number
    kitchen2Categories: string[]
    kitchen3Categories: string[]
    categoryByMenuId: Record<string, string>
    labels: { unified: string; kitchen1: string; kitchen2: string; kitchen3: string }
  }
): { label: string; items: T[] }[] {
  const mode = Math.min(3, Math.max(1, Number(opts.kitchenMode) || 1))
  const k2 = opts.kitchen2Categories || []
  const k3 = opts.kitchen3Categories || []
  const catMap = opts.categoryByMenuId || {}

  const menuCat = (it: T) => {
    const raw = String(it.id ?? '').split('-')[0]
    return String(catMap[raw] ?? '')
  }

  if (mode === 1) {
    return [{ label: opts.labels.unified, items: [...items] }]
  }

  if (mode === 2) {
    const slip1: T[] = []
    const slip2: T[] = []
    for (const it of items) {
      const cat = menuCat(it)
      if (k2.includes(cat)) slip2.push(it)
      else slip1.push(it)
    }
    const out: { label: string; items: T[] }[] = []
    if (slip1.length) out.push({ label: opts.labels.kitchen1, items: slip1 })
    if (slip2.length) out.push({ label: opts.labels.kitchen2, items: slip2 })
    return out.length ? out : [{ label: opts.labels.unified, items: [...items] }]
  }

  const slip1: T[] = []
  const slip2: T[] = []
  const slip3: T[] = []
  for (const it of items) {
    const cat = menuCat(it)
    if (k3.includes(cat)) slip3.push(it)
    else if (k2.includes(cat)) slip2.push(it)
    else slip1.push(it)
  }
  const out: { label: string; items: T[] }[] = []
  if (slip1.length) out.push({ label: opts.labels.kitchen1, items: slip1 })
  if (slip2.length) out.push({ label: opts.labels.kitchen2, items: slip2 })
  if (slip3.length) out.push({ label: opts.labels.kitchen3, items: slip3 })
  return out.length ? out : [{ label: opts.labels.unified, items: [...items] }]
}
