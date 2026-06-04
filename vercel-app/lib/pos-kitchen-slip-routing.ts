import { normalizePromotionCategoryMain } from "@/lib/pos-promo-constants"
import { resolveCartLineQuantityForSave } from "@/lib/pos-order-item-map"
import { resolvePosOrderItemMenuDisplayName } from "@/lib/pos-order-item-display-name"
import { resolveGrabItemPrintNote } from "@/lib/grab-pos-order-enrich"
import { splitPosPrintItemLine } from "@/lib/pos-print-item-line"
import {
  buildKitchenMenuNameLookup,
  kitchenMenuNameOrPlaceholder,
  resolveKitchenMenuNameFromLookup,
  type KitchenMenuNameLookup,
} from "@/lib/pos-kitchen-menu-display-name"
import {
  enrichPosOrderLikeItemsWithPromoSnapshot,
  enrichPromoSnapshotForPrint,
  type PosOrderReceiptLineOptions,
} from "@/lib/pos-payment-receipt-from-order"
import type { OrderItem } from "@/lib/pos-types"

/**
 * 주방 주문서 분할
 * - kitchenMode: 주방 프린터 대수(1~3). **1대(모드 1)**이면 항상 통합 한 장(메뉴에 2·3이 남아 있어도 분할하지 않음).
 * - kitchenMode 2·3일 때만 메뉴별 pos_menus.kitchen_printer(0~3)로 버킷을 나눈다.
 * - 프린터 설정의 `kitchenRouteByMenu` / `kitchenRouteByCategory` / `kitchenRouteByCategoryMain`은
 *   저장 시 pos_menus에 실체화되지만, 인쇄 시점에는 **DB(kpMap)보다 우선** 적용되어(미동기·직접 DB 수정 대비)
 *   `getPosPrinterSettings` 값과 주방 출력이 어긋나는 것을 줄인다. 우선순위: 메뉴 id → 메뉴 code → 소분류 → 대분류 → pos_menus(동일 code 중복 id 포함).
 * - 프로모션 줄에 promoItems 가 있으면(저장된 스냅샷) 구성 메뉴별로 펼쳐 각 메뉴의 주방으로 라우팅(splitPromoKitchenLines 기본 true)
 */

/** 프로모션 구성품 분리 시 라우팅용 실제 메뉴 id (id 가 promo-… 일 때 사용) */
export type KitchenSlipRoutingItem = {
  id?: string
  kitchenRouteMenuId?: string
  menuId?: string
  menuId1?: string
  menu_id1?: string
  menuId2?: string
  name?: string
  qty?: number
  note?: string
  promoItems?: {
    menuId: string
    optionId: string | null
    optionName?: string | null
    /** 주문 저장 시점 메뉴명 스냅샷(매장 스코프·비활성 메뉴로 카탈로그에 없을 때 주방 표기용) */
    menuName?: string | null
    quantity: number
  }[]
  promoId?: string
  promoCode?: string
}

/** 0 = 주방으로 출력 안 함, 1~3 = 해당 주방 프린터 */
export type KitchenRouteValue = 0 | 1 | 2 | 3

export type KitchenPrinterIndex = 1 | 2 | 3

export type KitchenSlipGroupLabels = {
  unified: string
  kitchen1: string
  kitchen2: string
  kitchen3: string
}

/** 주방 슬립 한 덩어리 — `station`은 Windows 하이브리드 프린터 매핑용(번역 라벨과 무관) */
export type KitchenSlipGroupRow<T> = {
  label: string
  items: T[]
  station: KitchenPrinterIndex
}

export type BuildKitchenSlipGroupsOpts = {
  kitchenMode: number
  /** 레거시: 예전 관리자 화면 체크박스. 비어 있으면 무시 */
  kitchen2Categories: string[]
  kitchen3Categories: string[]
  categoryByMenuId: Record<string, string>
  categoryMainByMenuId?: Record<string, string>
  kitchenRouteByMenu?: Record<string, KitchenRouteValue>
  /** kitchenRouteByMenu + 메뉴 코드로 파생(동일 code 중복 id 보정) */
  kitchenRouteByMenuCode?: Record<string, KitchenRouteValue>
  kitchenRouteByCategory?: Record<string, KitchenRouteValue>
  kitchenRouteByCategoryMain?: Record<string, KitchenRouteValue>
  /** pos_menus.kitchen_printer: 0 미인쇄, 1~3 주방 */
  kitchenPrinterByMenuId?: Record<string, KitchenRouteValue | null | undefined>
  /** 구성 메뉴명 표시용 (promoItems 펼칠 때) */
  menuNameByMenuId?: Record<string, string>
  /** 메뉴 코드(예: CH001) — 주방지 표기/복원 힌트 */
  menuCodeByMenuId?: Record<string, string>
  /**
   * true: 프로모 줄에 promoItems 가 있으면 구성 메뉴별로 나누어 주방 라우팅(기본 true)
   * false: 예전처럼 프로모 한 줄 전체를 한 주방으로만
   */
  splitPromoKitchenLines?: boolean
  labels: KitchenSlipGroupLabels
}

