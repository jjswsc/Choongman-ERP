import type { PosMenu, PosMenuOption } from '@/lib/api-client'

/** Bar.B.Q 치킨 카테고리 문자열 */
export function isBarBqChickenMenu(menu: Pick<PosMenu, 'code' | 'category' | 'categoryMain'>): boolean {
  const code = String(menu.code ?? '').trim().toLowerCase()
  const isChicken =
    String(menu.categoryMain ?? '').toLowerCase() === 'chicken' || code.startsWith('c')
  if (!isChicken) return false
  const cat = `${menu.category ?? ''} ${menu.categoryMain ?? ''}`.toLowerCase()
  return (
    cat.includes('bar.b.q') ||
    cat.includes('barbq') ||
    cat.includes('bbq fried') ||
    /\bbar\s*b\.?\s*q\b/i.test(cat)
  )
}

/**
 * Bar.B.Q 는 `M - Boneless` 등 **이름으로 M 옵션을 고르는** UI가 맞다.
 * DB 에 `part` 만 남아 있으면 (1/1) part / Boneless 만 보여 직원이 헷갈린다.
 */
export function shouldUseFlatBarBqChickenOptionPicker(params: {
  menu: Pick<PosMenu, 'code' | 'category' | 'categoryMain' | 'optionSelectionGroups'>
  options: PosMenuOption[]
}): boolean {
  if (!isBarBqChickenMenu(params.menu)) return false
  const groups = (params.menu.optionSelectionGroups || [])
    .map((g) => String(g ?? '').trim())
    .filter(Boolean)
  if (groups.length === 0) return false
  return params.options.some(
    (o) =>
      o.optionType === 'substitution' &&
      /^\s*M\s*[-–—]/i.test(String(o.name ?? '').trim())
  )
}
