import { supabaseSelect, supabaseSelectAllPages } from '@/lib/supabase-server'
import { grabStubMenuJson } from '@/lib/grab-webhook'
import { parseGrabStoreMap } from '@/lib/grab-store-map-env'
import { fetchErpStoresMaster } from '@/lib/erp-store-master'
import { normStoreKey } from '@/lib/store-list-keys'
import {
  buildCategoryOrderMap,
  buildMenuPolicyMap,
  getPosDeliveryPolicyBundle,
  isMenuAvailableByDeliveryPolicy,
  type PosDeliveryPolicyBundle,
} from '@/lib/pos-delivery-policy'

type MenuRow = {
  id?: number
  code?: string
  name?: string
  category?: string
  category_main?: string
  price?: number
  price_delivery?: number | null
  image?: string | null
  vat_included?: boolean
  is_active?: boolean
  sort_order?: number
  sold_out_date?: string | null
  is_banban?: boolean
  description_default?: string
  description_delivery?: string | null
  description_table?: string | null
}

type OptionRow = {
  id?: number
  menu_id?: number
  name?: string
  price_modifier?: number
  price_modifier_delivery?: number | null
  sort_order?: number
  sell_delivery?: boolean
  description_default?: string
  description_delivery?: string | null
  description_table?: string | null
}

type TimeRange = {
  start: string
  end: string
}

type ModifierGroupBucket = {
  sourceGroupName: string
  firstSort: number
  rows: OptionRow[]
}

function normalizeCategory(raw: unknown): string {
  const s = String(raw ?? '').trim()
  return s || 'Uncategorized'
}

function normalizeId(raw: string, fallback: string): string {
  const base = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  const cleaned = base.replace(/-+/g, '-').replace(/^-|-$/g, '')
  return cleaned || fallback
}

function buildGrabItemId(menu: MenuRow, itemIndex: number): string {
  const menuId = Number(menu.id ?? 0)
  const code = String(menu.code ?? '').trim()
  const base = normalizeId(code, '')
  if (menuId > 0 && base) return `item-${menuId}-${base}`
  if (menuId > 0) return `item-${menuId}`
  return normalizeId(`item-${code}-${itemIndex + 1}`, `item-${itemIndex + 1}`)
}