function clampPrinterIndex(idx: KitchenPrinterIndex, mode: number): KitchenPrinterIndex {
  const m = Math.min(3, Math.max(1, mode))
  const x = Math.min(m, Math.max(1, idx))
  return x as KitchenPrinterIndex
}

type MenuLike = {
  id: string
  name?: string
  code?: string
  category?: string
  categoryMain?: string
  kitchenPrinter?: number | null
}

function normRouteMap(raw?: Record<string, number | undefined>): Record<string, KitchenRouteValue> {
  const out: Record<string, KitchenRouteValue> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v)
    if (n === 0 || n === 1 || n === 2 || n === 3) out[String(k)] = n as KitchenRouteValue
  }
  return out
}

export type KitchenRouteOverlayContext = {
  kitchenRouteByMenu?: Record<string, KitchenRouteValue>
  kitchenRouteByMenuCode?: Record<string, KitchenRouteValue>
  kitchenRouteByCategory?: Record<string, KitchenRouteValue>
  kitchenRouteByCategoryMain?: Record<string, KitchenRouteValue>
  categoryByMenuId?: Record<string, string>
  categoryMainByMenuId?: Record<string, string>
  menuCodeByMenuId?: Record<string, string>
  kitchenMode?: number
}

/** 메뉴 id → 코드(소문자). 동일 코드 중복 행은 배열로 묶음 */
export function buildMenuIdsGroupedByCode(
  menuCodeByMenuId: Record<string, string>
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [id, rawCode] of Object.entries(menuCodeByMenuId)) {
    const code = String(rawCode || '').trim().toLowerCase()
    if (!code) continue
    if (!out[code]) out[code] = []
    out[code].push(id)
  }
  return out
}

/** 프린터 설정(메뉴 id) → 메뉴 코드별 라우트(주문이 다른 id·같은 code 로 저장된 경우 보정) */
export function buildKitchenRouteByMenuCode(
  kitchenRouteByMenu: Record<string, KitchenRouteValue>,
  menuCodeByMenuId: Record<string, string>
): Record<string, KitchenRouteValue> {
  const out: Record<string, KitchenRouteValue> = {}
  for (const [id, route] of Object.entries(kitchenRouteByMenu)) {
    const code = String(menuCodeByMenuId[id] ?? '').trim().toLowerCase()
    if (code) out[code] = route
  }
  return out
}

function clampRouteValue(v: KitchenRouteValue, mode: number): KitchenRouteValue {
  if (v === 0) return 0
  return clampPrinterIndex(v, mode)
}

/**
 * 프린터 설정 오버레이(메뉴 id → 코드 → 소분류 → 대분류).
 * 인쇄·관리자 UI 공통.
 */
export function resolveKitchenRouteOverlayForMenuId(
  mid: string,
  ctx: KitchenRouteOverlayContext
): KitchenRouteValue | null {
  const menuId = String(mid || '').trim()
  if (!menuId) return null
  const mode = Math.min(3, Math.max(1, Number(ctx.kitchenMode) || 1))
  const menuMap = ctx.kitchenRouteByMenu || {}
  if (menuMap[menuId] !== undefined) {
    const v = menuMap[menuId]
    if (v === 0 || v === 1 || v === 2 || v === 3) return clampRouteValue(v, mode)
  }
  const code = String(ctx.menuCodeByMenuId?.[menuId] ?? '').trim().toLowerCase()
  const byCode = ctx.kitchenRouteByMenuCode || {}
  if (code && byCode[code] !== undefined) {
    const v = byCode[code]
    if (v === 0 || v === 1 || v === 2 || v === 3) return clampRouteValue(v, mode)
  }
  const subRaw = String(ctx.categoryByMenuId?.[menuId] ?? '').trim()
  const sub = subRaw ? normalizePromotionCategoryMain(subRaw) : ''
  const catRoute = ctx.kitchenRouteByCategory || {}
  for (const key of sub ? [sub, subRaw].filter(Boolean) : []) {
    if (catRoute[key] === undefined) continue
    const v = catRoute[key]
    if (v === 0 || v === 1 || v === 2 || v === 3) return clampRouteValue(v, mode)
  }
  const mainRaw = String(ctx.categoryMainByMenuId?.[menuId] ?? '').trim()
  const main = mainRaw ? normalizePromotionCategoryMain(mainRaw) : ''
  const mainRoute = ctx.kitchenRouteByCategoryMain || {}
  for (const key of main ? [main, mainRaw].filter(Boolean) : []) {
    if (mainRoute[key] === undefined) continue
    const v = mainRoute[key]
    if (v === 0 || v === 1 || v === 2 || v === 3) return clampRouteValue(v, mode)
  }
  return null
}

