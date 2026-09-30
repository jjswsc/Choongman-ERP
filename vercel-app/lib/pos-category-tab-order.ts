import {
  PROMOTION_MAIN_CATEGORY,
  normalizePromotionCategoryMain,
  normalizePromotionSubcategory,
} from '@/lib/pos-promo-constants'

/** Menu Screen에서 저장한 대분류·소분류 표시 순서. 비어 있으면 기존 기본 정렬을 유지한다. */
export type PosCategoryTabOrder = {
  mains: string[]
  subsByMain: Record<string, string[]>
}

export function emptyPosCategoryTabOrder(): PosCategoryTabOrder {
  return { mains: [], subsByMain: {} }
}

function cleanLabelList(raw: unknown, normalize: (value: string) => string): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    const name = normalize(String(item ?? '').trim())
    if (!name || out.includes(name)) continue
    out.push(name)
  }
  return out
}

export function sanitizePosCategoryTabOrder(raw: unknown): PosCategoryTabOrder {
  const source = raw && typeof raw === 'object' ? (raw as { mains?: unknown; subsByMain?: unknown }) : {}
  const subsByMain: Record<string, string[]> = {}
  if (source.subsByMain && typeof source.subsByMain === 'object' && !Array.isArray(source.subsByMain)) {
    for (const [mainRaw, subs] of Object.entries(source.subsByMain as Record<string, unknown>)) {
      const main = normalizePromotionCategoryMain(mainRaw)
      if (!main) continue
      const list = cleanLabelList(subs, (name) =>
        main === PROMOTION_MAIN_CATEGORY ? normalizePromotionSubcategory(name) : name
      )
      if (list.length > 0) subsByMain[main] = list
    }
  }
  return {
    mains: cleanLabelList(source.mains, (name) => normalizePromotionCategoryMain(name)),
    subsByMain,
  }
}

export function renamePosCategoryTabOrderLabel(
  order: PosCategoryTabOrder | null | undefined,
  from: string,
  to: string,
  scope: { kind: 'main' } | { kind: 'sub'; main: string }
): PosCategoryTabOrder {
  const current = sanitizePosCategoryTabOrder(order)
  const nextName = String(to ?? '').trim()
  const prevName = String(from ?? '').trim()
  if (!nextName || !prevName || nextName === prevName) return current
  if (scope.kind === 'main') {
    const fromMain = normalizePromotionCategoryMain(prevName)
    const toMain = normalizePromotionCategoryMain(nextName)
    return {
      mains: current.mains.map((name) => (name === fromMain ? toMain : name)),
      subsByMain: Object.fromEntries(
        Object.entries(current.subsByMain).map(([main, subs]) => [main === fromMain ? toMain : main, subs])
      ),
    }
  }
  const main = normalizePromotionCategoryMain(scope.main)
  const fromSub = main === PROMOTION_MAIN_CATEGORY ? normalizePromotionSubcategory(prevName) : prevName
  const toSub = main === PROMOTION_MAIN_CATEGORY ? normalizePromotionSubcategory(nextName) : nextName
  const subs = current.subsByMain[main]
  if (!subs) return current
  return {
    mains: current.mains,
    subsByMain: {
      ...current.subsByMain,
      [main]: subs.map((name) => (name === fromSub ? toSub : name)),
    },
  }
}
