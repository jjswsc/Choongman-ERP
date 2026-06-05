import type { PosMenu } from '@/lib/api-client'

/**
 * 공백·하이픈 등 제거한 메뉴 코드 키 (예: `C0 24`, `C-024` → `c024`)
 */
export function normalizePosMenuCodeKey(raw: string | undefined | null): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.#]/g, '')
}

/** DB `is_banban` 없을 때도 반반으로 고정 인식할 코드 (normalizePosMenuCodeKey 기준) */
const KNOWN_BANBAN_CODE_KEYS = new Set(['c024', 'c24'])

export function isKnownBanbanMenuCode(code: string | undefined | null): boolean {
  return KNOWN_BANBAN_CODE_KEYS.has(normalizePosMenuCodeKey(code))
}

/** 도시락/도시락 세트는 반반 맛 후보에서 제외 (Chicken 대분류에 두어도 목록에 안 나옴) */
export function isExcludedFromBanbanFlavorPick(menu: {
  name?: string | null
  category?: string | null
}): boolean {
  const name = String(menu.name ?? '').toLowerCase()
  const cat = String(menu.category ?? '').trim().toLowerCase()
  if (cat.includes('dosirak')) return true
  if (/\bdosirak\b/.test(name) || name.includes('dosirak')) return true
  if (name.includes('도시락')) return true
  return false
}

/**
 * 반반(반반 치킨) 메뉴 여부.
 * DB에 `is_banban` 컬럼이 없거나 getPosMenus 폴백으로 플래그가 안 내려올 때를 대비해 이름·코드로도 인식합니다.
 */
export function isBanbanMenu(menu: Pick<PosMenu, 'isBanban' | 'name' | 'code'>): boolean {
  if (menu.isBanban === true) return true
  if (isKnownBanbanMenuCode(menu.code)) return true
  const name = String(menu.name ?? '').toLowerCase()
  const code = String(menu.code ?? '').trim().toLowerCase()
  if (name.includes('banban') || name.includes('반반')) return true
  if (name.includes('2 รส') || name.includes('สองรส') || name.includes('2 flavor') || name.includes('two flavor')) {
    return true
  }
  /** Bar.B.Q 등 브랜드 코드가 `BB-Q-…`(→ `bb-q-…`) 형태일 때 `bb-`만으로 반반으로 오인하지 않는다. */
  if (code.includes('banban') || code === 'banban') return true
  return false
}

/** 반반에서 고를 수 있는 “맛” 후보: 일반 치킨 단품 (반반 상품 자체는 제외) */
export function isChickenMenuForBanban(menu: Pick<PosMenu, 'code' | 'categoryMain' | 'category'>): boolean {
  if (isKnownBanbanMenuCode(menu.code)) return false
  const code = String(menu.code ?? '').trim().toLowerCase()
  const main = String(menu.categoryMain ?? '').trim().toLowerCase()
  const cat = String(menu.category ?? '').trim().toLowerCase()
  return (
    code.startsWith('c') ||
    main === 'chicken' ||
    main.includes('치킨') ||
    main.includes('ไก่') ||
    main.includes('gai') ||
    cat.includes('chicken') ||
    cat.includes('치킨') ||
    cat.includes('ไก่') ||
    cat.includes('gai')
  )
}

/**
 * 코드가 `c`로 시작하는 메뉴와 같은 소분류(category)면 치킨 코너로 간주 (코드 규칙이 섞인 매장용)
 */
export function isSameCategoryAsCodeChickenMenu(
  menu: Pick<PosMenu, 'category'>,
  allMenus: Pick<PosMenu, 'code' | 'category'>[]
): boolean {
  const cat = String(menu.category ?? '').trim()
  if (!cat) return false
  return allMenus.some((m) => {
    if (isKnownBanbanMenuCode(m.code)) return false
    const c = String(m.code ?? '').trim().toLowerCase()
    return c.startsWith('c') && String(m.category ?? '').trim() === cat
  })
}

/** 반반 후보: 위 조건 중 하나라도 만족 */
export function isEligibleChickenHalfForBanban(
  menu: Pick<PosMenu, 'code' | 'categoryMain' | 'category' | 'name'>,
  allMenus: Pick<PosMenu, 'code' | 'category'>[]
): boolean {
  if (isExcludedFromBanbanFlavorPick(menu)) return false
  return isChickenMenuForBanban(menu) || isSameCategoryAsCodeChickenMenu(menu, allMenus)
}