/** pos_menus.kitchen_printer 포함 실제 주방 라우트(설정 화면 표시용) */
export function resolveEffectiveKitchenRouteForMenu(
  menu: MenuLike,
  ctx: KitchenRouteOverlayContext
): KitchenRouteValue {
  const mid = String(menu.id ?? '').trim()
  const overlay = resolveKitchenRouteOverlayForMenuId(mid, ctx)
  if (overlay !== null) return overlay
  const kp = menu.kitchenPrinter
  if (kp === 0 || kp === 1 || kp === 2 || kp === 3) return kp
  return 1
}

/**
 * 동일 메뉴 코드가 여러 id 로 있을 때, 프린터 설정에 명시된 id 로 정규화.
 * (주문 menuId ≠ 설정 화면 id 인 CHURRO·Dosirak 유형)
 */
export function canonicalizeKitchenRoutingMenuId(
  mid: string,
  ctx: {
    kitchenRouteByMenu?: Record<string, KitchenRouteValue>
    menuIdsByCode?: Record<string, string[]>
    menuCodeByMenuId?: Record<string, string>
  }
): string {
  const id = String(mid || '').trim()
  if (!id) return id
  const code = String(ctx.menuCodeByMenuId?.[id] ?? '').trim().toLowerCase()
  if (!code) return id
  const ids = ctx.menuIdsByCode?.[code]
  if (!ids || ids.length <= 1) return id
  const menuMap = ctx.kitchenRouteByMenu || {}
  const explicit = ids.filter((x) => menuMap[x] !== undefined)
  if (explicit.length === 1) return explicit[0]
  return id
}

/** API·설정 객체와 메뉴 목록으로 buildKitchenSlipGroups 옵션 생성 */
export function buildKitchenSlipGroupOpts(
  settings: {
    kitchenMode?: number
    kitchen2Categories?: string[]
    kitchen3Categories?: string[]
    kitchenRouteByMenu?: Record<string, number | undefined>
    kitchenRouteByCategory?: Record<string, number | undefined>
    kitchenRouteByCategoryMain?: Record<string, number | undefined>
  },
  menus: MenuLike[],
  labels: KitchenSlipGroupLabels
): BuildKitchenSlipGroupsOpts {
  const categoryByMenuId: Record<string, string> = {}
  const categoryMainByMenuId: Record<string, string> = {}
  const kitchenPrinterByMenuId: Record<string, KitchenRouteValue> = {}
  const menuNameByMenuId: Record<string, string> = {}
  const menuCodeByMenuId: Record<string, string> = {}
  for (const m of menus) {
    const id = String(m.id ?? '')
    if (!id) continue
    categoryByMenuId[id] = String(m.category ?? '').trim()
    categoryMainByMenuId[id] = String(m.categoryMain ?? '').trim()
    menuNameByMenuId[id] = String(m.name ?? '').trim()
    menuCodeByMenuId[id] = String(m.code ?? '').trim()
    const kp = m.kitchenPrinter
    if (kp === 0 || kp === 1 || kp === 2 || kp === 3) kitchenPrinterByMenuId[id] = kp
  }

  const kitchenRouteByMenu = normRouteMap(settings.kitchenRouteByMenu as Record<string, number | undefined>)
  const kitchenRouteByMenuCode = buildKitchenRouteByMenuCode(kitchenRouteByMenu, menuCodeByMenuId)

  return {
    kitchenMode: settings.kitchenMode ?? 1,
    kitchen2Categories: settings.kitchen2Categories ?? [],
    kitchen3Categories: settings.kitchen3Categories ?? [],
    categoryByMenuId,
    categoryMainByMenuId,
    kitchenRouteByMenu,
    kitchenRouteByMenuCode,
    kitchenRouteByCategory: normRouteMap(settings.kitchenRouteByCategory as Record<string, number | undefined>),
    kitchenRouteByCategoryMain: normRouteMap(
      settings.kitchenRouteByCategoryMain as Record<string, number | undefined>
    ),
    kitchenPrinterByMenuId,
    menuNameByMenuId,
    menuCodeByMenuId,
    labels,
  }
}