function isBanbanMenuRow(menu: MenuRow): boolean {
  if (menu.is_banban === true) return true
  const name = String(menu.name ?? '').trim().toLowerCase()
  const code = String(menu.code ?? '').trim().toLowerCase().replace(/[\s\-_.#]/g, '')
  if (name.includes('banban') || name.includes('반반')) return true
  return code === 'c024' || code.includes('banban') || code.startsWith('bb')
}

function isBanbanFlavorCandidate(menu: MenuRow, banbanMenu: MenuRow): boolean {
  if (menu.is_active === false) return false
  if (isSoldOutDate(menu.sold_out_date)) return false
  if (isBanbanMenuRow(menu)) return false
  const menuId = Number(menu.id ?? 0)
  const banbanId = Number(banbanMenu.id ?? 0)
  if (menuId > 0 && banbanId > 0 && menuId === banbanId) return false

  const code = String(menu.code ?? '').trim().toLowerCase()
  const main = String(menu.category_main ?? '').trim().toLowerCase()
  const cat = String(menu.category ?? '').trim().toLowerCase()
  const banbanMain = String(banbanMenu.category_main ?? '').trim().toLowerCase()

  if (code.startsWith('c')) return true
  if (main && banbanMain && main === banbanMain) return true
  if (main.includes('chicken') || main.includes('치킨')) return true
  if (cat.includes('chicken') || cat.includes('치킨')) return true
  return false
}

function toMinorUnit(value: unknown): number {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

function isSoldOutDate(value: unknown): boolean {
  const s = String(value ?? '').trim()
  return !!s
}

function isValidPhotoUrl(value: unknown): value is string {
  const s = String(value ?? '').trim()
  return /^https?:\/\//i.test(s)
}

function normalizeSectionName(raw: unknown): string {
  const s = String(raw ?? '').trim()
  return s || 'Regular'
}

function parseHHmm(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s)
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

function sectionSortKey(name: string): number {
  const s = String(name || '').trim().toLowerCase()
  if (s.includes('breakfast')) return 10
  if (s.includes('brunch')) return 20
  if (s.includes('lunch')) return 30
  if (s.includes('dinner')) return 40
  if (s === 'regular' || s.includes('regular')) return 50
  if (s.includes('late')) return 60
  return 100
}

function splitOptionGroupAndName(rawName: string): { groupName: string; optionName: string } {
  const src = String(rawName || '').trim()
  if (!src) return { groupName: 'Options', optionName: 'Option' }
  const separators = [':', ' - ', ' | ', '/', ' > ']
  for (const sep of separators) {
    const idx = src.indexOf(sep)
    if (idx <= 0) continue
    const left = src.slice(0, idx).trim()
    const right = src.slice(idx + sep.length).trim()
    if (left && right) {
      return { groupName: left.slice(0, 60), optionName: right.slice(0, 100) }
    }
  }
  return { groupName: 'Options', optionName: src.slice(0, 100) }
}

function localizeGrabOptionLabel(raw: string): string {
  let s = String(raw || '').trim()
  if (!s) return s
  // Grab 앱에 한글 옵션이 노출되지 않도록 최소 치환
  s = s
    .replace(/순살/g, 'Boneless')
    .replace(/봉/g, 'Drumette')
    .replace(/윙/g, 'Wing')
  return s
}

function shouldForceSingleSelectGroup(groupName: string, rows: OptionRow[]): boolean {
  const g = String(groupName || '').trim().toLowerCase()
  // 사이즈/부위 단일 선택 그룹 (예: M/S/L)
  if (/^(xxl|xl|l|m|s)$/.test(g)) return true
  const names = rows.map((r) => String(r.name ?? '').toLowerCase())
  const hasCutChoices = names.some(
    (n) => n.includes('boneless') || n.includes('drumette') || n.includes('bone-in') || n.includes('wing')
  )
  return hasCutChoices
}

function mergeTimeRanges(ranges: TimeRange[]): TimeRange[] {
  if (ranges.length <= 1) return ranges
  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start))
  const out: TimeRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (!last) {
      out.push({ ...r })
      continue
    }
    if (r.start <= last.end) {
      if (r.end > last.end) last.end = r.end
      continue
    }
    out.push({ ...r })
  }
  return out
}

function serviceHoursFromRanges(ranges: TimeRange[]) {
  if (!ranges.length) {
    const openAllDay = {
      openPeriodType: 'OpenAllDay' as const,
    }
    return {
      mon: openAllDay,
      tue: openAllDay,
      wed: openAllDay,
      thu: openAllDay,
      fri: openAllDay,
      sat: openAllDay,
      sun: openAllDay,
    }
  }
  const normalized = mergeTimeRanges(ranges)
    .filter((r) => r.start < r.end)
    .slice(0, 4)
    .map((r) => ({
      startTime: `${r.start}:00`,
      endTime: `${r.end}:00`,
    }))
  if (!normalized.length) {
    const openAllDay = {
      openPeriodType: 'OpenAllDay' as const,
    }
    return {
      mon: openAllDay,
      tue: openAllDay,
      wed: openAllDay,
      thu: openAllDay,
      fri: openAllDay,
      sat: openAllDay,
      sun: openAllDay,
    }
  }
  const specific = {
    openPeriodType: 'SpecificTimes' as const,
    periods: normalized,
  }
  return {
    mon: specific,
    tue: specific,
    wed: specific,
    thu: specific,
    fri: specific,
    sat: specific,
    sun: specific,
  }
}

type GrabMenuSectionOut = {
  id: string
  name: string
  sequence: number
  serviceHours: ReturnType<typeof serviceHoursFromRanges>
  categories: unknown[]
}

/**
 * Grab GetMenu 문서: sellingTimes[].startTime / endTime 은 UTC이며
 * `"2023-01-09 00:00:00"` 형식(공백 구분, T/Z 없음). ISO8601 문자열은 무효 처리될 수 있음.
 */
const GRAB_SELLING_TIME_WINDOW_START = '2020-01-01 00:00:00'
const GRAB_SELLING_TIME_WINDOW_END = '2039-12-31 23:59:59'