/**
 * 카트·items_json에 저장된 반반 메뉴 표시명에서 두 가지 맛 이름을 추출한다.
 * 예: "Banban Chicken (Flavor 1 / Flavor 2)" → { baseName: "Banban Chicken", flavor1, flavor2 }
 *
 * 반반 패턴이 아니면 `null`. (단순 옵션은 ` / `가 없으므로 영향 없음)
 */
export function parseBanbanFlavorsFromName(rawName: string | null | undefined): {
  baseName: string
  flavor1: string
  flavor2: string
} | null {
  const name = String(rawName ?? '').trim()
  if (!name) return null
  const m = name.match(/^(.+?)\s*\(([^()]+)\)\s*$/u)
  if (!m) return null
  const baseName = m[1].trim()
  const optionPart = m[2].trim()
  if (!baseName || !optionPart.includes('/')) return null
  const parts = optionPart.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean)
  if (parts.length !== 2) return null
  const [flavor1, flavor2] = parts
  return { baseName, flavor1, flavor2 }
}

/** 옵션 조각 `A / B` → 두 맛 (정확히 2개일 때만) */
export function splitBanbanSlashOptionParts(optName: string): [string, string] | null {
  const parts = String(optName ?? '')
    .trim()
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length !== 2) return null
  return [parts[0], parts[1]]
}

/**
 * 주방·영수증 compose 줄 `Banban Chicken (A / B) x1` → [`A x1`, `B x1`].
 * 반반 패턴이 아니면 null.
 */
export function expandBanbanComposeLineForPrint(line: string): string[] | null {
  const trimmed = String(line ?? '').trim()
  if (!trimmed) return null
  const qtyMatch = /\s+x\s*([\d.]+)\s*$/iu.exec(trimmed)
  const qtySuffix = qtyMatch ? ` x${qtyMatch[1]}` : ''
  const namePart = qtyMatch ? trimmed.slice(0, qtyMatch.index).trim() : trimmed
  const parsed = parseBanbanFlavorsFromName(namePart)
  if (!parsed) return null
  return [`${parsed.flavor1}${qtySuffix}`, `${parsed.flavor2}${qtySuffix}`]
}

function sortMenusByName(arr: PosMenu[]): PosMenu[] {
  return arr.slice().sort((a, b) => a.name.localeCompare(b.name))
}

function isAvailableBanbanFlavorMenu(
  menu: PosMenu,
  banbanMenu: PosMenu,
  opts?: { todayStr?: string; includeSoldOut?: boolean }
): boolean {
  const todayStr = String(opts?.todayStr ?? '').trim()
  return (
    menu.isActive !== false &&
    (opts?.includeSoldOut === true || !todayStr || !menu.soldOutDate || menu.soldOutDate !== todayStr) &&
    !isBanbanMenu(menu) &&
    String(menu.id) !== String(banbanMenu.id) &&
    !isExcludedFromBanbanFlavorPick(menu)
  )
}

export function hasBanbanFlavorWhitelist(menu: Pick<PosMenu, 'banbanFlavorMenuIds'>): boolean {
  return Array.isArray(menu.banbanFlavorMenuIds)
}

export function isBanbanFlavorWhitelistMissing(menu: Pick<PosMenu, 'banbanFlavorMenuIds'>): boolean {
  return hasBanbanFlavorWhitelist(menu) && (menu.banbanFlavorMenuIds || []).length === 0
}

