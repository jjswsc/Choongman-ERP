import type { PosCoupon, PosMenu } from '@/lib/api-client'

export type CouponItemScope = {
  menuIds: string[]
  categoryCodes: string[]
}

export function emptyCouponItemScope(): CouponItemScope {
  return { menuIds: [], categoryCodes: [] }
}

export function itemScopeFromCoupon(c?: PosCoupon | null): CouponItemScope {
  const menuIds = Array.isArray(c?.itemScope?.menuIds)
    ? c!.itemScope!.menuIds!.map((id) => String(id).trim()).filter(Boolean)
    : []
  const categoryCodes = Array.isArray(c?.itemScope?.categoryCodes)
    ? c!.itemScope!.categoryCodes!.map((code) => String(code).trim().toUpperCase()).filter(Boolean)
    : []
  return { menuIds, categoryCodes }
}

export function buildItemScopePayload(scope: CouponItemScope): { menuIds: string[]; categoryCodes: string[] } | undefined {
  const menuIds = scope.menuIds.map((id) => String(id).trim()).filter(Boolean)
  const categoryCodes = scope.categoryCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
  if (menuIds.length === 0 && categoryCodes.length === 0) return undefined
  return { menuIds, categoryCodes }
}

export function filterPosMenusForCouponPicker(menus: PosMenu[], query: string): PosMenu[] {
  const q = String(query || '').trim().toLowerCase()
  const activeFirst = [...menus].sort((a, b) => {
    const aOff = a.isActive === false ? 1 : 0
    const bOff = b.isActive === false ? 1 : 0
    if (aOff !== bOff) return aOff - bOff
    const cat = String(a.categoryMain || a.category || '').localeCompare(String(b.categoryMain || b.category || ''))
    if (cat !== 0) return cat
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
  if (!q) return activeFirst
  return activeFirst.filter((m) => {
    const hay = [m.id, m.code, m.name, m.category, m.categoryMain].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  })
}

export function collectCategoryOptions(menus: PosMenu[], mainCategories: string[]): string[] {
  const set = new Set<string>()
  for (const raw of mainCategories || []) {
    const v = String(raw || '').trim().toUpperCase()
    if (v) set.add(v)
  }
  for (const m of menus) {
    const main = String(m.categoryMain || '').trim().toUpperCase()
    const cat = String(m.category || '').trim().toUpperCase()
    if (main) set.add(main)
    if (cat) set.add(cat)
  }
  return Array.from(set).sort()
}

export function formatCouponItemScopeSummary(
  scope: CouponItemScope | undefined | null,
  menuById?: Map<string, PosMenu>
): string {
  if (!scope) return '전체 메뉴'
  const menuIds = scope.menuIds || []
  const categoryCodes = scope.categoryCodes || []
  if (menuIds.length === 0 && categoryCodes.length === 0) return '전체 메뉴'

  const parts: string[] = []
  if (menuIds.length > 0) {
    const names = menuIds.slice(0, 2).map((id) => {
      const menu = menuById?.get(String(id))
      return menu ? menu.name || menu.code : `#${id}`
    })
    const rest = menuIds.length > 2 ? ` 외 ${menuIds.length - 2}개` : ''
    parts.push(`메뉴 ${menuIds.length}개 (${names.join(', ')}${rest})`)
  }
  if (categoryCodes.length > 0) {
    parts.push(`카테고리 ${categoryCodes.join(', ')}`)
  }
  return parts.join(' · ')
}