/** Grab Menu Validation / GetMenuNewResponse: 루트 `sellingTimes` + `categories` 필수 */
function buildSellingTimesAndRootCategories(sections: GrabMenuSectionOut[]): {
  sellingTimes: Array<{
    id: string
    name: string
    startTime: string
    endTime: string
    serviceHours: GrabMenuSectionOut['serviceHours']
  }>
  categories: unknown[]
} {
  const capped = sections.slice(0, 20)
  const sellingTimes = capped.map((sec) => ({
    id: sec.id,
    name: sec.name,
    startTime: GRAB_SELLING_TIME_WINDOW_START,
    endTime: GRAB_SELLING_TIME_WINDOW_END,
    serviceHours: sec.serviceHours,
  }))
  const categories: unknown[] = []
  let globalSequence = 1
  for (const sec of capped) {
    const stId = sec.id
    const cats = Array.isArray(sec.categories) ? sec.categories : []
    for (const raw of cats) {
      if (categories.length >= 100) break
      const cat = raw as Record<string, unknown>
      const baseId = String(cat.id ?? '').trim()
      const uniqueId = normalizeId(`${stId}__${baseId || 'cat'}`, `cat-${categories.length + 1}`)
      const row: Record<string, unknown> = {
        ...cat,
        id: uniqueId,
        sequence: globalSequence++,
        sellingTimeID: stId,
      }
      delete row.sellingTimeId
      categories.push(row)
    }
    if (categories.length >= 100) break
  }
  return { sellingTimes, categories }
}

function flattenSectionsToSingle(
  sections: Array<{
    id: string
    name: string
    sequence: number
    serviceHours: ReturnType<typeof serviceHoursFromRanges>
    categories: unknown[]
  }>
) {
  const mergedCategories: unknown[] = []
  for (const sec of sections) {
    for (const cat of sec.categories || []) mergedCategories.push(cat)
  }
  const openAllDay = serviceHoursFromRanges([])
  return [
    {
      id: 'SECTION-01',
      name: 'Menu',
      sequence: 1,
      serviceHours: openAllDay,
      categories: mergedCategories.map((cat, idx) => ({
        ...(cat as Record<string, unknown>),
        sequence: idx + 1,
      })),
    },
  ]
}

async function loadMenus(): Promise<MenuRow[]> {
  const colsAll =
    'id,code,name,category,category_main,price,price_delivery,image,vat_included,is_active,sort_order,sold_out_date,is_banban,description_default,description_delivery,description_table'
  const colsWithoutDelivery =
    'id,code,name,category,category_main,price,image,vat_included,is_active,sort_order,sold_out_date,is_banban,description_default,description_delivery,description_table'
  const colsBase = 'id,code,name,category,category_main,price,is_active,sort_order,is_banban'
  for (const cols of [colsAll, colsWithoutDelivery, colsBase]) {
    try {
      const rows = (await supabaseSelectAllPages('pos_menus', {
        order: 'sort_order.asc,name.asc',
        pageSize: 3000,
        select: cols,
      })) as MenuRow[]
      return Array.isArray(rows) ? rows : []
    } catch {
      // try next projection
    }
  }
  return []
}

function looksLikeGrabMerchantId(raw: string): boolean {
  const s = String(raw || '').trim().toUpperCase()
  return s.startsWith('GF') || s.includes('GFSB') || s.includes('GFSBPOS')
}

/** Grab 파트너 스토어 ID(숫자)만 추출. merchantID(GFSBPOS-204-253)에는 적용하지 않음 → 204 오탐 방지 */
function extractPartnerStoreDigits(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  const noPrefix = s.replace(/^partner\s*store\s*id\s*[-:]\s*/i, '').trim()
  if (/^\d{3,6}$/.test(noPrefix)) return noPrefix
  const digits = noPrefix.match(/\b(\d{3,6})\b/)
  return digits?.[1] || ''
}

