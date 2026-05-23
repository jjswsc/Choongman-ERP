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

/**
 * 반반 1·2번째 맛 선택 목록.
 * 1차: 치킨 판별 규칙 — 비어 있으면 반반 메뉴와 같은 대분류 → 그다음 `c`코드 메뉴의 대분류 → 마지막 음료·디저트 제외 전체(상한).
 */
export function getBanbanFlavorMenuList(allMenus: PosMenu[], banbanMenu: PosMenu, todayStr: string): PosMenu[] {
  const base = allMenus.filter(
    (m) =>
      m.isActive !== false &&
      (!m.soldOutDate || m.soldOutDate !== todayStr) &&
      !isBanbanMenu(m) &&
      String(m.id) !== String(banbanMenu.id) &&
      !isExcludedFromBanbanFlavorPick(m)
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
