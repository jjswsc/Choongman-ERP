import { parseBanbanFlavorsFromName } from '@/lib/pos-banban-utils'
import { resolveItemsJsonLineQty } from '@/lib/pos-order-item-map'
import type { PromoEconomicsLineInput } from '@/lib/promo-economics'
import { PROMOTION_MAIN_CATEGORY, normalizePromotionCategoryMain } from '@/lib/pos-promo-constants'

export type PosSalesHierarchyLevel = 'main' | 'category' | 'menu' | 'option'

export type PosSalesHierarchyRow = {
  key: string
  label: string
  qty: number
  sales: number
  categoryMain?: string
  category?: string
  menuId?: string
}

export type PosMenuCatalogRow = {
  id?: number | string
  name?: string
  category?: string
  category_main?: string
}

export type PosOptionCatalogRow = {
  id?: number | string
  menu_id?: number | string
  name?: string
  option_code?: string
  option_step_values?: Record<string, string> | null
}

/** 주문 promoItems 없을 때 DB 세트 구성으로 풀어 집계하기 위한 카탈로그 */
export type PosSalesPromoExpandCatalog = {
  promoItemsByPromoId: Map<string, PromoEconomicsLineInput[]>
  promoIdByMirrorMenuId?: Map<string, string>
  promoMetaById?: Map<string, { code: string; name: string }>
}

type Bucket = { qty: number; sales: number }

type LineContribution = {
  menuId: string
  optionId: string
  optionCode: string
  menuName: string
  optionName: string
  categoryMain: string
  category: string
  qty: number
  sales: number
}

const EMPTY_MAIN = '(대분류 없음)'
const EMPTY_CATEGORY = '(카테고리 없음)'
const EMPTY_MENU = '(메뉴 없음)'
const DEFAULT_OPTION_LABEL = '(기본)'

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function isLineCancelled(row: Record<string, unknown>): boolean {
  return Boolean(str(row.cancelledAt ?? row.cancelled_at))
}

/**
 * 주문 줄의 메뉴 ID. `row.id`는 Grab 줄 고유키라 집계 키로 쓰면 안 됨.
 * (menuId1만 있는 단품·반반은 상위에서 분기)
 */
function resolveLineMenuId(row: Record<string, unknown>): string {
  return str(row.menuId1 ?? row.menu_id1 ?? row.menuId ?? row.menu_id)
}

function resolveLineOptionId(row: Record<string, unknown>): string {
  return str(row.optionId1 ?? row.option_id1 ?? row.optionId ?? row.option_id)
}

function resolveLineOptionCode(row: Record<string, unknown>): string {
  return str(row.optionCode1 ?? row.option_code1 ?? row.optionCode ?? row.option_code)
}

/** `Menu (opt)` → base / suffix. 카탈로그 없을 때도 메인 메뉴 합치기용 */
export function splitOrderLineDisplayName(lineName: string): {
  baseName: string
  optionSuffix: string
} {
  const raw = str(lineName).replace(/\s+/g, ' ')
  if (!raw) return { baseName: '', optionSuffix: '' }
  const paren = raw.match(/^(.+?)\s*\(([^()]*)\)\s*$/u)
  if (paren?.[1]) {
    return { baseName: paren[1].trim(), optionSuffix: str(paren[2]) }
  }
  return { baseName: raw, optionSuffix: '' }
}

function normalizeMenuAggKeyPart(name: string): string {
  return str(name).replace(/\s+/g, ' ').toLowerCase()
}

/** 메인 메뉴 합치기: 동일 표시명이면 catalog id 유무와 관계없이 한 행으로 */
function resolveMenuAggregationKey(menuId: string, menuName: string): string {
  const nameKey = normalizeMenuAggKeyPart(menuName)
  if (nameKey) return `name:${nameKey}`
  const id = str(menuId)
  if (id) return `id:${id}`
  return `name:${EMPTY_MENU}`
}

function resolveOptionAggregationKey(
  menuKey: string,
  optionId: string,
  optionCode: string,
  optionName: string
): string {
  if (str(optionId)) return `${menuKey}::oid:${str(optionId)}`
  if (str(optionCode)) return `${menuKey}::ocode:${normalizeMenuAggKeyPart(optionCode)}`
  return `${menuKey}::oname:${normalizeMenuAggKeyPart(optionName) || DEFAULT_OPTION_LABEL}`
}

