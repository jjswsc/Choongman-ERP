import type { PosMenu } from '@/lib/api-client'
import type { MarketingCollabDetail } from '@/lib/marketing-collab-detail'
import { uniqueSubcategoriesForMainMenu } from '@/lib/pos-promo-constants'

type MenuLike = Pick<PosMenu, 'id' | 'categoryMain' | 'category' | 'isActive'>

export function collabCategoryScopeKey(main: string, category: string): string {
  return `${String(main ?? '').trim()}::${String(category ?? '').trim()}`
}

export function subsFromMenusForMain(menus: MenuLike[], main: string): string[] {
  const trimmedMain = String(main ?? '').trim()
  if (!trimmedMain) return []
  return Array.from(
    new Set(
      menus
        .filter((m) => m.isActive !== false && String(m.categoryMain ?? '').trim() === trimmedMain)
        .map((m) => String(m.category ?? '').trim())
        .filter(Boolean)
    )
  )
}

/** 설정(categoriesByMain) + 실제 메뉴 소분류 합집합 — Dosirak 등 누락 방지 */
export function subsForCollabScopeMain(
  main: string,
  categoriesByMain: Record<string, string[]>,
  menus: MenuLike[]
): string[] {
  const trimmedMain = String(main ?? '').trim()
  if (!trimmedMain) return []
  const fromConfig = (categoriesByMain[trimmedMain] || []).map((s) => String(s).trim()).filter(Boolean)
  const fromMenus = subsFromMenusForMain(menus, trimmedMain)
  return uniqueSubcategoriesForMainMenu(trimmedMain, [...fromConfig, ...fromMenus])
}

export function mergeCollabScopeMainCategories(configMains: string[], menus: MenuLike[]): string[] {
  const fromMenus = menus
    .filter((m) => m.isActive !== false)
    .map((m) => String(m.categoryMain ?? '').trim())
    .filter(Boolean)
  return Array.from(
    new Set([...configMains.map((m) => String(m).trim()).filter(Boolean), ...fromMenus])
  ).sort()
}

export type CollabScopeCoverageGap = {
  uncoveredMainTabs: string[]
  uncoveredSubcategories: Array<{ main: string; category: string; key: string }>
}

function scopeHasDynamicSelection(detail: MarketingCollabDetail): boolean {
  return (
    (detail.scopeMainCategories || []).length > 0 ||
    (detail.scopeCategoryKeys || []).length > 0 ||
    (detail.scopeMenuIds || []).length > 0
  )
}

/** POS 메뉴·탭 대비 협업 scope에 빠진 대분류·하위 카테고리 */
export function findCollabScopeCoverageGaps(input: {
  detail: MarketingCollabDetail
  mainCategories: string[]
  menus: MenuLike[]
}): CollabScopeCoverageGap {
  const { detail, mainCategories, menus } = input
  const activeMenus = menus.filter((m) => m.isActive !== false)
  if (!scopeHasDynamicSelection(detail) || activeMenus.length === 0) {
    return { uncoveredMainTabs: [], uncoveredSubcategories: [] }
  }

  const scopeMains = new Set((detail.scopeMainCategories || []).map((x) => String(x).trim()).filter(Boolean))
  const scopeCats = new Set((detail.scopeCategoryKeys || []).map((x) => String(x).trim()).filter(Boolean))
  const scopeMenuIds = new Set((detail.scopeMenuIds || []).map((x) => String(x).trim()).filter(Boolean))

  const mainsWithMenus = new Set(
    activeMenus.map((m) => String(m.categoryMain ?? '').trim()).filter(Boolean)
  )
  const catalogMains = new Set([
    ...mainCategories.map((m) => String(m).trim()).filter(Boolean),
    ...mainsWithMenus,
  ])

  const uncoveredMainTabs: string[] = []
  if (scopeMains.size > 0) {
    for (const main of catalogMains) {
      if (!mainsWithMenus.has(main) || scopeMains.has(main)) continue
      const hasExplicitMenu = activeMenus.some(
        (m) => String(m.categoryMain ?? '').trim() === main && scopeMenuIds.has(String(m.id ?? '').trim())
      )
      if (!hasExplicitMenu) uncoveredMainTabs.push(main)
    }
    uncoveredMainTabs.sort()
  }

  const uncoveredSubcategories: CollabScopeCoverageGap['uncoveredSubcategories'] = []
  if (scopeCats.size > 0 && scopeMains.size > 0) {
    const seenKeys = new Set<string>()
    for (const m of activeMenus) {
      const main = String(m.categoryMain ?? '').trim()
      const cat = String(m.category ?? '').trim()
      if (!main || !cat || !scopeMains.has(main)) continue
      const key = collabCategoryScopeKey(main, cat)
      if (scopeCats.has(key) || scopeMenuIds.has(String(m.id ?? '').trim())) continue
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      uncoveredSubcategories.push({ main, category: cat, key })
    }
    uncoveredSubcategories.sort((a, b) => a.main.localeCompare(b.main) || a.category.localeCompare(b.category))
  }

  return { uncoveredMainTabs, uncoveredSubcategories }
}

export function collabScopeCoverageGapSummary(gap: CollabScopeCoverageGap): string {
  const parts: string[] = []
  if (gap.uncoveredMainTabs.length > 0) {
    parts.push(gap.uncoveredMainTabs.join(', '))
  }
  for (const row of gap.uncoveredSubcategories) {
    parts.push(`${row.main} / ${row.category}`)
  }
  return parts.join('; ')
}
