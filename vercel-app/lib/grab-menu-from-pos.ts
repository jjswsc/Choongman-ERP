import { supabaseSelect, supabaseSelectAllPages } from '@/lib/supabase-server'
import { grabStubMenuJson } from '@/lib/grab-webhook'
import {
  buildCategoryOrderMap,
  buildMenuPolicyMap,
  getPosDeliveryPolicyBundle,
  isMenuAvailableByDeliveryPolicy,
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
  groupName: string
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
      periods: [] as { startTime: string; endTime: string }[],
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
  const normalized = mergeTimeRanges(ranges).slice(0, 4).map((r) => ({
    startTime: `${r.start}:00`,
    endTime: `${r.end}:00`,
  }))
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

async function loadMenus(): Promise<MenuRow[]> {
  const colsAll =
    'id,code,name,category,category_main,price,price_delivery,image,vat_included,is_active,sort_order,sold_out_date,description_default,description_delivery,description_table'
  const colsWithoutDelivery =
    'id,code,name,category,category_main,price,image,vat_included,is_active,sort_order,sold_out_date,description_default,description_delivery,description_table'
  const colsBase = 'id,code,name,category,category_main,price,is_active,sort_order'
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

function parseGrabStoreMap(): Record<string, string> {
  const raw = process.env.GRAB_STORE_MAP_JSON?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const key = String(k || '').trim()
      const val = String(v || '').trim()
      if (key && val) out[key] = val
    }
    return out
  } catch {
    return {}
  }
}

function resolveStoreCodeFromGrabMerchant(merchantID: string, partnerMerchantID: string): string {
  const map = parseGrabStoreMap()
  const m1 = String(merchantID || '').trim()
  const m2 = String(partnerMerchantID || '').trim()
  return map[m1] || map[m2] || m2 || m1
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

  const storeCode = resolveStoreCodeFromGrabMerchant(params.merchantID, params.partnerMerchantID)
  const policyBundle = storeCode
    ? await getPosDeliveryPolicyBundle({ storeCode, appCode: 'grab' }).catch(() => null)
    : null
  const menuPolicyMap = buildMenuPolicyMap(policyBundle?.menuPolicies || [])
  const categoryOrderMap = buildCategoryOrderMap(policyBundle?.categoryOrders || [])

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
      const menuCode = String(menu.code ?? '').trim()
      const policy = menuPolicyMap.get(menuId)
      const itemId = normalizeId(menuCode, `menu-${menuId || itemIndex + 1}`)
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
          modifierGroupBuckets.set(key, { groupName: split.groupName, firstSort: sort, rows: [] })
        }
        const bucket = modifierGroupBuckets.get(key)!
        if (sort < bucket.firstSort) bucket.firstSort = sort
        bucket.rows.push({
          ...opt,
          name: split.optionName,
        })
      }
      const modifierGroups = Array.from(modifierGroupBuckets.values())
        .sort((a, b) => {
          if (a.firstSort !== b.firstSort) return a.firstSort - b.firstSort
          return a.groupName.localeCompare(b.groupName)
        })
        .map((bucket, gidx) => {
          const rows = [...bucket.rows].sort((a, b) => {
            const ao = Number(a.sort_order ?? 0)
            const bo = Number(b.sort_order ?? 0)
            if (ao !== bo) return ao - bo
            return String(a.name ?? '').localeCompare(String(b.name ?? ''))
          })
          return {
            id: `${itemId}-mods-${normalizeId(bucket.groupName, `group-${gidx + 1}`)}`,
            name: bucket.groupName,
            sequence: gidx + 1,
            availableStatus: 'AVAILABLE' as const,
            selectionRangeMin: 0,
            selectionRangeMax: Math.max(1, Math.min(10, rows.length)),
            modifiers: rows.map((opt, idx) => {
              const modId = normalizeId(String(opt.id ?? ''), `${itemId}-mod-${idx + 1}`)
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
        price: toMinorUnit(deliveryPrice ?? 0),
        campaignInfo: null,
        description: menuDesc,
        photos: isValidPhotoUrl(menu.image) ? [menu.image] : [],
        modifierGroups,
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

  const sections = Array.from(categoriesBySection.entries())
    .map(([sectionName, categories]) => ({
      sectionName,
      categories: (categories || []).filter(
        (cat) => Array.isArray((cat as { items?: unknown[] }).items) && (cat as { items?: unknown[] }).items!.length > 0
      ),
      serviceHours: serviceHoursFromRanges(sectionRanges.get(sectionName) || []),
    }))
    .filter((s) => s.categories.length > 0)
    .sort((a, b) => {
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

  if (!sections.length) return grabStubMenuJson(params.merchantID, params.partnerMerchantID)

  /** Grab Menu Simulator / Partner 샘플과 동일: 최상위 `sections` (루트 `sellingTimes`+`categories` 대신) */
  return {
    merchantID: params.merchantID,
    partnerMerchantID: params.partnerMerchantID,
    currency: { code: 'THB', symbol: '฿', exponent: 2 },
    sections,
  }
}
