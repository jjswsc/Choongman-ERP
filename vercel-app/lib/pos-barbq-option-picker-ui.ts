import type { PosMenu, PosMenuOption } from '@/lib/api-client'
import { BBQ_FORBIDDEN_SELECTION_GROUP_KEYS } from '@/lib/pos-bbq-option-guard'

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

export function hasBarBqMNamedSubstitutionOptions(options: PosMenuOption[]): boolean {
  return options.some(
    (o) =>
      o.optionType === 'substitution' &&
      /^\s*M\s*[-–—]/i.test(String(o.name ?? '').trim())
  )
}

/** size/part 제외 — sidedish 등 부가 선택 단계 */
export function getBarBqAncillarySelectionGroups(groups: string[]): string[] {
  return groups.filter((g) => !BBQ_FORBIDDEN_SELECTION_GROUP_KEYS.has(String(g ?? '').trim().toLowerCase()))
}

/**
 * 레거시: DB에 part/size 단계가 남아 있을 때 (1/1) part UI 대신 M 목록 플랫 표시.
 * sidedish만 있을 때는 false → 2단계(M 선택 → 사이드) 또는 사이드 다단계만 사용.
 */
export function shouldUseFlatBarBqChickenOptionPicker(params: {
  menu: Pick<PosMenu, 'code' | 'category' | 'categoryMain' | 'optionSelectionGroups'>
  options: PosMenuOption[]
}): boolean {
  if (!isBarBqChickenMenu(params.menu)) return false
  if (!hasBarBqMNamedSubstitutionOptions(params.options)) return false
  const groups = (params.menu.optionSelectionGroups || [])
    .map((g) => String(g ?? '').trim().toLowerCase())
    .filter(Boolean)
  if (groups.length === 0) return false
  return groups.some((g) => BBQ_FORBIDDEN_SELECTION_GROUP_KEYS.has(g))
}

/** M 플랫 목록 + sidedish 등 부가 단계를 순서대로 보여 줄지 */
export function shouldUseBarBqTwoPhaseOptionPicker(params: {
  menu: Pick<PosMenu, 'code' | 'category' | 'categoryMain' | 'optionSelectionGroups'>
  options: PosMenuOption[]
  ancillaryGroups: string[]
}): boolean {
  if (!isBarBqChickenMenu(params.menu)) return false
  if (params.ancillaryGroups.length === 0) return false
  return hasBarBqMNamedSubstitutionOptions(params.options)
}

/** 플랫 M 목록에 넣을 옵션 (사이드 전용 linked 행 제외) */
export function isBarBqFlatMListOption(opt: Pick<PosMenuOption, 'name' | 'optionType' | 'optionStepValues'>): boolean {
  if (opt.optionType !== 'substitution') return false
  const name = String(opt.name ?? '').trim()
  if (/^\s*M\s*[-–—]/i.test(name)) return true
  const keys = Object.keys(opt.optionStepValues ?? {})
    .map((k) => k.trim())
    .filter(Boolean)
  if (keys.length === 0) return true
  return keys.every((k) => BBQ_FORBIDDEN_SELECTION_GROUP_KEYS.has(k.toLowerCase()))
}

export function filterPosOptionsForBarBqFlatMList<T extends Pick<PosMenuOption, 'name' | 'optionType' | 'optionStepValues'>>(
  options: T[]
): T[] {
  return options.filter((o) => isBarBqFlatMListOption(o))
}

/**
 * 2단계 BBQ 선택기(size → sidedish)에서 size 단계는 그룹 필터를 우회해
 * M 옵션 목록이 sidedish 그룹 추가로 사라지지 않게 한다.
 */
export function pickBarBqSizePhaseOptions<T extends PosMenuOption>(params: {
  useBarBqTwoPhase: boolean
  phase: 'size' | 'ancillary' | null
  optionsRaw: T[]
  optionsFiltered: T[]
}): T[] {
  if (params.useBarBqTwoPhase && params.phase === 'size') {
    return params.optionsRaw
  }
  return params.optionsFiltered
}

/** 1단계 M(또는 S) + 2단계 사이드 선택 후 장바구니용 합성 옵션 */
export function mergeBarBqSizeAndAncillaryForCart(
  sizeOpt: PosMenuOption | null,
  ancillaryOpt: PosMenuOption | null,
  params: {
    hallModifier: number
    deliveryModifier: number | null
    sizeLabel: string | null
    ancillaryLabel: string | null
  }
): PosMenuOption | null {
  if (!ancillaryOpt && !sizeOpt) return null
  if (!ancillaryOpt) return sizeOpt
  const sizePart = params.sizeLabel?.trim() || null
  const sidePart = params.ancillaryLabel?.trim() || null
  const nameParts = [sizePart ?? (sizeOpt ? null : 'S Boneless'), sidePart].filter(
    (x): x is string => !!x
  )
  const mergedName = nameParts.join(' / ') || String(ancillaryOpt.name ?? '').trim()
  const baseId = sizeOpt?.id ?? 's-default'
  return {
    ...ancillaryOpt,
    id: `bbq-${baseId}-${ancillaryOpt.id}`,
    name: mergedName,
    priceModifier: params.hallModifier,
    priceModifierDelivery: params.deliveryModifier,
    optionStepValues: {
      ...(sizeOpt?.optionStepValues ?? {}),
      ...(ancillaryOpt.optionStepValues ?? {}),
    },
  }
}