/**
 * 프로모 한 줄(promo-…)은 id 로는 주방 라우팅이 안 되므로, promoItems 구성을 풀어
 * 각 구성 메뉴 id 기준으로 프린터를 태운다.
 */
function expandPromoLinesForKitchenRouting<T extends KitchenSlipRoutingItem>(
  items: T[],
  lookup: KitchenMenuNameLookup,
  enabled: boolean
): T[] {
  if (!enabled) return items
  const out: T[] = []
  for (const it of items) {
    const pi = it.promoItems
    if (Array.isArray(pi) && pi.length > 0) {
      const parentQty = resolveCartLineQuantityForSave(it as { qty?: unknown; quantity?: unknown })
      const parentName = String(it.name ?? '').trim()
      let n = 0
      for (const p of pi) {
        const mid = String(p.menuId ?? '').trim()
        if (!mid) continue
        n += 1
        const q = Math.max(0.0001, Number(p.quantity ?? 1)) * parentQty
        const childName = kitchenMenuNameOrPlaceholder(
          mid,
          resolveKitchenMenuNameFromLookup(
            mid,
            lookup,
            String((p as { menuName?: string | null }).menuName ?? '').trim()
          )
        )
        const optionName = String((p as { optionName?: string | null }).optionName ?? '').trim()
        const optionCode = String((p as { optionCode?: string | null }).optionCode ?? '').trim()
        const optionLabel = optionName
          ? ` (${optionName})`
          : optionCode
            ? ` (${optionCode})`
            : ''
        const displayName = parentName ? `[${parentName}] ${childName}` : childName
        const baseNote = String(it.note ?? '').trim()
        const mergedNote = baseNote
        out.push({
          ...it,
          id: `${String(it.id ?? 'promo')}-k${n}`,
          // 세트 구성품은 각 메뉴 코드의 프린터 설정대로 분리 라우팅한다.
          kitchenRouteMenuId: mid,
          name: `${displayName}${optionLabel}`,
          qty: q,
          kitchenPromoGroupId: String(it.id ?? '').trim() || undefined,
          kitchenPromoParentName: parentName || undefined,
          kitchenPromoParentQty: parentQty,
          ...(mergedNote ? { note: mergedNote } : { note: undefined }),
          promoItems: undefined,
        } as T)
      }
      if (n === 0) out.push(it)
    } else {
      out.push(it)
    }
  }
  return out
}

/**
 * 주방 슬립 그룹. 주방으로 나갈 품목이 없으면 빈 배열.
 * kitchenMode 1: 미인쇄(0) 제외 후 한 장(통합). 2·3: 프린터별 버킷(메뉴 kp 2·3이 있으면 effective mode 상향).
 */