/** 같은 Grab 맵 체인 안에서만 값을 따라 최종 partner/ERP 문자열까지 진행 (정책 매칭용, BFS·다매장 탐색 없음) */
function followGrabStoreMapChainToTerminal(start: string): string {
  const map = parseGrabStoreMap()
  let cur = String(start || '').trim()
  if (!cur) return ''
  const seen = new Set<string>()
  for (let i = 0; i < 10; i++) {
    if (seen.has(cur)) break
    seen.add(cur)
    const next = String(map[cur] || '').trim()
    if (!next || next === cur) break
    cur = next
  }
  return cur
}

function resolveStoreCodeFromGrabMerchant(merchantID: string, partnerMerchantID: string): string {
  const map = parseGrabStoreMap()
  const m1 = String(merchantID || '').trim()
  const m2 = String(partnerMerchantID || '').trim()
  const fromMap = String(map[m1] || map[m2] || '').trim()
  if (fromMap) {
    return followGrabStoreMapChainToTerminal(fromMap) || fromMap
  }
  const fromPartner = extractPartnerStoreDigits(m2)
  if (fromPartner) {
    return followGrabStoreMapChainToTerminal(fromPartner) || fromPartner
  }
  if (m1 && !looksLikeGrabMerchantId(m1)) {
    const d = extractPartnerStoreDigits(m1)
    if (d) return followGrabStoreMapChainToTerminal(d) || d
  }
  const tail = String(m2 || m1 || '').trim()
  return tail ? followGrabStoreMapChainToTerminal(tail) || tail : ''
}

/** 배달 정책이 ERP store_code 기준이면, 파트너 숫자·별칭과 맞춰 canonical store_code로 */
async function resolvePolicyStoreCodeForGrabMenu(storeCodeGuess: string): Promise<string> {
  const guess = String(storeCodeGuess || '').trim()
  if (!guess) return ''
  try {
    const masters = await fetchErpStoresMaster()
    if (!masters.length) return guess
    const gk = normStoreKey(guess)
    for (const row of masters) {
      const sc = String(row.store_code || '').trim()
      const keys = [
        sc,
        String(row.display_name || '').trim(),
        ...((row.aliases || []).map((a) => String(a || '').trim())),
      ]
      for (const k of keys) {
        if (normStoreKey(k) === gk) return sc || guess
      }
    }
  } catch {
    // ignore
  }
  return guess
}

async function resolvePolicyBundleForGrabMenu(storeCodeGuess: string): Promise<{
  storeCode: string
  policyBundle: PosDeliveryPolicyBundle | null
}> {
  const seed = String(storeCodeGuess || '').trim()
  if (!seed) return { storeCode: '', policyBundle: null }

  /** ERP에 저장된 배달 정책·메뉴 ON/OFF는 해당 매장의 `store_code`(마스터 기준 정규화) 한 곳만 본다. */
  const storeCode = (await resolvePolicyStoreCodeForGrabMenu(seed)) || seed
  const policyBundle = await getPosDeliveryPolicyBundle({ storeCode, appCode: 'grab' }).catch(() => null)
  return { storeCode, policyBundle }
}

async function loadOptions(): Promise<OptionRow[]> {
  const cols =
    'id,menu_id,name,price_modifier,price_modifier_delivery,sort_order,sell_delivery,description_default,description_delivery,description_table'
  const colsLegacy =
    'id,menu_id,name,price_modifier,price_modifier_delivery,sort_order,description_default,description_delivery,description_table'
  for (const c of [cols, colsLegacy]) {
    try {
      const rows = (await supabaseSelect('pos_menu_options', {
        order: 'menu_id.asc,sort_order.asc,name.asc',
        limit: 20000,
        select: c,
      })) as OptionRow[]
      return Array.isArray(rows) ? rows : []
    } catch {
      // try next projection
    }
  }
  return []
}