/**
 * 줄 menuId가 카탈로그에 없으면 이름(베이스)으로 재매칭하고,
 * 매칭되면 카탈로그 id로 통일해 메인 메뉴 집계가 합쳐지게 한다.
 */
function resolveContributionMenuIdentity(
  rawMenuId: string,
  lineName: string,
  menuCatalog: ReturnType<typeof buildMenuCatalog>
): {
  menuId: string
  menuName: string
  menuMeta: PosMenuCatalogRow | undefined
  lineBaseName: string
  lineOptionSuffix: string
} {
  const { baseName, optionSuffix } = splitOrderLineDisplayName(lineName)
  const lookupName = baseName || lineName
  let menuMeta = resolveMenuMeta(rawMenuId, lookupName, menuCatalog)
  if (!menuMeta && lookupName !== lineName) {
    menuMeta = resolveMenuMeta('', lineName, menuCatalog)
  }
  const catalogId = str(menuMeta?.id)
  const rawInCatalog = Boolean(rawMenuId && menuCatalog.menuById.has(rawMenuId))
  const menuId = catalogId || (rawInCatalog ? rawMenuId : '')
  const menuName = str(menuMeta?.name) || lookupName || lineName || EMPTY_MENU
  return {
    menuId,
    menuName,
    menuMeta,
    lineBaseName: lookupName,
    lineOptionSuffix: optionSuffix,
  }
}

/** 반반: 서로 다른 맛 메뉴 ID 두 개가 있으면 단품(menuId1)이 아니라 반반 상품으로 집계 */
function resolveBanbanDualFlavorIds(row: Record<string, unknown>): {
  flavorId1: string
  flavorId2: string
} | null {
  const flavorId1 = str(row.menuId1 ?? row.menu_id1)
  const flavorId2 = str(row.menuId2 ?? row.menu_id2)
  if (!flavorId1 || !flavorId2 || flavorId1 === flavorId2) return null
  return { flavorId1, flavorId2 }
}

/**
 * 반반 줄 → Banban 부모 메뉴·카테고리 + 옵션명 `맛1 / 맛2`.
 * (menuId1 우선이면 Hot Snow 등 단품 카테고리로 잘못 붙음)
 */
function resolveBanbanSalesContribution(
  row: Record<string, unknown>,
  menuCatalog: ReturnType<typeof buildMenuCatalog>,
  qty: number,
  sales: number
): LineContribution | null {
  const dual = resolveBanbanDualFlavorIds(row)
  if (!dual) return null

  const lineName = str(row.name) || EMPTY_MENU
  const parsed = parseBanbanFlavorsFromName(lineName)
  const parentRaw = str(row.menuId ?? row.menu_id)
  const parentLooksLikeFlavor =
    Boolean(parentRaw) &&
    (parentRaw === dual.flavorId1 || parentRaw === dual.flavorId2)

  let menuId = parentRaw && !parentLooksLikeFlavor ? parentRaw : ''
  let menuMeta = menuId ? menuCatalog.menuById.get(menuId) : undefined

  if (!menuMeta && parsed?.baseName) {
    menuMeta = menuCatalog.menuByName.get(parsed.baseName.toLowerCase())
    if (menuMeta) menuId = str(menuMeta.id) || menuId
  }

  const menuName = str(menuMeta?.name) || parsed?.baseName || lineName
  if (!menuId) menuId = str(menuMeta?.id) || menuName

  let optionName = ''
  if (parsed) {
    optionName = `${parsed.flavor1} / ${parsed.flavor2}`
  } else {
    const f1 = str(menuCatalog.menuById.get(dual.flavorId1)?.name) || dual.flavorId1
    const f2 = str(menuCatalog.menuById.get(dual.flavorId2)?.name) || dual.flavorId2
    optionName = `${f1} / ${f2}`
  }

  return {
    menuId,
    optionId: '',
    optionCode: '',
    menuName,
    optionName: optionName || DEFAULT_OPTION_LABEL,
    categoryMain: str(menuMeta?.category_main) || EMPTY_MAIN,
    category: str(menuMeta?.category) || EMPTY_CATEGORY,
    qty,
    sales,
  }
}

function resolveLineSales(row: Record<string, unknown>, qty: number): number {
  const price = Number(row.price ?? 0) || 0
  const discount = Math.max(
    0,
    Number(row.lineDiscountAmt ?? row.line_discount_amt ?? 0) || 0
  )
  return Math.max(0, qty * price - discount)
}