export function buildKitchenSlipGroups<T extends KitchenSlipRoutingItem>(
  items: T[],
  opts: BuildKitchenSlipGroupsOpts
): KitchenSlipGroupRow<T>[] {
  const splitPromo = opts.splitPromoKitchenLines !== false
  const nameMap = opts.menuNameByMenuId || {}
  const codeMap = opts.menuCodeByMenuId || {}
  const menuLookup = buildKitchenMenuNameLookup(
    Object.entries(nameMap).map(([id, name]) => ({
      id,
      name,
      code: codeMap[id],
    }))
  )
  const expanded = expandPromoLinesForKitchenRouting(items, menuLookup, splitPromo) as T[]

  const catMap = opts.categoryByMenuId || {}
  const kpMap = opts.kitchenPrinterByMenuId || {}
  const configuredMode = Math.min(3, Math.max(1, Number(opts.kitchenMode) || 1))
  const printerHintMax = Math.max(
    1,
    ...Object.values(kpMap).map((v) => (v === 2 || v === 3 ? v : 1))
  )
  /**
   * 모드 1대: 설정을 우선해 항상 통합 슬립만 낸다(메뉴에 kitchen_printer=2·3 잔재가 있어도 한 장).
   * 모드 2·3대: 메뉴에 2·3 라우트가 있으면 effective mode를 올려 버킷을 유지한다.
   */
  const mode =
    configuredMode === 1 ? 1 : Math.min(3, Math.max(configuredMode, printerHintMax))
  const menuIdsByCode = buildMenuIdsGroupedByCode(codeMap)
  const routeOverlayCtx: KitchenRouteOverlayContext = {
    kitchenMode: mode,
    kitchenRouteByMenu: opts.kitchenRouteByMenu,
    kitchenRouteByMenuCode: opts.kitchenRouteByMenuCode,
    kitchenRouteByCategory: opts.kitchenRouteByCategory,
    kitchenRouteByCategoryMain: opts.kitchenRouteByCategoryMain,
    categoryByMenuId: opts.categoryByMenuId,
    categoryMainByMenuId: opts.categoryMainByMenuId,
    menuCodeByMenuId: codeMap,
  }
  const canonicalizeMid = (raw: string) =>
    canonicalizeKitchenRoutingMenuId(raw, {
      kitchenRouteByMenu: opts.kitchenRouteByMenu,
      menuIdsByCode,
      menuCodeByMenuId: codeMap,
    })

  const menuIdByName: Record<string, string> = {}
  const ambiguousMenuNames = new Set<string>()
  const menuIdByCode: Record<string, string> = {}
  const ambiguousMenuCodes = new Set<string>()
  for (const [mid, nm] of Object.entries(nameMap)) {
    const key = String(nm || '').trim().toLowerCase()
    if (!key) continue
    if (menuIdByName[key] && menuIdByName[key] !== mid) {
      ambiguousMenuNames.add(key)
      continue
    }
    menuIdByName[key] = mid
    const codeKey = String(codeMap[mid] || '').trim().toLowerCase()
    if (codeKey) {
      if (menuIdByCode[codeKey] && menuIdByCode[codeKey] !== mid) ambiguousMenuCodes.add(codeKey)
      else menuIdByCode[codeKey] = mid
    }
  }

  const extractCodeFromName = (rawName: string): string => {
    const name = String(rawName || '').trim()
    if (!name) return ''
    const lead = name.match(/^\[([^\]]+)\]/)
    if (lead?.[1]) return String(lead[1]).trim().toLowerCase()
    const tail = name.match(/\(([^)]+)\)\s*$/)
    if (tail?.[1]) return String(tail[1]).trim().toLowerCase()
    return ''
  }

  const resolveMenuIdFromComposite = (rawId: string): string => {
    const id = String(rawId || "").trim()
    if (!id) return ""
    if (id in catMap || id in kpMap) return id
    // cart item id can be `${menuId}-${optionId}`; when menuId/optionId include '-'
    // (e.g. UUID), simple split('-')[0] breaks. Find the longest known menu-id prefix.
    const candidates = new Set<string>([
      ...Object.keys(catMap),
      ...Object.keys(kpMap),
    ])
    let best = ""
    for (const key of candidates) {
      if (!key) continue
      if (id === key || id.startsWith(`${key}-`)) {
        if (key.length > best.length) best = key
      }
    }
    if (best) return best
    const firstDash = id.indexOf("-")
    return firstDash > 0 ? id.slice(0, firstDash) : id
  }

  const menuIdOf = (it: T) => {
    const kr = String((it as KitchenSlipRoutingItem).kitchenRouteMenuId ?? '').trim()
    if (kr) return canonicalizeMid(kr)
    const rawMenuId = String(
      (it as KitchenSlipRoutingItem).menuId ??
        (it as KitchenSlipRoutingItem).menuId1 ??
        (it as KitchenSlipRoutingItem).menu_id1 ??
        (it as KitchenSlipRoutingItem).menuId2 ??
        ''
    ).trim()
    if (rawMenuId) return canonicalizeMid(resolveMenuIdFromComposite(rawMenuId))

    /**
     * items_json/menuId 미보유 줄: 표시명이 아닌 카트 줄 id 우선 해석 후에만 이름 매칭.
     * - 메뉴 UUID-옵션UUID 형태 id는 catMap/kpMap에 포함된 접두 매칭으로 정확한 행만 가리킨다.
     * - 이름으로만 같은 상품명의 다른 레코드(주방 미출력=0)·비노출 메뉴 행 UUID에 연결되는 경우 영수증엔 노출되어도 주방에서 빠질 수 있다.
     * - Grab 등 연동 줄(id가 grab:…)은 POS 메뉴 UUID와 무관하여 이름 매칭이 오판만 만든다 → 이름 매칭 생략(주방=기본 출력).
     */
    const idStr = String((it as KitchenSlipRoutingItem).id ?? '').trim()
    if (/^grab:/i.test(idStr)) {
      return ''
    }

    const fromCartId = resolveMenuIdFromComposite(idStr)
    if (fromCartId && (fromCartId in kpMap || fromCartId in catMap)) {
      return canonicalizeMid(fromCartId)
    }

    const itemName = String((it as KitchenSlipRoutingItem).name ?? '').trim()
    const codeFromName = extractCodeFromName(itemName)
    if (codeFromName && !ambiguousMenuCodes.has(codeFromName) && menuIdByCode[codeFromName]) {
      return canonicalizeMid(resolveMenuIdFromComposite(menuIdByCode[codeFromName]))
    }
    const itemNameKey = itemName.toLowerCase()
    if (itemNameKey && !ambiguousMenuNames.has(itemNameKey) && menuIdByName[itemNameKey]) {
      return canonicalizeMid(resolveMenuIdFromComposite(menuIdByName[itemNameKey]))
    }
    return canonicalizeMid(fromCartId)
  }

  const withKitchenCodeName = (it: T, mid: string): T => {
    const code = String(codeMap[mid] || '').trim()
    if (!code) return it
    const currentName = String((it as KitchenSlipRoutingItem).name ?? '').trim()
    if (!currentName) return it
    const lower = currentName.toLowerCase()
    const codeLower = code.toLowerCase()
    if (lower.startsWith(`[${codeLower}]`) || lower.endsWith(`(${codeLower})`)) return it
    return { ...it, name: `[${code}] ${currentName}` } as T
  }
  /** 0 = 스킵, 1~3 = 주방 번호 */
  const resolveRoute = (it: T): KitchenRouteValue => {
    const mid = menuIdOf(it)
    const overlay = mid ? resolveKitchenRouteOverlayForMenuId(mid, routeOverlayCtx) : null
    if (overlay !== null) return overlay

    if (mid in kpMap) {
      const v = kpMap[mid]
      if (v === 0 || v === 1 || v === 2 || v === 3) {
        return v === 0 ? 0 : clampPrinterIndex(v, mode)
      }
    }

    const code = String(codeMap[mid] || '').trim().toLowerCase()
    if (code) {
      const ids = menuIdsByCode[code] || []
      for (const altId of ids) {
        if (altId === mid) continue
        const v = kpMap[altId]
        if (v === 0 || v === 1 || v === 2 || v === 3) {
          return v === 0 ? 0 : clampPrinterIndex(v, mode)
        }
      }
    }

    return 1
  }

  if (mode === 1) {
    const kept: T[] = []
    for (const it of expanded) {
      const mid = menuIdOf(it)
      const route = resolveRoute(it)
      if (route === 0) continue
      kept.push(withKitchenCodeName(it, mid))
    }
    if (kept.length === 0) return []
    return [{ label: opts.labels.unified, items: kept, station: 1 }]
  }

  const buckets: [T[], T[], T[]] = [[], [], []]
  for (const it of expanded) {
    const mid = menuIdOf(it)
    const r = resolveRoute(it)
    if (r === 0) continue
    buckets[r - 1].push(withKitchenCodeName(it, mid))
  }
  const out: KitchenSlipGroupRow<T>[] = []
  const labelFor = (i: KitchenPrinterIndex) =>
    i === 1 ? opts.labels.kitchen1 : i === 2 ? opts.labels.kitchen2 : opts.labels.kitchen3
  for (let i = 1; i <= mode; i++) {
    const bucket = buckets[i - 1]
    if (bucket.length)
      out.push({
        label: labelFor(i as KitchenPrinterIndex),
        items: bucket,
        station: i as KitchenPrinterIndex,
      })
  }
  return out
}