export async function buildGrabMenuFromPos(params: {
  merchantID: string
  partnerMerchantID: string
}): Promise<unknown> {
  const menus = await loadMenus()
  if (!menus.length) return grabStubMenuJson(params.merchantID, params.partnerMerchantID)

  const storeGuess = resolveStoreCodeFromGrabMerchant(params.merchantID, params.partnerMerchantID)
  const resolved = await resolvePolicyBundleForGrabMenu(storeGuess)
  const storeCode = resolved.storeCode
  const policyBundle = resolved.policyBundle
  const menuPolicyMap = buildMenuPolicyMap(policyBundle?.menuPolicies || [])
  const categoryOrderMap = buildCategoryOrderMap(policyBundle?.categoryOrders || [])
  const sectionOrderMap = new Map<string, number>()
  for (const [k, order] of categoryOrderMap.entries()) {
    const [main] = String(k || '').split('::')
    const section = normalizeSectionName(main)
    const n = Number(order)
    if (!Number.isFinite(n)) continue
    const prev = sectionOrderMap.get(section)
    if (prev == null || n < prev) sectionOrderMap.set(section, n)
  }

  const options = await loadOptions()
  const optionByMenuId = new Map<number, OptionRow[]>()
  for (const opt of options) {
    const menuId = Number(opt.menu_id ?? 0)
    if (!menuId) continue
    if (opt.sell_delivery === false) continue
    const list = optionByMenuId.get(menuId) || []
    list.push(opt)
    optionByMenuId.set(menuId, list)
  }

  const groups = new Map<string, MenuRow[]>()
  for (const menu of menus) {
    /** 메뉴 `is_active` 꺼짐 = 품목 비활성 → 배달 앱 메뉴에도 포함하지 않음(홀·포장과 동일 바닥). 배달 ON/OFF는 그다음 `pos_delivery_menu_policies`로만 조정. */
    if (menu.is_active === false) continue
    const menuId = Number(menu.id ?? 0)
    const policy = menuPolicyMap.get(menuId)
    if (policy && !policy.enabled) continue
    const section = normalizeSectionName(menu.category_main)
    const category = normalizeCategory(menu.category)
    const key = `${section}::${category}`
    const list = groups.get(key) || []
    list.push(menu)
    groups.set(key, list)
  }

  const categoriesBySection = new Map<string, unknown[]>()
  const sectionRanges = new Map<string, TimeRange[]>()

  const sortedCategoryEntries = Array.from(groups.entries()).sort(([groupA], [groupB]) => {
      const [mainA, categoryA] = groupA.split('::')
      const [mainB, categoryB] = groupB.split('::')
      const keyA = `${String(mainA ?? '').trim()}::${String(categoryA ?? '').trim()}`
      const keyB = `${String(mainB ?? '').trim()}::${String(categoryB ?? '').trim()}`
      const orderA = categoryOrderMap.has(keyA) ? Number(categoryOrderMap.get(keyA)) : Number.MAX_SAFE_INTEGER
      const orderB = categoryOrderMap.has(keyB) ? Number(categoryOrderMap.get(keyB)) : Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
      if (mainA !== mainB) return String(mainA).localeCompare(String(mainB))
      return String(categoryA).localeCompare(String(categoryB))
    })

  for (const [groupKey, categoryMenus] of sortedCategoryEntries) {
    const [sectionNameRaw, categoryNameRaw] = groupKey.split('::')
    const sectionName = normalizeSectionName(sectionNameRaw)
    const categoryName = normalizeCategory(categoryNameRaw)
    const sectionCategoryList = categoriesBySection.get(sectionName) || []
    const categoryId = normalizeId(categoryName, `cat-${sectionCategoryList.length + 1}`)
    const sortedMenus = [...categoryMenus].sort((a, b) => {
      const aid = Number(a.id ?? 0)
      const bid = Number(b.id ?? 0)
      const ap = menuPolicyMap.get(aid)
      const bp = menuPolicyMap.get(bid)
      const ao = Number(ap?.sortOrder ?? a.sort_order ?? 0)
      const bo = Number(bp?.sortOrder ?? b.sort_order ?? 0)
      if (ao !== bo) return ao - bo
      return String(a.name ?? '').localeCompare(String(b.name ?? ''))
    })
    const items = sortedMenus.map((menu, itemIndex) => {
      const menuId = Number(menu.id ?? 0)
      const policy = menuPolicyMap.get(menuId)
      const itemId = buildGrabItemId(menu, itemIndex)
      const menuOptions = (optionByMenuId.get(menuId) || []).sort((a, b) => {
        const ao = Number(a.sort_order ?? 0)
        const bo = Number(b.sort_order ?? 0)
        if (ao !== bo) return ao - bo
        return String(a.name ?? '').localeCompare(String(b.name ?? ''))
      })
      const modifierGroupBuckets = new Map<string, ModifierGroupBucket>()
      for (const opt of menuOptions) {
        const originalName = String(opt.name ?? '').trim()
        const split = splitOptionGroupAndName(originalName)
        const key = split.groupName.toLowerCase()
        const sort = Number(opt.sort_order ?? 0)
        if (!modifierGroupBuckets.has(key)) {
          modifierGroupBuckets.set(key, { sourceGroupName: split.groupName, firstSort: sort, rows: [] })
        }
        const bucket = modifierGroupBuckets.get(key)!
        if (sort < bucket.firstSort) bucket.firstSort = sort
        const normalizedOptionName =
          split.groupName && split.groupName.toLowerCase() !== 'options'
            ? `${split.groupName} - ${split.optionName}`
            : split.optionName
        bucket.rows.push({
          ...opt,
          name: localizeGrabOptionLabel(normalizedOptionName),
        })
      }
      const modifierGroups = Array.from(modifierGroupBuckets.values())
        .sort((a, b) => {
          if (a.firstSort !== b.firstSort) return a.firstSort - b.firstSort
          return a.sourceGroupName.localeCompare(b.sourceGroupName)
        })
        .map((bucket, gidx) => {
          const rows = [...bucket.rows].sort((a, b) => {
            const ao = Number(a.sort_order ?? 0)
            const bo = Number(b.sort_order ?? 0)
            if (ao !== bo) return ao - bo
            return String(a.name ?? '').localeCompare(String(b.name ?? ''))
          })
          const groupName = String(bucket.sourceGroupName || '').trim() || 'Options'
          const forceSingleSelect = shouldForceSingleSelectGroup(groupName, rows)
          return {
            id: gidx === 0 ? `${itemId}-mods` : `${itemId}-mods-${gidx + 1}`,
            name: groupName.slice(0, 60),
            sequence: gidx + 1,
            availableStatus: 'AVAILABLE' as const,
            selectionRangeMin: 0,
            selectionRangeMax: forceSingleSelect ? 1 : Math.max(1, Math.min(10, rows.length)),
            modifiers: rows.map((opt, idx) => {
                  const modId = normalizeId(
                    `mod-${String(opt.id ?? '')}-${itemId}-${idx + 1}`,
                    `${itemId}-mod-${idx + 1}`
                  )
              const modPrice =
                opt.price_modifier_delivery != null ? opt.price_modifier_delivery : opt.price_modifier
              const modDescDelivery = String(opt.description_delivery ?? '').trim()
              const modDescDefault = String(opt.description_default ?? '').trim()
              return {
                id: modId,
                name: String(opt.name ?? `Option ${idx + 1}`),
                description: modDescDelivery || modDescDefault || undefined,
                sequence: idx + 1,
                availableStatus: 'AVAILABLE' as const,
                price: toMinorUnit(modPrice ?? 0),
              }
            }),
          }
        })

      const banbanFlavorMenus = isBanbanMenuRow(menu)
        ? menus.filter((m) => isBanbanFlavorCandidate(m, menu)).slice(0, 30)
        : []
      const banbanModifierGroups =
        banbanFlavorMenus.length > 0
          ? [1, 2].map((slot) => ({
              id: `${itemId}-banban-${slot}`,
              name: slot === 1 ? 'Flavor 1' : 'Flavor 2',
              sequence: modifierGroups.length + slot,
              availableStatus: 'AVAILABLE' as const,
              selectionRangeMin: 1,
              selectionRangeMax: 1,
              modifiers: banbanFlavorMenus.map((flavor, idx) => {
                const fid = Number(flavor.id ?? 0)
                const fcode = String(flavor.code ?? '').trim()
                const baseId = fid > 0 ? `f-${fid}` : normalizeId(fcode, `f-${idx + 1}`)
                return {
                  id: `${itemId}-banban-${slot}-${baseId}`,
                  name: String(flavor.name ?? `Flavor ${idx + 1}`),
                  sequence: idx + 1,
                  availableStatus: 'AVAILABLE' as const,
                  price: 0,
                }
              }),
            }))
          : []

      const soldOut = isSoldOutDate(menu.sold_out_date)
      const active = menu.is_active !== false
      const available = active && !soldOut && isMenuAvailableByDeliveryPolicy(policy)
      const deliveryPrice = menu.price_delivery != null ? menu.price_delivery : menu.price
      const menuDescDelivery = String(menu.description_delivery ?? '').trim()
      const menuDescDefault = String(menu.description_default ?? '').trim()
      const menuDesc = menuDescDelivery || menuDescDefault
      return {
        id: itemId,
        name: String(menu.name ?? menu.code ?? 'Menu'),
        nameTranslation: {},
        sequence: itemIndex + 1,
        availableStatus: available ? 'AVAILABLE' : 'UNAVAILABLE',
        ...(available ? {} : { maxStock: 0 }),
        // Grab 메뉴 검증에서 item price=0 이 거절될 수 있어 최소 1 minor unit 보정
        price: Math.max(1, toMinorUnit(deliveryPrice ?? 0)),
        campaignInfo: null,
        description: menuDesc,
        photos: isValidPhotoUrl(menu.image) ? [menu.image] : [],
        modifierGroups: [...modifierGroups, ...banbanModifierGroups],
      }
    })

    const sectionRangesCurrent = sectionRanges.get(sectionName) || []
    for (const m of sortedMenus) {
      const pid = Number(m.id ?? 0)
      const policy = menuPolicyMap.get(pid)
      const start = parseHHmm(policy?.sellStartTime)
      const end = parseHHmm(policy?.sellEndTime)
      if (start && end) sectionRangesCurrent.push({ start, end })
    }
    if (sectionRangesCurrent.length > 0) sectionRanges.set(sectionName, sectionRangesCurrent)

    sectionCategoryList.push({
      id: categoryId,
      name: categoryName,
      nameTranslation: {} as Record<string, string>,
      sequence: sectionCategoryList.length + 1,
      availableStatus: 'AVAILABLE' as const,
      items,
    })
    categoriesBySection.set(sectionName, sectionCategoryList)
  }

  let sections = Array.from(categoriesBySection.entries())
    .map(([sectionName, categories]) => ({
      sectionName,
      categories: (categories || []).filter(
        (cat) => Array.isArray((cat as { items?: unknown[] }).items) && (cat as { items?: unknown[] }).items!.length > 0
      ),
      serviceHours: serviceHoursFromRanges(sectionRanges.get(sectionName) || []),
    }))
    .filter((s) => s.categories.length > 0)
    .sort((a, b) => {
      const ao = sectionOrderMap.get(a.sectionName)
      const bo = sectionOrderMap.get(b.sectionName)
      if (ao != null || bo != null) {
        const ra = ao ?? Number.MAX_SAFE_INTEGER
        const rb = bo ?? Number.MAX_SAFE_INTEGER
        if (ra !== rb) return ra - rb
      }
      const ka = sectionSortKey(a.sectionName)
      const kb = sectionSortKey(b.sectionName)
      if (ka !== kb) return ka - kb
      return a.sectionName.localeCompare(b.sectionName)
    })
    .map((section, idx) => ({
      id: `SECTION-${String(idx + 1).padStart(2, '0')}`,
      name: section.sectionName,
      sequence: idx + 1,
      serviceHours: section.serviceHours,
      categories: section.categories,
    }))

  // 기본은 섹션 분리(Breakfast/Regular 등)를 유지한다.
  // 특정 온보딩/검증에서 필요할 때만 단일 섹션 강제 평탄화.
  if (process.env.GRAB_FORCE_SINGLE_SECTION === '1') {
    sections = flattenSectionsToSingle(sections)
  }

  if (!sections.length) return grabStubMenuJson(params.merchantID, params.partnerMerchantID)

  const { sellingTimes, categories } = buildSellingTimesAndRootCategories(sections)

  /** `sections`는 시뮬레이터·구버전 호환, 루트 `sellingTimes`·`categories`는 Grab 검증(GetMenuNew) 필수 */
  return {
    merchantID: params.merchantID,
    partnerMerchantID: params.partnerMerchantID,
    currency: { code: 'THB', symbol: '฿', exponent: 2 },
    sellingTimes,
    categories,
    sections,
  }
}
