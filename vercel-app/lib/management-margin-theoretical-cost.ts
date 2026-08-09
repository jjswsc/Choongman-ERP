import { resolveItemsJsonLineQty } from '@/lib/pos-order-item-map'
import { parseGrabSetChildLineName } from '@/lib/grab-set-pos-lines'
import type { PosMenuCostIndexEntry } from '@/lib/pos-menu-cost-index-server'
import type { PromoLineLike, PromoMenuLike, PromoOptionLike } from '@/lib/promo-economics'
import type { PromoPricingCatalog } from '@/lib/pos-order-promo-regular-price'

/** 전역 미즈 미사용 — BOM 재료별 loss_rate만 반영 */
export const MANAGEMENT_MARGIN_MISE_RATE = 0

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function parseOrderItems(itemsJson: string | undefined): Record<string, unknown>[] {
  if (!itemsJson) return []
  try {
    const parsed = JSON.parse(itemsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function isLineCancelled(row: Record<string, unknown>): boolean {
  return Boolean(str(row.cancelledAt ?? row.cancelled_at))
}

function resolveLineMenuId(row: Record<string, unknown>): string {
  return str(row.menuId1 ?? row.menu_id1 ?? row.menuId ?? row.menu_id)
}

function resolveLineOptionId(row: Record<string, unknown>): string {
  return str(row.optionId1 ?? row.option_id1 ?? row.optionId ?? row.option_id)
}

export function isDeliveryChannelOrderType(orderType: string | undefined): boolean {
  const t = str(orderType).toLowerCase()
  if (!t) return false
  return (
    t.includes('delivery') ||
    t.includes('grab') ||
    t.includes('lineman') ||
    t.includes('foodpanda') ||
    t.includes('shopee') ||
    t.includes('app') ||
    t === 'takeaway' ||
    t === 'take_out' ||
    t === 'takeout' ||
    t.includes('포장') ||
    t.includes('배달')
  )
}

export type TheoreticalCostAgg = {
  foodCost: number
  packagingCost: number
  totalCost: number
  matchedLineQty: number
  unmatchedLineQty: number
}

export type BomUnmatchedReason = 'missing_menu_id' | 'missing_bom'

export type TheoreticalCostUnmatchedLine = {
  menuId: string
  optionId: string
  menuLabel: string
  optionLabel: string
  reason: BomUnmatchedReason
  lineQty: number
}

function resolveLineMenuName(row: Record<string, unknown>): string {
  return str(row.menuName ?? row.menu_name ?? row.name)
}

function resolveLineOptionName(row: Record<string, unknown>): string {
  return str(row.optionName ?? row.option_name)
}

function unmatchedBucketKey(reason: BomUnmatchedReason, menuId: string, optionId: string): string {
  return `${reason}|${menuId}|${optionId}`
}

function formatMenuLabel(menuId: string, menuName: string): string {
  if (menuName) return menuName
  if (menuId) return `#${menuId}`
  return '—'
}

function normalizeLookupName(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export type TheoreticalCostResolveContext = {
  knownMenuIds: Set<string>
  menuIdByNormalizedName: Map<string, string>
  /** menuId → 카탈로그 메뉴명 */
  menuNameById: Map<string, string>
  /** menuId → 옵션 목록(이름 포함) */
  optionsByMenuId: Record<string, PromoOptionLike[]>
  /**
   * normalize(menu.name + ' ' + option.name) → { menuId, optionId }
   * 긴 옵션명 우선(등록 순서에서 나중에 오는 짧은 이름이 덮어쓰지 않도록 길이 내림차순 등록).
   */
  composedMenuOptionByNormalizedName: Map<string, { menuId: string; optionId: string }>
  promoItemsByPromoId?: Map<string, PromoLineLike[]>
  /** POS 세트 미러 메뉴 id → promo id */
  promoIdByMirrorMenuId?: Map<string, string>
  /** 세트/프로모 이름 → promo id */
  promoIdByNormalizedName?: Map<string, string>
  /** SET-xxx 등 프로모 코드 → promo id */
  promoIdByCode?: Map<string, string>
}

export function buildTheoreticalCostResolveContext(params: {
  costIndex: Map<string, PosMenuCostIndexEntry>
  catalog?: Pick<
    PromoPricingCatalog,
    'menus' | 'optionsByMenuId' | 'promoItemsByPromoId' | 'promoMetaById' | 'promoIdByMirrorMenuId'
  >
}): TheoreticalCostResolveContext {
  const knownMenuIds = new Set<string>()
  for (const key of params.costIndex.keys()) {
    const mid = key.split('|')[0]?.trim()
    if (mid) knownMenuIds.add(mid)
  }
  const menuIdByNormalizedName = new Map<string, string>()
  const promoIdByNormalizedName = new Map<string, string>()
  const promoIdByCode = new Map<string, string>()
  const menuNameById = new Map<string, string>()
  for (const menu of params.catalog?.menus ?? []) {
    const id = str(menu.id)
    const name = str((menu as PromoMenuLike).name)
    if (id) knownMenuIds.add(id)
    if (!id || !name) continue
    menuIdByNormalizedName.set(normalizeLookupName(name), id)
    menuNameById.set(id, name)
  }
  for (const [promoId, meta] of params.catalog?.promoMetaById ?? []) {
    const name = str(meta.name)
    const code = str(meta.code).toUpperCase()
    if (name) promoIdByNormalizedName.set(normalizeLookupName(name), promoId)
    if (code) promoIdByCode.set(code, promoId)
  }

  const optionsByMenuId = params.catalog?.optionsByMenuId ?? {}
  const composedCandidates: { key: string; menuId: string; optionId: string; optLen: number }[] = []
  for (const [menuId, opts] of Object.entries(optionsByMenuId)) {
    const menuName = menuNameById.get(menuId)
    if (!menuName) continue
    for (const opt of opts || []) {
      const optionId = str(opt.id)
      const optName = str(opt.name)
      if (!optionId || !optName) continue
      composedCandidates.push({
        key: normalizeLookupName(`${menuName} ${optName}`),
        menuId,
        optionId,
        optLen: optName.length,
      })
    }
  }
  composedCandidates.sort((a, b) => b.optLen - a.optLen || a.key.localeCompare(b.key))
  const composedMenuOptionByNormalizedName = new Map<string, { menuId: string; optionId: string }>()
  for (const c of composedCandidates) {
    if (!c.key || composedMenuOptionByNormalizedName.has(c.key)) continue
    composedMenuOptionByNormalizedName.set(c.key, { menuId: c.menuId, optionId: c.optionId })
  }

  return {
    knownMenuIds,
    menuIdByNormalizedName,
    menuNameById,
    optionsByMenuId,
    composedMenuOptionByNormalizedName,
    promoItemsByPromoId: params.catalog?.promoItemsByPromoId,
    promoIdByMirrorMenuId: params.catalog?.promoIdByMirrorMenuId,
    promoIdByNormalizedName,
    promoIdByCode,
  }
}

function lookupMenuIdByName(name: string, ctx?: TheoreticalCostResolveContext): string {
  const key = normalizeLookupName(name)
  if (!key || !ctx) return ''
  return ctx.menuIdByNormalizedName.get(key) ?? ''
}

function lookupComposedMenuOption(
  name: string,
  ctx?: TheoreticalCostResolveContext
): { menuId: string; optionId: string } | null {
  const key = normalizeLookupName(name)
  if (!key || !ctx) return null
  return ctx.composedMenuOptionByNormalizedName.get(key) ?? null
}

/** 라인명·옵션명이 해당 메뉴 옵션명과 일치/접미하면 optionId 복원 */
function inferOptionIdFromNames(params: {
  menuId: string
  lineName: string
  optionName: string
  ctx?: TheoreticalCostResolveContext
}): string {
  const menuId = str(params.menuId)
  if (!menuId || !params.ctx) return ''
  const opts = params.ctx.optionsByMenuId[menuId] || []
  if (!opts.length) return ''

  const optionNameKey = normalizeLookupName(params.optionName)
  if (optionNameKey) {
    for (const opt of opts) {
      const on = normalizeLookupName(str(opt.name))
      if (on && on === optionNameKey) return str(opt.id)
    }
  }

  const lineKey = normalizeLookupName(params.lineName)
  if (!lineKey) return ''

  const ranked = [...opts]
    .map((opt) => ({ id: str(opt.id), name: str(opt.name), key: normalizeLookupName(str(opt.name)) }))
    .filter((o) => o.id && o.key)
    .sort((a, b) => b.key.length - a.key.length)

  for (const opt of ranked) {
    if (lineKey === opt.key) return opt.id
    if (lineKey.endsWith(` ${opt.key}`) || lineKey.endsWith(opt.key)) return opt.id
  }
  return ''
}

function resolveMenuIdFromLineId(id: string, knownMenuIds: Set<string>): string {
  const s = str(id)
  if (!s || s.toLowerCase().startsWith('promo-')) return ''
  if (knownMenuIds.has(s)) return s
  let best = ''
  for (const key of knownMenuIds) {
    if (s === key || s.startsWith(`${key}-`)) {
      if (key.length > best.length) best = key
    }
  }
  if (best) return best
  const dash = s.indexOf('-')
  if (dash > 0) {
    const prefix = s.slice(0, dash)
    if (/^\d+$/.test(prefix)) return prefix
  }
  return ''
}

function resolveOptionIdFromLineId(id: string, menuId: string): string {
  const s = str(id)
  const mid = str(menuId)
  if (!s || !mid || !s.startsWith(`${mid}-`)) return ''
  return s.slice(mid.length + 1).trim()
}

function isGrabSetChildRow(row: Record<string, unknown>): boolean {
  return row.grabSetChild === true || row.grab_set_child === true
}

function resolvePromoIdForCostRow(
  row: Record<string, unknown>,
  ctx?: TheoreticalCostResolveContext
): string {
  const direct = str(row.promoId ?? row.promo_id)
  if (direct) return direct

  const promoCode = str(row.promoCode ?? row.promo_code).toUpperCase()
  if (promoCode && ctx?.promoIdByCode?.has(promoCode)) {
    return ctx.promoIdByCode.get(promoCode) ?? ''
  }

  let menuId = resolveLineMenuId(row)
  if (!menuId) menuId = resolveMenuIdFromLineId(str(row.id), ctx?.knownMenuIds ?? new Set())

  if (menuId && ctx?.promoIdByMirrorMenuId?.has(menuId)) {
    return ctx.promoIdByMirrorMenuId.get(menuId) ?? ''
  }

  const lineName = resolveLineMenuName(row)
  const grabParsed = parseGrabSetChildLineName(lineName)
  const promoLookupName = grabParsed?.promoLabel || lineName
  if (promoLookupName && ctx?.promoIdByNormalizedName) {
    const byName = ctx.promoIdByNormalizedName.get(normalizeLookupName(promoLookupName))
    if (byName) return byName
  }

  return ''
}

function effectivePromoItemRows(
  row: Record<string, unknown>,
  ctx?: TheoreticalCostResolveContext
): Record<string, unknown>[] {
  const raw = row.promoItems ?? row.promo_items
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
  }
  const promoId = resolvePromoIdForCostRow(row, ctx)
  if (!promoId || !ctx?.promoItemsByPromoId) return []
  const template = ctx.promoItemsByPromoId.get(promoId)
  if (!template?.length) return []
  return template.map((item) => ({
    menuId: item.menuId,
    optionId: item.optionId ?? null,
    quantity: item.quantity ?? 1,
  }))
}

/** "… With Rice" 전용 SKU/합성명을 기본메뉴+옵션으로 분해 */
function resolveComposedOrWithRicePair(
  lookupName: string,
  currentMenuId: string,
  ctx?: TheoreticalCostResolveContext
): { menuId: string; optionId: string } | null {
  if (!ctx) return null

  const tryNames = [lookupName]
  if (currentMenuId) {
    const catalogName = ctx.menuNameById.get(currentMenuId) || ''
    if (catalogName && normalizeLookupName(catalogName) !== normalizeLookupName(lookupName)) {
      tryNames.push(catalogName)
    } else if (catalogName) {
      tryNames.push(catalogName)
    }
  }

  for (const name of tryNames) {
    const composed = lookupComposedMenuOption(name, ctx)
    if (composed) return composed
  }

  for (const name of tryNames) {
    const key = normalizeLookupName(name)
    const m = key.match(/^(.+?)\s+with\s+rice$/)
    if (!m?.[1]) continue
    const baseName = m[1].trim()
    if (!baseName) continue
    const baseMenuId = lookupMenuIdByName(baseName, ctx)
    if (!baseMenuId) continue
    // 이미 base 메뉴인데 option만 없는 경우·전용 SKU에서 base로 옮기는 경우 모두
    const optId =
      inferOptionIdFromNames({
        menuId: baseMenuId,
        lineName: name,
        optionName: 'With Rice',
        ctx,
      }) ||
      inferOptionIdFromNames({
        menuId: baseMenuId,
        lineName: name,
        optionName: '',
        ctx,
      })
    if (optId) return { menuId: baseMenuId, optionId: optId }
  }

  return null
}

function resolveMenuAndOptionForCostLine(
  row: Record<string, unknown>,
  ctx?: TheoreticalCostResolveContext
): { menuId: string; optionId: string } {
  let menuId = resolveLineMenuId(row)
  let optionId = resolveLineOptionId(row)
  const knownMenuIds = ctx?.knownMenuIds ?? new Set<string>()
  const lineName = resolveLineMenuName(row)
  const optionName = resolveLineOptionName(row)
  const grabParsed = parseGrabSetChildLineName(lineName)
  const lookupName = grabParsed?.childName || lineName

  if (!menuId) {
    menuId = resolveMenuIdFromLineId(str(row.id), knownMenuIds)
    if (menuId && !optionId) optionId = resolveOptionIdFromLineId(str(row.id), menuId)
  }

  // optionId 비어 있으면 합성명·With Rice 접미·전용 SKU 카탈로그명으로 기본+옵션 복원
  // (주문 menu_id=29 + option null + name "KIMCHI SOUP With Rice" 패턴)
  if (!optionId) {
    const remapped = resolveComposedOrWithRicePair(lookupName, menuId, ctx)
    if (remapped) {
      menuId = remapped.menuId
      optionId = remapped.optionId
    }
  }

  if (!menuId && lookupName) {
    menuId = lookupMenuIdByName(lookupName, ctx)
  }

  if (menuId && !optionId) {
    optionId = inferOptionIdFromNames({ menuId, lineName: lookupName, optionName, ctx })
  }

  return { menuId, optionId }
}

function formatOptionLabel(optionId: string, optionName: string): string {
  if (optionName) return optionName
  if (optionId) return `#${optionId}`
  return '—'
}

function resolveLineMenuId2(row: Record<string, unknown>): string {
  return str(row.menuId2 ?? row.menu_id2)
}

function resolveLineOptionId2(row: Record<string, unknown>): string {
  return str(row.optionId2 ?? row.option_id2)
}

export type TheoreticalCostLookupLine = {
  menuId: string
  optionId: string
  menuName: string
  optionName: string
  qty: number
}

function promoChildCostLines(
  promoRows: Record<string, unknown>[],
  parentQty: number,
  ctx?: TheoreticalCostResolveContext
): TheoreticalCostLookupLine[] {
  if (!promoRows.length) return []
  const out: TheoreticalCostLookupLine[] = []
  for (const c of promoRows) {
    const childQty = Math.max(0, resolveItemsJsonLineQty(c))
    if (childQty <= 0) continue
    const qty = parentQty * childQty
    if (qty <= 0) continue
    const menuName = str(c.menuName ?? c.menu_name)
    const optionName = str(c.optionName ?? c.option_name)
    const resolved = resolveMenuAndOptionForCostLine(
      {
        ...c,
        menuId: c.menuId ?? c.menu_id,
        optionId: c.optionId ?? c.option_id,
        menuName,
        optionName,
        name: menuName || str(c.name),
      },
      ctx
    )
    out.push({
      menuId: resolved.menuId,
      optionId: resolved.optionId,
      menuName,
      optionName,
      qty,
    })
  }
  return out
}

/** 주문 줄 → BOM lookup 단위(세트 promoItems·반반 menuId2 펼침) */
export function expandOrderLineToCostLines(
  row: Record<string, unknown>,
  ctx?: TheoreticalCostResolveContext
): TheoreticalCostLookupLine[] {
  if (isGrabSetChildRow(row)) return []

  const parentQty = Math.max(0, resolveItemsJsonLineQty(row))
  if (parentQty <= 0) return []

  const promoRows = effectivePromoItemRows(row, ctx)
  const promoChildren = promoChildCostLines(promoRows, parentQty, ctx)
  if (promoChildren.length > 0) return promoChildren

  const menuName = resolveLineMenuName(row)
  const optionName = resolveLineOptionName(row)
  const { menuId, optionId } = resolveMenuAndOptionForCostLine(row, ctx)
  const menuId2 = resolveLineMenuId2(row)

  if (menuId && menuId2) {
    const halfQty = parentQty * 0.5
    return [
      {
        menuId,
        optionId,
        menuName,
        optionName,
        qty: halfQty,
      },
      {
        menuId: menuId2,
        optionId: resolveLineOptionId2(row),
        menuName,
        optionName,
        qty: halfQty,
      },
    ]
  }

  return [
    {
      menuId,
      optionId,
      menuName,
      optionName,
      qty: parentQty,
    },
  ]
}

function lookupCostEntry(
  costIndex: Map<string, PosMenuCostIndexEntry>,
  menuId: string,
  optionId: string
): PosMenuCostIndexEntry | undefined {
  const keyWithOpt = `${menuId}|${optionId}`
  const keyBase = `${menuId}|`
  return costIndex.get(keyWithOpt) ?? costIndex.get(keyBase)
}

export function collectTheoreticalCostUnmatchedLines(params: {
  orderRows: { order_type?: string; items_json?: string }[]
  costIndex: Map<string, PosMenuCostIndexEntry>
  resolveContext?: TheoreticalCostResolveContext
}): TheoreticalCostUnmatchedLine[] {
  const bucket = new Map<string, TheoreticalCostUnmatchedLine>()

  const upsert = (key: string, row: TheoreticalCostUnmatchedLine, menuName: string, optionName: string) => {
    const prev = bucket.get(key)
    if (prev) {
      prev.lineQty += row.lineQty
      if (!prev.menuLabel || prev.menuLabel.startsWith('#')) {
        prev.menuLabel = formatMenuLabel(prev.menuId, menuName || prev.menuLabel)
      }
      if (!prev.optionLabel || prev.optionLabel.startsWith('#')) {
        prev.optionLabel = formatOptionLabel(prev.optionId, optionName || prev.optionLabel)
      }
      return
    }
    bucket.set(key, { ...row })
  }

  for (const order of params.orderRows) {
    for (const row of parseOrderItems(order.items_json)) {
      if (isLineCancelled(row)) continue
      for (const line of expandOrderLineToCostLines(row, params.resolveContext)) {
        const { menuId, optionId, menuName, optionName, qty } = line
        if (qty <= 0) continue
        if (!menuId) {
          const labelKey = menuName || '—'
          const key = unmatchedBucketKey('missing_menu_id', labelKey, optionId)
          upsert(
            key,
            {
              menuId: '',
              optionId,
              menuLabel: formatMenuLabel('', menuName),
              optionLabel: formatOptionLabel(optionId, optionName),
              reason: 'missing_menu_id',
              lineQty: qty,
            },
            menuName,
            optionName
          )
          continue
        }
        if (!lookupCostEntry(params.costIndex, menuId, optionId)) {
          const key = unmatchedBucketKey('missing_bom', menuId, optionId)
          upsert(
            key,
            {
              menuId,
              optionId,
              menuLabel: formatMenuLabel(menuId, menuName),
              optionLabel: formatOptionLabel(optionId, optionName),
              reason: 'missing_bom',
              lineQty: qty,
            },
            menuName,
            optionName
          )
        }
      }
    }
  }

  return [...bucket.values()].sort((a, b) => b.lineQty - a.lineQty || a.menuLabel.localeCompare(b.menuLabel))
}

export function aggregateTheoreticalCostFromOrders(params: {
  orderRows: { order_type?: string; items_json?: string }[]
  costIndex: Map<string, PosMenuCostIndexEntry>
  miseRatePercent?: number
  resolveContext?: TheoreticalCostResolveContext
}): TheoreticalCostAgg {
  let foodCost = 0
  let packagingCost = 0
  let matchedLineQty = 0
  let unmatchedLineQty = 0

  for (const order of params.orderRows) {
    const isDelivery = isDeliveryChannelOrderType(order.order_type)
    for (const row of parseOrderItems(order.items_json)) {
      if (isLineCancelled(row)) continue
      for (const line of expandOrderLineToCostLines(row, params.resolveContext)) {
        const { menuId, optionId, qty } = line
        if (qty <= 0) continue
        if (!menuId) {
          unmatchedLineQty += qty
          continue
        }
        const entry = lookupCostEntry(params.costIndex, menuId, optionId)
        if (!entry) {
          unmatchedLineQty += qty
          continue
        }
        matchedLineQty += qty
        const unitFood = entry.foodCost
        const unitPack = entry.packagingCost
        foodCost += unitFood * qty
        if (isDelivery) packagingCost += unitPack * qty
      }
    }
  }

  foodCost = round2(foodCost)
  packagingCost = round2(packagingCost)
  return {
    foodCost,
    packagingCost,
    totalCost: round2(foodCost + packagingCost),
    matchedLineQty,
    unmatchedLineQty,
  }
}