/** `OrderItem` → 주방 라우팅용 한 줄 (`displayName`은 이미 POS 표시명으로 만든 값) */
export function kitchenRoutingItemFromOrderItem(it: OrderItem, displayName: string): KitchenSlipRoutingItem {
  const qty = Math.max(1, Math.trunc(Number(it.quantity) || 1))
  const note = resolveGrabItemPrintNote({
    note: String(it.note ?? "").trim() || null,
    optionCode: String(it.optionCode ?? "").trim() || null,
    optionCode1: String(it.optionCode1 ?? "").trim() || null,
    optionCode2: String(it.optionCode2 ?? "").trim() || null,
  })
  const menuId = String(it.menuId ?? "").trim()
  const row: KitchenSlipRoutingItem = {
    id: String(it.id ?? ""),
    name: displayName,
    qty,
    ...(note ? { note } : {}),
    ...(menuId ? { menuId1: menuId } : {}),
  }
  if (Array.isArray(it.promoItems) && it.promoItems.length > 0) {
    row.promoItems = it.promoItems
  }
  return row
}

/** 일부 취소 주방 재인쇄 시 콜백·전체 취소 주방용 */
export type PosKitchenReprintPayload = {
  removedKitchenLines: KitchenSlipRoutingItem[]
  /** 전체 취소 등 서버 재조회 없이 헤더에 쓸 값 */
  orderNoForPrint?: string
  tableName?: string
  memo?: string
}

export type KitchenSlipItemWithCancelFlag<T extends KitchenSlipRoutingItem> = T & { kitchenLineCancelled?: boolean }

