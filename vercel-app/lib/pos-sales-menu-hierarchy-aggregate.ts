import { resolveItemsJsonLineQty } from '@/lib/pos-order-item-map'

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

function resolveLineMenuId(row: Record<string, unknown>): string {
  return str(row.menuId1 ?? row.menu_id1 ?? row.menuId ?? row.menu_id ?? row.id)
}

function resolveLineOptionId(row: Record<string, unknown>): string {
  return str(row.optionId1 ?? row.option_id1 ?? row.optionId ?? row.option_id)
}

function resolveLineOptionCode(row: Record<string, unknown>): string {
  return str(row.optionCode1 ?? row.option_code1 ?? row.optionCode ?? row.option_code)
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

function promoChildLines(row: Record<string, unknown>): LineContribution[] {
  const raw = row.promoItems ?? row.promo_items
  if (!Array.isArray(raw) || raw.length === 0) return []
  const out: LineContribution[] = []
  for (const child of raw) {
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

function lineToContributions(
  row: Record<string, unknown>,
  menuCatalog: ReturnType<typeof buildMenuCatalog>,
  optionCatalog: ReturnType<typeof buildOptionCatalog>
): LineContribution[] {
  const promoChildren = promoChildLines(row)
  const qty = resolveItemsJsonLineQty(row)
  if (qty <= 0) return []

  if (promoChildren.length > 0) {
    const parentSales = resolveLineSales(row, qty)
    const childQtySum = promoChildren.reduce((s, c) => s + c.qty, 0)
    const promoRaw = (row.promoItems ?? row.promo_items) as unknown[]
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
      const menuMeta = resolveMenuMeta(child.menuId, child.menuName, menuCatalog)
      const menuName = str(menuMeta?.name) || child.menuName || EMPTY_MENU
      const optionName =
        str(child.optionName) ||
        resolveLineOptionDisplayName(
          rawChild,
          child.menuId,
          menuName,
          child.optionId,
          child.optionCode,
          optionCatalog
        )
      const sales =
        childQtySum > 0 ? (parentSales * child.qty) / childQtySum : 0
      return {
        ...child,
        menuName,
        optionName,
        categoryMain: str(menuMeta?.category_main) || EMPTY_MAIN,
        category: str(menuMeta?.category) || EMPTY_CATEGORY,
        sales,
      }
    })
  }

  const lineName = str(row.name) || EMPTY_MENU
  const menuId = resolveLineMenuId(row)
  const optionId = resolveLineOptionId(row)
  const optionCode = resolveLineOptionCode(row)
  const menuMeta = resolveMenuMeta(menuId, lineName, menuCatalog)
  const menuName = str(menuMeta?.name) || lineName
  const optionName = resolveLineOptionDisplayName(
    row,
    menuId,
    menuName,
    optionId,
    optionCode,
    optionCatalog
  )
  const sales = resolveLineSales(row, qty)

  return [
    {
      menuId: menuId || str(menuMeta?.id),
      optionId,
      optionCode,
      menuName,
      optionName,
      categoryMain:
        str(row.category_main ?? row.categoryMain) ||
        str(menuMeta?.category_main) ||
        EMPTY_MAIN,
      category: str(row.category ?? row.categoryName) || str(menuMeta?.category) || EMPTY_CATEGORY,
      qty,
      sales,
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
}): {
  levels: Record<PosSalesHierarchyLevel, PosSalesHierarchyRow[]>
  totals: { qty: number; sales: number }
} {
  const completed = new Set(
    params.completedStatuses ?? ['completed', 'paid', 'ready']
  )
  const menuCatalog = buildMenuCatalog(params.menus)
  const optionCatalog = buildOptionCatalog(params.options)

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
      const contributions = lineToContributions(row, menuCatalog, optionCatalog)
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

        const menuKey = c.menuId || c.menuName
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
        menuMap.set(menuKey, menuBucket)

        const optKey = `${menuKey}::${c.optionId || c.optionCode || c.optionName}`
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