export function getConfiguredBanbanFlavorMenuList(
  allMenus: PosMenu[],
  banbanMenu: PosMenu,
  todayStr: string
): PosMenu[] | null {
  if (!Array.isArray(banbanMenu.banbanFlavorMenuIds)) return null
  const menuById = new Map(allMenus.map((menu) => [String(menu.id), menu] as const))
  const out: PosMenu[] = []
  const seen = new Set<string>()
  for (const rawId of banbanMenu.banbanFlavorMenuIds) {
    const id = String(rawId || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const menu = menuById.get(id)
    if (!menu) continue
    if (!isAvailableBanbanFlavorMenu(menu, banbanMenu, { todayStr })) continue
    out.push(menu)
  }
  return out
}

/**
 * 반반 1·2번째 맛 선택 목록.
 * 1차: 명시적 whitelist. 미배포/레거시 환경(whitelist undefined)에서는 기존 치킨 판별 규칙으로 폴백.
 */
export function getAutoBanbanFlavorMenuList(
  allMenus: PosMenu[],
  banbanMenu: PosMenu,
  opts?: { todayStr?: string; includeSoldOut?: boolean }
): PosMenu[] {
  const todayStr = String(opts?.todayStr ?? '').trim()
  const base = allMenus.filter(
    (m) => isAvailableBanbanFlavorMenu(m, banbanMenu, {
      todayStr,
      includeSoldOut: opts?.includeSoldOut === true,
    })
  )

  const primary = base.filter((m) => isEligibleChickenHalfForBanban(m, allMenus))
  if (primary.length > 0) return sortMenusByName(primary)

  const banbanMain = String(banbanMenu.categoryMain ?? '').trim()
  const banbanMainLower = banbanMain.toLowerCase()
  if (banbanMain) {
    const byMain = base.filter((m) => String(m.categoryMain ?? '').trim().toLowerCase() === banbanMainLower)
    if (byMain.length > 0) return sortMenusByName(byMain)
  }

  const mainsFromCodeChicken = new Set<string>()
  for (const m of allMenus) {
    if (isKnownBanbanMenuCode(m.code)) continue
    const c = String(m.code ?? '').trim().toLowerCase()
    if (!c.startsWith('c')) continue
    const cm = String(m.categoryMain ?? '').trim()
    if (cm) mainsFromCodeChicken.add(cm)
  }
  if (mainsFromCodeChicken.size > 0) {
    const byDerived = base.filter((m) => mainsFromCodeChicken.has(String(m.categoryMain ?? '').trim()))
    if (byDerived.length > 0) return sortMenusByName(byDerived)
  }

  const excludeDrinkDessert = (m: PosMenu) => {
    const cat = String(m.category ?? '').toLowerCase()
    const cm = String(m.categoryMain ?? '').toLowerCase()
    const blob = `${cat} ${cm}`
    if (/drink|beverage|coffee|tea|juice|smoothie|음료|카페|콜라|사이다/.test(blob)) return false
    if (/dessert|디저트|cake|케이크|아이스크림/.test(blob)) return false
    return true
  }
  const loose = base.filter(excludeDrinkDessert)
  return sortMenusByName(loose).slice(0, 120)
}

export function getBanbanFlavorMenuList(allMenus: PosMenu[], banbanMenu: PosMenu, todayStr: string): PosMenu[] {
  const configured = getConfiguredBanbanFlavorMenuList(allMenus, banbanMenu, todayStr)
  if (configured) return configured
  return getAutoBanbanFlavorMenuList(allMenus, banbanMenu, { todayStr })
}

export type BanbanKitchenLineLike = {
  id?: string | null
  name?: string | null
  note?: string | null
  menuId?: string | null
  menuId1?: string | null
  menu_id1?: string | null
  menuId2?: string | null
  menu_id2?: string | null
  promoItems?: Array<{
    menuId?: string
    menuName?: string | null
    optionName?: string | null
  }> | null
}

function resolveMenuNameById(
  menus: Pick<PosMenu, 'id' | 'name'>[],
  rawId: string | null | undefined
): string {
  const id = String(rawId ?? '').trim()
  if (!id) return ''
  const hit = menus.find((m) => String(m.id ?? '').trim() === id)
  return String(hit?.name ?? '').trim()
}

function stripTrailingParenOption(rawName: string): string {
  return String(rawName ?? '')
    .trim()
    .replace(/\s*\([^)]*\)\s*$/u, '')
    .trim()
}

function extractBanbanFlavorsFromModsNote(note: string | null | undefined): [string, string] | null {
  const raw = String(note ?? '').trim()
  if (!raw) return null
  const modsChunk = raw
    .split('·')
    .map((s) => s.trim())
    .find((c) => /^mods?:/i.test(c))
  if (!modsChunk) return null
  const body = modsChunk.replace(/^mods?:/i, '').trim()
  const parts = body
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const human = parts.filter((p) => !/^\d+$/.test(p))
  const pick = human.length >= 2 ? human : parts
  if (pick.length < 2) return null
  return [pick[0], pick[1]]
}