/**
 * 부분 취소 주방 재인쇄: 취소가 발생한 station 에만 남은(active) 줄을 붙인다.
 * (음료만 취소했을 때 음식 주방 1·2에 전체 주문이 다시 나가는 것을 막는다.)
 */
export function filterActiveKitchenSlipsForPartialCancel<T extends KitchenSlipRoutingItem>(
  activeSlips: KitchenSlipGroupRow<T>[],
  cancelledSlips: KitchenSlipGroupRow<T>[]
): KitchenSlipGroupRow<T>[] {
  if (!cancelledSlips.length) return []
  const stations = new Set(cancelledSlips.map((s) => s.station))
  return activeSlips.filter((s) => stations.has(s.station))
}

/** 부분 취소용 — 취소 station 에만 취소 줄 + 해당 station 의 남은 줄 */
export function buildPartialCancelKitchenSlips<T extends KitchenSlipRoutingItem>(
  cancelledSlips: KitchenSlipGroupRow<T>[],
  activeSlips: KitchenSlipGroupRow<T>[]
): KitchenSlipGroupRow<KitchenSlipItemWithCancelFlag<T>>[] {
  if (!cancelledSlips.length) return []
  const activeForPartial = filterActiveKitchenSlipsForPartialCancel(activeSlips, cancelledSlips)
  return mergeKitchenSlipGroupsCancelledFirst(cancelledSlips, activeForPartial)
}

/**
 * 같은 `station` 기준으로 취소된 줄을 위에 두고, 그 아래 현재 주문 줄을 붙인다.
 * `cancelledSlips`가 비면 `activeSlips`만 반환한다.
 */
export function mergeKitchenSlipGroupsCancelledFirst<T extends KitchenSlipRoutingItem>(
  cancelledSlips: KitchenSlipGroupRow<T>[],
  activeSlips: KitchenSlipGroupRow<T>[]
): KitchenSlipGroupRow<KitchenSlipItemWithCancelFlag<T>>[] {
  type Out = KitchenSlipItemWithCancelFlag<T>
  if (!cancelledSlips.length) {
    return activeSlips.map((s) => ({
      ...s,
      items: s.items.map((it) => ({ ...it }) as Out),
    }))
  }
  const map = new Map<
    number,
    { label: string; cancelled: T[]; active: T[] }
  >()
  for (const s of cancelledSlips) {
    const prev = map.get(s.station)
    const e = prev ?? { label: s.label, cancelled: [] as T[], active: [] as T[] }
    e.cancelled.push(...s.items)
    if (!prev) e.label = s.label
    map.set(s.station, e)
  }
  for (const s of activeSlips) {
    const prev = map.get(s.station)
    const e = prev ?? { label: s.label, cancelled: [] as T[], active: [] as T[] }
    e.active.push(...s.items)
    e.label = s.label
    map.set(s.station, e)
  }
  const stations = [...map.keys()].sort((a, b) => a - b)
  const out: KitchenSlipGroupRow<Out>[] = []
  for (const st of stations) {
    const e = map.get(st)!
    const items: Out[] = [
      ...e.cancelled.map((it) => ({ ...it, kitchenLineCancelled: true } as Out)),
      ...e.active.map((it) => ({ ...it }) as Out),
    ]
    if (!items.length) continue
    out.push({
      label: e.label,
      items,
      station: st as KitchenPrinterIndex,
    })
  }
  return out
}

/** POST 본문·DB에서 라우트 맵 정규화 (0=주방 미인쇄, 1~3=주방) */
export function normalizeKitchenRouteMapInput(raw: unknown): Record<string, KitchenRouteValue> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, KitchenRouteValue> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k).trim()
    if (!key) continue
    const n = Number(v)
    if (n === 0 || n === 1 || n === 2 || n === 3) out[key] = n as KitchenRouteValue
  }
  return out
}

export function parseKitchenRouteMapDb(raw: unknown): Record<string, KitchenRouteValue> {
  if (raw == null) return {}
  let obj: unknown = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      return {}
    }
  }
  return normalizeKitchenRouteMapInput(obj)
}

/**
 * getPosMenuCategories()와 동일한 규칙으로 대/소분류 키를 맞춤 (예: '프로모션' → 'Promotion')
 * — DB·레거시 json 키와 UI 목록 불일치 시 저장·새로고침 후 전부 '주방 1'로 보이는 현상 방지
 */
export function alignKitchenCategoryRouteKeyMap(
  m: Record<string, KitchenRouteValue>
): Record<string, KitchenRouteValue> {
  const out: Record<string, KitchenRouteValue> = {}
  for (const [k, v] of Object.entries(m)) {
    const key = normalizePromotionCategoryMain(String(k).trim())
    if (key) out[key] = v
  }
  return out
}

