/**
 * 주방 주문서 분할
 * - kitchenMode: 주방 프린터 대수(1~3). 1대여도 품목별 "주방 미인쇄(0)"는 제외됨.
 * - 우선순위: 프린터 탭 메뉴별 → pos_menus.kitchen_printer(0=미인쇄) → 카테고리 → 대분류
 *   → (레거시) 주방2·3 카테고리 체크 목록이 비어 있지 않을 때만 예전 규칙 → 없으면 주방 1
 */

export type KitchenSlipRoutingItem = { id?: string }

/** 0 = 주방으로 출력 안 함, 1~3 = 해당 주방 프린터 */
export type KitchenRouteValue = 0 | 1 | 2 | 3

export type KitchenPrinterIndex = 1 | 2 | 3

export type KitchenSlipGroupLabels = {
  unified: string
  kitchen1: string
  kitchen2: string
  kitchen3: string
}

export type BuildKitchenSlipGroupsOpts = {
  kitchenMode: number
  /** 레거시: 예전 관리자 화면 체크박스. 비어 있으면 무시 */
  kitchen2Categories: string[]
  kitchen3Categories: string[]
  categoryByMenuId: Record<string, string>
  categoryMainByMenuId?: Record<string, string>
  kitchenRouteByMenu?: Record<string, KitchenRouteValue>
  kitchenRouteByCategory?: Record<string, KitchenRouteValue>
  kitchenRouteByCategoryMain?: Record<string, KitchenRouteValue>
  /** pos_menus.kitchen_printer: 0 미인쇄, 1~3 주방 */
  kitchenPrinterByMenuId?: Record<string, KitchenRouteValue | null | undefined>
  labels: KitchenSlipGroupLabels
}

function clampPrinterIndex(idx: KitchenPrinterIndex, mode: number): KitchenPrinterIndex {
  const m = Math.min(3, Math.max(1, mode))
  const x = Math.min(m, Math.max(1, idx))
  return x as KitchenPrinterIndex
}

function legacyKitchenIndex(cat: string, mode: number, k2: string[], k3: string[]): KitchenPrinterIndex {
  if (mode <= 1) return 1
  if (mode === 2) return k2.includes(cat) ? 2 : 1
  if (k3.includes(cat)) return 3
  if (k2.includes(cat)) return 2
  return 1
}

type MenuLike = { id: string; category?: string; categoryMain?: string; kitchenPrinter?: number | null }

function normRouteMap(raw?: Record<string, number | undefined>): Record<string, KitchenRouteValue> {
  const out: Record<string, KitchenRouteValue> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v)
    if (n === 0 || n === 1 || n === 2 || n === 3) out[String(k)] = n as KitchenRouteValue
  }
  return out
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
  for (const m of menus) {
    const id = String(m.id ?? '')
    if (!id) continue
    categoryByMenuId[id] = String(m.category ?? '').trim()
    categoryMainByMenuId[id] = String(m.categoryMain ?? '').trim()
    const kp = m.kitchenPrinter
    if (kp === 0 || kp === 1 || kp === 2 || kp === 3) kitchenPrinterByMenuId[id] = kp
  }

  return {
    kitchenMode: settings.kitchenMode ?? 1,
    kitchen2Categories: settings.kitchen2Categories ?? [],
    kitchen3Categories: settings.kitchen3Categories ?? [],
    categoryByMenuId,
    categoryMainByMenuId,
    kitchenRouteByMenu: normRouteMap(settings.kitchenRouteByMenu as Record<string, number | undefined>),
    kitchenRouteByCategory: normRouteMap(settings.kitchenRouteByCategory as Record<string, number | undefined>),
    kitchenRouteByCategoryMain: normRouteMap(
      settings.kitchenRouteByCategoryMain as Record<string, number | undefined>
    ),
    kitchenPrinterByMenuId,
    labels,
  }
}

/**
 * 주방 슬립 그룹. 주방으로 나갈 품목이 없으면 빈 배열.
 * kitchenMode 1: 미인쇄 제외 후 한 장(통합 라벨). 2·3: 프린터별 버킷.
 */
export function buildKitchenSlipGroups<T extends KitchenSlipRoutingItem>(
  items: T[],
  opts: BuildKitchenSlipGroupsOpts
): { label: string; items: T[] }[] {
  const mode = Math.min(3, Math.max(1, Number(opts.kitchenMode) || 1))
  const k2 = opts.kitchen2Categories || []
  const k3 = opts.kitchen3Categories || []
  const legacyActive = k2.length > 0 || k3.length > 0
  const catMap = opts.categoryByMenuId || {}
  const mainMap = opts.categoryMainByMenuId || {}
  const routeMenu = opts.kitchenRouteByMenu || {}
  const routeCat = opts.kitchenRouteByCategory || {}
  const routeMain = opts.kitchenRouteByCategoryMain || {}
  const kpMap = opts.kitchenPrinterByMenuId || {}

  const menuIdOf = (it: T) => String(it.id ?? '').split('-')[0]
  const menuCat = (it: T) => String(catMap[menuIdOf(it)] ?? '')
  const menuMain = (it: T) => String(mainMap[menuIdOf(it)] ?? '').trim()

  /** 0 = 스킵, 1~3 = 주방 번호 */
  const resolveRoute = (it: T): KitchenRouteValue => {
    const mid = menuIdOf(it)
    const cat = menuCat(it)
    const main = menuMain(it)

    if (mid in routeMenu) {
      const v = routeMenu[mid]
      if (v === 0 || v === 1 || v === 2 || v === 3) {
        return v === 0 ? 0 : clampPrinterIndex(v, mode)
      }
    }

    if (mid in kpMap) {
      const v = kpMap[mid]
      if (v === 0 || v === 1 || v === 2 || v === 3) {
        return v === 0 ? 0 : clampPrinterIndex(v, mode)
      }
    }

    if (cat && cat in routeCat) {
      const v = routeCat[cat]
      if (v === 0 || v === 1 || v === 2 || v === 3) {
        return v === 0 ? 0 : clampPrinterIndex(v, mode)
      }
    }

    if (main && main in routeMain) {
      const v = routeMain[main]
      if (v === 0 || v === 1 || v === 2 || v === 3) {
        return v === 0 ? 0 : clampPrinterIndex(v, mode)
      }
    }

    if (legacyActive) {
      return clampPrinterIndex(legacyKitchenIndex(cat, mode, k2, k3), mode)
    }

    return 1
  }

  if (mode === 1) {
    const kept = items.filter((it) => resolveRoute(it) !== 0)
    if (kept.length === 0) return []
    return [{ label: opts.labels.unified, items: kept }]
  }

  const buckets: [T[], T[], T[]] = [[], [], []]
  for (const it of items) {
    const r = resolveRoute(it)
    if (r === 0) continue
    buckets[r - 1].push(it)
  }
  const out: { label: string; items: T[] }[] = []
  const labelFor = (i: KitchenPrinterIndex) =>
    i === 1 ? opts.labels.kitchen1 : i === 2 ? opts.labels.kitchen2 : opts.labels.kitchen3
  for (let i = 1; i <= mode; i++) {
    const bucket = buckets[i - 1]
    if (bucket.length) out.push({ label: labelFor(i as KitchenPrinterIndex), items: bucket })
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