function buildMenuCatalog(menus: PosMenuCatalogRow[]) {
  const menuById = new Map<string, PosMenuCatalogRow>()
  const menuByName = new Map<string, PosMenuCatalogRow>()
  for (const m of menus) {
    const idKey = str(m.id)
    if (idKey) menuById.set(idKey, m)
    const nameKey = str(m.name).toLowerCase()
    if (nameKey && !menuByName.has(nameKey)) menuByName.set(nameKey, m)
  }
  return { menuById, menuByName }
}

function buildOptionCatalog(options: PosOptionCatalogRow[]) {
  const optionById = new Map<string, PosOptionCatalogRow>()
  const optionByMenuAndCode = new Map<string, PosOptionCatalogRow>()
  for (const o of options) {
    const idKey = str(o.id)
    if (idKey) optionById.set(idKey, o)
    const menuId = str(o.menu_id)
    const code = str(o.option_code).toLowerCase()
    if (menuId && code) optionByMenuAndCode.set(`${menuId}::${code}`, o)
  }
  return { optionById, optionByMenuAndCode }
}

function resolveMenuMeta(
  menuId: string,
  lineName: string,
  catalog: ReturnType<typeof buildMenuCatalog>
): PosMenuCatalogRow | undefined {
  if (menuId) {
    const hit = catalog.menuById.get(menuId)
    if (hit) return hit
  }
  const byName = catalog.menuByName.get(lineName.toLowerCase())
  return byName
}

function resolveOptionMeta(
  menuId: string,
  optionId: string,
  optionCode: string,
  catalog: ReturnType<typeof buildOptionCatalog>
): PosOptionCatalogRow | undefined {
  if (optionId) {
    const hit = catalog.optionById.get(optionId)
    if (hit) return hit
  }
  if (menuId && optionCode) {
    return catalog.optionByMenuAndCode.get(`${menuId}::${optionCode.toLowerCase()}`)
  }
  return undefined
}

function composeOptionNameFromStepValues(step: Record<string, unknown>): string {
  const vals = Object.values(step)
    .map((v) => str(v))
    .filter(Boolean)
  return vals.join(' - ')
}

/** `Snow Onion (S - Boneless)` 등 줄 표시명에서 괄호·접미 옵션 문자열 추출 */
export function extractOptionSuffixFromOrderLineName(
  lineName: string,
  catalogMenuName: string
): string {
  const raw = str(lineName)
  const base = str(catalogMenuName)
  if (!raw) return ''
  if (base) {
    const baseLower = base.toLowerCase()
    const rawLower = raw.toLowerCase()
    if (rawLower.startsWith(`${baseLower} (`) && raw.endsWith(')')) {
      return raw.slice(base.length).replace(/^\s*\(/, '').replace(/\)\s*$/, '').trim()
    }
    if (rawLower.startsWith(`${baseLower} -`)) {
      return raw.slice(base.length).replace(/^\s*-\s*/, '').trim()
    }
  }
  const paren = raw.match(/\(([^)]+)\)\s*$/)
  if (paren?.[1]) return paren[1].trim()
  if (raw.includes(' / ')) {
    const slash = raw.match(/\(([^)]*\/[^)]*)\)\s*$/)
    if (slash?.[1]) return slash[1].trim()
  }
  return ''
}

function resolveCatalogOptionDisplayName(meta: PosOptionCatalogRow | undefined): string {
  if (!meta) return ''
  const name = str(meta.name)
  const step = meta.option_step_values
  if (step && typeof step === 'object' && !Array.isArray(step)) {
    const composed = composeOptionNameFromStepValues(step as Record<string, unknown>)
    if (composed && (!name || name.toLowerCase() === composed.toLowerCase())) return composed
    if (composed && name && !name.toLowerCase().includes(composed.toLowerCase().split(' - ')[0] ?? '')) {
      return composed
    }
  }
  return name
}

function resolveLineOptionDisplayName(
  row: Record<string, unknown>,
  menuId: string,
  catalogMenuName: string,
  optionId: string,
  optionCode: string,
  optionCatalog: ReturnType<typeof buildOptionCatalog>
): string {
  const optionMeta = resolveOptionMeta(menuId, optionId, optionCode, optionCatalog)
  const fromCatalog = resolveCatalogOptionDisplayName(optionMeta)
  if (fromCatalog) return fromCatalog

  const optionNameField = str(row.optionName ?? row.option_name)
  if (optionNameField) return optionNameField

  const optionsArr = row.options ?? row.option_names
  if (Array.isArray(optionsArr)) {
    const parts = optionsArr.map((v) => str(v)).filter(Boolean)
    if (parts.length > 0) return parts.join(' - ')
  }

  const stepRaw = row.optionStepValues ?? row.option_step_values
  if (stepRaw && typeof stepRaw === 'object' && !Array.isArray(stepRaw)) {
    const composed = composeOptionNameFromStepValues(stepRaw as Record<string, unknown>)
    if (composed) return composed
  }

  const fromLineName = extractOptionSuffixFromOrderLineName(str(row.name), catalogMenuName)
  if (fromLineName) return fromLineName

  return DEFAULT_OPTION_LABEL
}