type KitchenPrepareMenuLike = { id?: string | number; name?: string; code?: string }

function enrichPromoItemsMenuNames<T extends KitchenSlipRoutingItem['promoItems']>(
  promoItems: T,
  lookup: KitchenMenuNameLookup
): T {
  if (!Array.isArray(promoItems) || promoItems.length === 0) return promoItems
  return promoItems.map((p) => {
    const mid = String(p.menuId ?? '').trim()
    const existing = String((p as { menuName?: string | null }).menuName ?? '').trim()
    const menuName = existing || resolveKitchenMenuNameFromLookup(mid, lookup)
    return menuName ? { ...p, menuName } : p
  }) as T
}

/**
 * 주방 슬립 라우팅 전: promoItems 스냅샷 보강·구성 메뉴명·줄 표시명 복원.
 * (매장 스코프로 카탈로그에 없는 메뉴 id가 주문 JSON에만 남아 "26"처럼 찍히는 현상 방지)
 */
export function preparePosOrderItemsForKitchenSlip<T extends KitchenSlipRoutingItem>(
  items: T[],
  opts: PosOrderReceiptLineOptions & { menus?: KitchenPrepareMenuLike[] }
): T[] {
  const menus = opts.menus ?? []
  const lookup = buildKitchenMenuNameLookup(menus)
  const enriched = enrichPosOrderLikeItemsWithPromoSnapshot(
    items as unknown as Record<string, unknown>[],
    opts
  ) as T[]

  return enriched.map((it) => {
    const menuId = String(
      it.menuId ?? it.menuId1 ?? it.menu_id1 ?? it.menuId2 ?? ''
    ).trim()
    const resolvedName = resolvePosOrderItemMenuDisplayName(
      {
        id: String(it.id ?? ''),
        name: String(it.name ?? ''),
        menuId,
        promoId: String((it as { promoId?: unknown }).promoId ?? '').trim() || undefined,
        promoCode: String((it as { promoCode?: unknown }).promoCode ?? '').trim() || undefined,
      },
      menus as Parameters<typeof resolvePosOrderItemMenuDisplayName>[1],
      opts.promoCatalogById ? Array.from(opts.promoCatalogById.values()) : undefined
    )
    let promoItems = enrichPromoItemsMenuNames(it.promoItems, lookup)
    const promoItemsForPrint = Array.isArray(promoItems)
      ? promoItems.map((p) => {
          const menuName = String((p as { menuName?: unknown }).menuName ?? '').trim()
          const optionName = String((p as { optionName?: unknown }).optionName ?? '').trim()
          const optionCode = String((p as { optionCode?: unknown }).optionCode ?? '').trim()
          return {
            menuId: String(p.menuId ?? '').trim(),
            optionId: p.optionId != null && String(p.optionId).trim() ? String(p.optionId).trim() : null,
            ...(optionCode ? { optionCode } : {}),
            ...(optionName ? { optionName } : {}),
            ...(menuName ? { menuName } : {}),
            quantity: Math.max(1, Number(p.quantity ?? 1) || 1),
          }
        })
      : undefined
    promoItems = enrichPromoSnapshotForPrint(promoItemsForPrint, opts) ?? promoItemsForPrint
    // 옵션이 "이름(괄호)"에만 있고 optionCode·note·promoItems 가 모두 없는 단품·반반:
    // 이름의 옵션을 note 로 주입한다. (표시 단계가 note 를 항상 출력 → 단품 사이즈/반반 맛 누락 방지.
    //  이름에 이미 있는 값이라 추론이 아니며, 모든 인쇄 경로(홀/포장/배달/재인쇄)에서 동일하게 보인다.)
    const existingNote = String((it as { note?: unknown }).note ?? '').trim()
    const hasOptionCodeField = Boolean(
      String((it as { optionCode?: unknown }).optionCode ?? '').trim() ||
        String((it as { optionCode1?: unknown }).optionCode1 ?? '').trim() ||
        String((it as { optionCode2?: unknown }).optionCode2 ?? '').trim()
    )
    const hasPromoChildren = Array.isArray(promoItems) && promoItems.length > 0
    let injectedNote = existingNote
    if (!existingNote && !hasOptionCodeField && !hasPromoChildren) {
      const optionFromName = splitPosPrintItemLine(String(resolvedName ?? '')).optionLine
      if (optionFromName) injectedNote = optionFromName
    }
    return {
      ...it,
      name: resolvedName,
      ...(injectedNote ? { note: injectedNote } : {}),
      ...(promoItems ? { promoItems } : {}),
    } as T
  })
}