function extractBanbanFlavorsFromCommaName(name: string): [string, string] | null {
  const trimmed = String(name ?? '').trim()
  const m = /^(.+?)\s*\(([^()]+)\)\s*$/u.exec(trimmed)
  if (!m) return null
  const baseName = m[1].trim()
  const optionPart = m[2].trim()
  if (!baseName || optionPart.includes('/')) return null
  const parts = optionPart
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length !== 2) return null
  if (!isBanbanMenu({ isBanban: false, name: baseName, code: '' })) return null
  return [parts[0], parts[1]]
}

/** 주방·재인쇄: 이름·note·menuId1/2·promoItems 에서 반반 2맛 라벨을 복원한다. */
export function resolveBanbanFlavorPairForKitchenPrint(
  item: BanbanKitchenLineLike,
  menus: Pick<PosMenu, 'id' | 'name' | 'code' | 'isBanban'>[] = []
): { flavor1: string; flavor2: string } | null {
  const name = String(item.name ?? '').trim()
  const fromSlash = parseBanbanFlavorsFromName(name)
  if (fromSlash) return { flavor1: fromSlash.flavor1, flavor2: fromSlash.flavor2 }

  const fromComma = extractBanbanFlavorsFromCommaName(name)
  if (fromComma) return { flavor1: fromComma[0], flavor2: fromComma[1] }

  const mid1 = String(item.menuId1 ?? item.menu_id1 ?? '').trim()
  const mid2 = String(item.menuId2 ?? item.menu_id2 ?? '').trim()
  if (mid1 && mid2 && mid1 !== mid2) {
    const flavor1 = resolveMenuNameById(menus, mid1)
    const flavor2 = resolveMenuNameById(menus, mid2)
    if (flavor1 && flavor2) return { flavor1, flavor2 }
  }

  const fromMods = extractBanbanFlavorsFromModsNote(String(item.note ?? ''))
  if (fromMods) return { flavor1: fromMods[0], flavor2: fromMods[1] }

  const pis = item.promoItems
  if (Array.isArray(pis) && pis.length >= 2) {
    const labels = pis
      .slice(0, 2)
      .map((p) => {
        const opt = String(p.optionName ?? '').trim()
        if (opt) return opt
        const menuName = String(p.menuName ?? '').trim()
        if (menuName && !isBanbanMenu({ isBanban: false, name: menuName, code: '' })) return menuName
        return resolveMenuNameById(menus, p.menuId)
      })
      .filter(Boolean)
    if (labels.length >= 2) return { flavor1: labels[0], flavor2: labels[1] }
  }

  return null
}

export function isBanbanKitchenLine(item: BanbanKitchenLineLike): boolean {
  const name = String(item.name ?? '').trim()
  const id = String(item.id ?? '').trim()
  if (/^banban-/i.test(id)) return true
  if (isBanbanMenu({ isBanban: false, name, code: '' })) return true
  if (parseBanbanFlavorsFromName(name)) return true
  const mid1 = String(item.menuId1 ?? item.menu_id1 ?? '').trim()
  const mid2 = String(item.menuId2 ?? item.menu_id2 ?? '').trim()
  return Boolean(mid1 && mid2 && mid1 !== mid2)
}

/**
 * DB·Grab 스냅샷에 맛이 빠진 반반 줄을 주방 인쇄용 `이름 (맛1 / 맛2)` 형태로 보강한다.
 * (초기 인쇄·재인쇄·Grab 자동주문 공통)
 */
export function enrichBanbanKitchenLineForPrint<T extends BanbanKitchenLineLike>(
  item: T,
  menus: Pick<PosMenu, 'id' | 'name' | 'code' | 'isBanban'>[] = []
): T {
  if (!isBanbanKitchenLine(item)) return item
  if (parseBanbanFlavorsFromName(String(item.name ?? ''))) return item

  const pair = resolveBanbanFlavorPairForKitchenPrint(item, menus)
  if (!pair) return item

  const rawName = String(item.name ?? '').trim()
  const baseName = (() => {
    const stripped = stripTrailingParenOption(rawName)
    if (stripped && isBanbanMenu({ isBanban: false, name: stripped, code: '' })) return stripped
    return stripped || rawName || 'Banban Chicken'
  })()

  return {
    ...item,
    name: `${baseName} (${pair.flavor1} / ${pair.flavor2})`,
  }
}