/** `[Super Deal] Set 3` → `Super Deal` */
export function parsePromoBracketName(lineName: string): string {
  const m = str(lineName).match(/^\[([^\]]+)\]/)
  return m?.[1]?.trim() ?? ''
}

function promoParentSearchHaystack(row: Record<string, unknown>): string {
  const lineName = str(row.name)
  return [lineName, str(row.promoCode ?? row.promo_code), parsePromoBracketName(lineName)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function parentPromoLineMatchesSearch(
  row: Record<string, unknown>,
  searchTokens: string[],
  searchAnd: boolean
): boolean {
  if (searchTokens.length === 0) return false
  const haystack = promoParentSearchHaystack(row)
  return searchAnd
    ? searchTokens.every((t) => haystack.includes(t))
    : searchTokens.some((t) => haystack.includes(t))
}

export function orderLineMatchesMenuSearch(
  row: Record<string, unknown>,
  searchTokens: string[],
  searchAnd: boolean,
  menuCatalog: ReturnType<typeof buildMenuCatalog>
): boolean {
  if (searchTokens.length === 0) return true

  const parts = [
    str(row.name),
    str(row.promoCode ?? row.promo_code),
    str(row.promoId ?? row.promo_id),
    parsePromoBracketName(str(row.name)),
  ]

  for (const child of promoChildLines(row, menuCatalog).children) {
    parts.push(child.menuName)
    const meta = resolveMenuMeta(child.menuId, child.menuName, menuCatalog)
    if (meta?.name) parts.push(str(meta.name))
    if (meta?.category) parts.push(str(meta.category))
    if (meta?.category_main) parts.push(str(meta.category_main))
  }

  const haystack = parts.filter(Boolean).join(' ').toLowerCase()
  return searchAnd
    ? searchTokens.every((t) => haystack.includes(t))
    : searchTokens.some((t) => haystack.includes(t))
}

function normalizePromoLookupText(raw: string): string {
  return str(raw)
    .toLowerCase()
    .replace(/[\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikePromoSetLine(row: Record<string, unknown>): boolean {
  if (str(row.promoId ?? row.promo_id)) return true
  if (str(row.promoCode ?? row.promo_code)) return true
  const lineId = str(row.id).toLowerCase()
  if (lineId.startsWith('promo-')) return true
  const lineName = str(row.name)
  if (parsePromoBracketName(lineName)) return true
  if (/\b(set|promo|bundle|campaign)\b/i.test(lineName)) return true
  const main = normalizePromotionCategoryMain(
    str(row.category_main ?? row.categoryMain)
  )
  if (main === PROMOTION_MAIN_CATEGORY) return true
  return false
}

function resolvePromoIdForHierarchyExpand(
  row: Record<string, unknown>,
  catalog: PosSalesPromoExpandCatalog | undefined
): string {
  if (!catalog) return ''
  const direct = str(row.promoId ?? row.promo_id)
  if (direct) return direct

  const code = str(row.promoCode ?? row.promo_code).toUpperCase()
  if (code && catalog.promoMetaById) {
    for (const [id, meta] of catalog.promoMetaById.entries()) {
      if (str(meta.code).toUpperCase() === code) return id
    }
  }

  const lineId = str(row.id)
  if (lineId.toLowerCase().startsWith('promo-') && catalog.promoItemsByPromoId.size > 0) {
    const rest = lineId.slice('promo-'.length)
    let best = ''
    for (const key of catalog.promoItemsByPromoId.keys()) {
      if (!key) continue
      if (rest === key || rest.startsWith(`${key}-`)) {
        if (key.length > best.length) best = key
      }
    }
    if (best) return best
  }

  const menuId = resolveLineMenuId(row)
  if (menuId && catalog.promoIdByMirrorMenuId?.has(menuId)) {
    return catalog.promoIdByMirrorMenuId.get(menuId) ?? ''
  }

  const lineNameKey = normalizePromoLookupText(str(row.name))
  if (lineNameKey && catalog.promoMetaById?.size) {
    let bestId = ''
    let bestScore = 0
    for (const [id, meta] of catalog.promoMetaById.entries()) {
      const nameKey = normalizePromoLookupText(meta.name)
      const codeKey = normalizePromoLookupText(meta.code)
      let score = 0
      if (nameKey && lineNameKey === nameKey) score = 100
      else if (codeKey && lineNameKey === codeKey) score = 95
      else if (nameKey && lineNameKey.startsWith(`${nameKey} `)) score = 80 + Math.min(15, nameKey.length)
      if (score > bestScore) {
        bestScore = score
        bestId = id
      } else if (score > 0 && score === bestScore && id !== bestId) {
        // 동점이면 이름 매칭 포기(오인식 방지)
        bestId = ''
      }
    }
    if (bestId) return bestId
  }

  return ''
}

function filterCatalogTemplateForExpand(
  template: PromoEconomicsLineInput[],
  lineName: string,
  menuCatalog: ReturnType<typeof buildMenuCatalog>
): PromoEconomicsLineInput[] {
  const fixed: PromoEconomicsLineInput[] = []
  const byChoiceGroup = new Map<string, PromoEconomicsLineInput[]>()

  for (const item of template) {
    const cg = str((item as { choiceGroup?: string | null }).choiceGroup)
    if (cg) {
      const list = byChoiceGroup.get(cg) ?? []
      list.push(item)
      byChoiceGroup.set(cg, list)
      continue
    }
    fixed.push(item)
  }

  // 레거시: choice_group 없이 동일 menuId·수량에 옵션만 여러 개면 선택형으로 보고 제외
  const optionKeysByMenuQty = new Map<string, Set<string>>()
  for (const item of fixed) {
    const key = `${str(item.menuId)}::${Math.max(1, Number(item.quantity) || 1)}`
    const bucket = optionKeysByMenuQty.get(key) ?? new Set<string>()
    const opt = str(item.optionId)
    if (opt) bucket.add(opt)
    optionKeysByMenuQty.set(key, bucket)
  }
  const implicitChoiceKeys = new Set<string>()
  for (const [key, opts] of optionKeysByMenuQty.entries()) {
    if (opts.size > 1) implicitChoiceKeys.add(key)
  }
  const fixedOnly = fixed.filter((item) => {
    const key = `${str(item.menuId)}::${Math.max(1, Number(item.quantity) || 1)}`
    return !implicitChoiceKeys.has(key)
  })

  const lineKey = normalizePromoLookupText(lineName)
  const chosen: PromoEconomicsLineInput[] = []
  for (const options of byChoiceGroup.values()) {
    let best: PromoEconomicsLineInput | null = null
    let bestLen = 0
    for (const opt of options) {
      const meta = resolveMenuMeta(str(opt.menuId), '', menuCatalog)
      const menuName = str(meta?.name)
      if (!menuName || !lineKey) continue
      const nameKey = normalizePromoLookupText(menuName)
      if (!nameKey) continue
      if (lineKey.includes(nameKey) && nameKey.length > bestLen) {
        best = opt
        bestLen = nameKey.length
      }
    }
    if (best) chosen.push(best)
  }

  return [...fixedOnly, ...chosen]
}

function mapPromoRawToChildren(raw: unknown[]): LineContribution[] {
  const out: LineContribution[] = []
  for (const child of raw) {
    if (!child || typeof child !== 'object') continue
    const c = child as Record<string, unknown>
    const menuId = str(c.menuId ?? c.menu_id)
    const optionId = str(c.optionId ?? c.option_id)
    const optionCode = str(c.optionCode ?? c.option_code)
    const qty = Math.max(0, resolveItemsJsonLineQty(c))
    if (qty <= 0) continue
    const menuName = str(c.menuName ?? c.menu_name) || EMPTY_MENU
    const optionName = str(c.optionName ?? c.option_name)
    out.push({
      menuId,
      optionId,
      optionCode,
      menuName,
      optionName,
      categoryMain: '',
      category: '',
      qty,
      sales: 0,
    })
  }
  return out
}

function promoChildLines(
  row: Record<string, unknown>,
  menuCatalog: ReturnType<typeof buildMenuCatalog>,
  promoCatalog?: PosSalesPromoExpandCatalog
): { children: LineContribution[]; fromCatalog: boolean } {
  const raw = row.promoItems ?? row.promo_items
  if (Array.isArray(raw) && raw.length > 0) {
    return { children: mapPromoRawToChildren(raw), fromCatalog: false }
  }

  if (!promoCatalog || !looksLikePromoSetLine(row)) {
    return { children: [], fromCatalog: false }
  }

  const promoId = resolvePromoIdForHierarchyExpand(row, promoCatalog)
  if (!promoId) return { children: [], fromCatalog: false }
  const template = promoCatalog.promoItemsByPromoId.get(promoId)
  if (!template?.length) return { children: [], fromCatalog: false }

  const filtered = filterCatalogTemplateForExpand(template, str(row.name), menuCatalog)
  if (!filtered.length) return { children: [], fromCatalog: false }

  const synthetic = filtered.map((item) => ({
    menuId: str(item.menuId),
    optionId: item.optionId != null ? str(item.optionId) : '',
    quantity: Math.max(1, Number(item.quantity) || 1),
    menuName: '',
  }))
  return { children: mapPromoRawToChildren(synthetic), fromCatalog: true }
}

function lineToContributions(
  row: Record<string, unknown>,
  menuCatalog: ReturnType<typeof buildMenuCatalog>,
  optionCatalog: ReturnType<typeof buildOptionCatalog>,
  searchTokens: string[] = [],
  searchAnd = false,
  promoCatalog?: PosSalesPromoExpandCatalog
): LineContribution[] {
  const { children: promoChildren, fromCatalog } = promoChildLines(row, menuCatalog, promoCatalog)
  const qty = resolveItemsJsonLineQty(row)
  if (qty <= 0) return []

  const parentMatchesSearch =
    searchTokens.length > 0 &&
    promoChildren.length > 0 &&
    parentPromoLineMatchesSearch(row, searchTokens, searchAnd)

  if (parentMatchesSearch) {
    const lineName = str(row.name) || EMPTY_MENU
    const promoGroup = parsePromoBracketName(lineName)
    const sales = resolveLineSales(row, qty)
    const promoId = str(row.promoId ?? row.promo_id) || resolvePromoIdForHierarchyExpand(row, promoCatalog)
    return [
      {
        menuId: promoId ? `promo:${promoId}` : '',
        optionId: '',
        optionCode: '',
        menuName: lineName,
        optionName: DEFAULT_OPTION_LABEL,
        categoryMain: promoGroup || EMPTY_MAIN,
        category: promoGroup || EMPTY_CATEGORY,
        qty,
        sales,
      },
    ]
  }

  if (promoChildren.length > 0) {
    const parentSales = resolveLineSales(row, qty)
    const childQtySum = promoChildren.reduce((s, c) => s + c.qty, 0)
    const promoRaw = fromCatalog
      ? promoChildren.map((c) => ({
          menuId: c.menuId,
          optionId: c.optionId,
          optionCode: c.optionCode,
          menuName: c.menuName,
          optionName: c.optionName,
          quantity: c.qty,
        }))
      : ((row.promoItems ?? row.promo_items) as unknown[])
    return promoChildren.map((child, idx) => {
      const rawChild =
        Array.isArray(promoRaw) && promoRaw[idx] && typeof promoRaw[idx] === 'object'
          ? (promoRaw[idx] as Record<string, unknown>)
          : ({
              optionName: child.optionName,
              optionId: child.optionId,
              optionCode: child.optionCode,
              menuId: child.menuId,
            } as Record<string, unknown>)
      const identity = resolveContributionMenuIdentity(
        child.menuId,
        child.menuName || EMPTY_MENU,
        menuCatalog
      )
      const menuName = identity.menuName || child.menuName || EMPTY_MENU
      const optionName =
        str(child.optionName) ||
        resolveLineOptionDisplayName(
          rawChild,
          identity.menuId || child.menuId,
          menuName,
          child.optionId,
          child.optionCode,
          optionCatalog
        )
      const sales =
        childQtySum > 0 ? (parentSales * child.qty) / childQtySum : 0
      return {
        ...child,
        menuId: identity.menuId || child.menuId,
        menuName,
        optionName,
        categoryMain: str(identity.menuMeta?.category_main) || EMPTY_MAIN,
        category: str(identity.menuMeta?.category) || EMPTY_CATEGORY,
        sales,
      }
    })
  }

  const qtySales = resolveLineSales(row, qty)
  const banban = resolveBanbanSalesContribution(row, menuCatalog, qty, qtySales)
  if (banban) return [banban]

  const lineName = str(row.name) || EMPTY_MENU
  const rawMenuId = resolveLineMenuId(row)
  const optionId = resolveLineOptionId(row)
  const optionCode = resolveLineOptionCode(row)
  const identity = resolveContributionMenuIdentity(rawMenuId, lineName, menuCatalog)
  const optionName = resolveLineOptionDisplayName(
    row,
    identity.menuId || rawMenuId,
    identity.menuName,
    optionId,
    optionCode,
    optionCatalog
  )
  const optionFromLine =
    optionName === DEFAULT_OPTION_LABEL && identity.lineOptionSuffix
      ? identity.lineOptionSuffix
      : optionName

  return [
    {
      menuId: identity.menuId,
      optionId,
      optionCode,
      menuName: identity.menuName,
      optionName: optionFromLine,
      categoryMain:
        str(row.category_main ?? row.categoryMain) ||
        str(identity.menuMeta?.category_main) ||
        EMPTY_MAIN,
      category:
        str(row.category ?? row.categoryName) ||
        str(identity.menuMeta?.category) ||
        EMPTY_CATEGORY,
      qty,
      sales: qtySales,
    },
  ]
}

function rowsFromBuckets(
  entries: Array<[string, Bucket & { label: string; meta?: Partial<PosSalesHierarchyRow> }]>
): PosSalesHierarchyRow[] {
  return entries
    .map(([key, v]) => ({
      key,
      label: v.label,
      qty: v.qty,
      sales: v.sales,
      ...v.meta,
    }))
    .sort((a, b) => b.sales - a.sales || b.qty - a.qty || a.label.localeCompare(b.label))
}

export function aggregatePosSalesMenuHierarchy(params: {
  orderRows: { items_json?: string | null; status?: string }[]
  menus: PosMenuCatalogRow[]
  options: PosOptionCatalogRow[]
  completedStatuses?: string[]
  /** 검색 시 프로모 세트명·구성 메뉴명으로 주문 줄 선별 */
  searchTokens?: string[]
  searchAnd?: boolean
  /** promoItems 스냅샷 없을 때 DB 세트 구성으로 분해 */
  promoCatalog?: PosSalesPromoExpandCatalog
}): {
  levels: Record<PosSalesHierarchyLevel, PosSalesHierarchyRow[]>
  totals: { qty: number; sales: number }
} {
  const completed = new Set(
    params.completedStatuses ?? ['completed', 'paid', 'ready']
  )
  const searchTokens = params.searchTokens ?? []
  const searchAnd = params.searchAnd ?? false
  const menuCatalog = buildMenuCatalog(params.menus)
  const optionCatalog = buildOptionCatalog(params.options)
  const promoCatalog = params.promoCatalog

  const mainMap = new Map<string, Bucket & { label: string }>()
  const categoryMap = new Map<string, Bucket & { label: string; meta?: Partial<PosSalesHierarchyRow> }>()
  const menuMap = new Map<string, Bucket & { label: string; meta?: Partial<PosSalesHierarchyRow> }>()
  const optionMap = new Map<string, Bucket & { label: string; meta?: Partial<PosSalesHierarchyRow> }>()

  let totalQty = 0
  let totalSales = 0

  for (const order of params.orderRows) {
    if (!completed.has(str(order.status))) continue
    let items: Record<string, unknown>[] = []
    try {
      const parsed = JSON.parse(order.items_json || '[]')
      items = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []
    } catch {
      continue
    }

    for (const row of items) {
      if (isLineCancelled(row)) continue
      if (
        searchTokens.length > 0 &&
        !orderLineMatchesMenuSearch(row, searchTokens, searchAnd, menuCatalog)
      ) {
        continue
      }
      const contributions = lineToContributions(
        row,
        menuCatalog,
        optionCatalog,
        searchTokens,
        searchAnd,
        promoCatalog
      )
      for (const c of contributions) {
        totalQty += c.qty
        totalSales += c.sales

        const mainKey = c.categoryMain || EMPTY_MAIN
        const mainLabel = c.categoryMain || EMPTY_MAIN
        const mainBucket = mainMap.get(mainKey) ?? { qty: 0, sales: 0, label: mainLabel }
        mainBucket.qty += c.qty
        mainBucket.sales += c.sales
        mainMap.set(mainKey, mainBucket)

        const catKey = `${mainKey}::${c.category || EMPTY_CATEGORY}`
        const catLabel = c.category || EMPTY_CATEGORY
        const catBucket = categoryMap.get(catKey) ?? {
          qty: 0,
          sales: 0,
          label: catLabel,
          meta: { categoryMain: mainLabel, category: catLabel },
        }
        catBucket.qty += c.qty
        catBucket.sales += c.sales
        categoryMap.set(catKey, catBucket)

        const menuKey = resolveMenuAggregationKey(c.menuId, c.menuName)
        const menuBucket = menuMap.get(menuKey) ?? {
          qty: 0,
          sales: 0,
          label: c.menuName,
          meta: {
            menuId: c.menuId || undefined,
            categoryMain: mainLabel,
            category: catLabel,
          },
        }
        menuBucket.qty += c.qty
        menuBucket.sales += c.sales
        if (!menuBucket.meta?.menuId && c.menuId) {
          menuBucket.meta = { ...menuBucket.meta, menuId: c.menuId }
        }
        if (
          (menuBucket.meta?.categoryMain === EMPTY_MAIN || !menuBucket.meta?.categoryMain) &&
          mainLabel !== EMPTY_MAIN
        ) {
          menuBucket.meta = {
            ...menuBucket.meta,
            categoryMain: mainLabel,
            category:
              catLabel !== EMPTY_CATEGORY ? catLabel : menuBucket.meta?.category,
          }
        } else if (
          (menuBucket.meta?.category === EMPTY_CATEGORY || !menuBucket.meta?.category) &&
          catLabel !== EMPTY_CATEGORY
        ) {
          menuBucket.meta = { ...menuBucket.meta, category: catLabel }
        }
        menuMap.set(menuKey, menuBucket)

        const optKey = resolveOptionAggregationKey(
          menuKey,
          c.optionId,
          c.optionCode,
          c.optionName
        )
        const optLabel = c.optionName
        const optBucket = optionMap.get(optKey) ?? {
          qty: 0,
          sales: 0,
          label: `${c.menuName} — ${optLabel}`,
          meta: {
            menuId: c.menuId || undefined,
            categoryMain: mainLabel,
            category: catLabel,
          },
        }
        optBucket.qty += c.qty
        optBucket.sales += c.sales
        optionMap.set(optKey, optBucket)
      }
    }
  }

  return {
    levels: {
      main: rowsFromBuckets([...mainMap.entries()]),
      category: rowsFromBuckets([...categoryMap.entries()]),
      menu: rowsFromBuckets([...menuMap.entries()]),
      option: rowsFromBuckets([...optionMap.entries()]),
    },
    totals: { qty: totalQty, sales: totalSales },
  }
}

export function filterHierarchyRows(
  rows: PosSalesHierarchyRow[],
  searchTokens: string[],
  searchAnd: boolean
): PosSalesHierarchyRow[] {
  if (searchTokens.length === 0) return rows
  return rows.filter((row) => {
    const haystack = [row.label, row.categoryMain, row.category, row.menuId]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return searchAnd
      ? searchTokens.every((t) => haystack.includes(t))
      : searchTokens.some((t) => haystack.includes(t))
  })
}

export type PosSalesDrillFilter = {
  main?: string
  category?: string
  menu?: string
}

/** Total Sales 드릴다운 — 상위 행 클릭 시 하위 레벨을 부모 기준으로 좁힘 */
export function filterHierarchyRowsByDrill<
  T extends { label: string; categoryMain?: string; category?: string },
>(rows: T[], level: PosSalesHierarchyLevel, drill: PosSalesDrillFilter): T[] {
  if (!drill.main && !drill.category && !drill.menu) return rows
  if (level === 'main') return rows

  let filtered = rows
  if (drill.main) {
    filtered = filtered.filter((r) => (r.categoryMain || '') === drill.main)
  }
  if (level === 'category') return filtered

  if (drill.category) {
    filtered = filtered.filter((r) => (r.category || '') === drill.category)
  }
  if (level === 'menu') return filtered

  if (drill.menu) {
    const prefix = `${drill.menu} —`
    filtered = filtered.filter((r) => r.label.startsWith(prefix) || r.label === drill.menu)
  }
  return filtered
}

export function sumHierarchyRows(rows: PosSalesHierarchyRow[]): { qty: number; sales: number } {
  return rows.reduce(
    (acc, r) => ({ qty: acc.qty + r.qty, sales: acc.sales + r.sales }),
    { qty: 0, sales: 0 }
  )
}
