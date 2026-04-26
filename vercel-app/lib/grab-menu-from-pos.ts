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
}

type OptionRow = {
  id?: number
  menu_id?: number
  name?: string
  price_modifier?: number
  price_modifier_delivery?: number | null
  sort_order?: number
  sell_delivery?: boolean
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

async function loadMenus(): Promise<MenuRow[]> {
  const colsAll =
    'id,code,name,category,category_main,price,price_delivery,image,vat_included,is_active,sort_order,sold_out_date'
  const colsWithoutDelivery = 'id,code,name,category,category_main,price,image,vat_included,is_active,sort_order,sold_out_date'
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
    'id,menu_id,name,price_modifier,price_modifier_delivery,sort_order,sell_delivery'
  const colsLegacy = 'id,menu_id,name,price_modifier,price_modifier_delivery,sort_order'
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

  const openAllDay = {
    openPeriodType: 'OpenAllDay' as const,
    periods: [] as { startTime: string; endTime: string }[],
  }
  const serviceHoursForSection = {
    mon: openAllDay,
    tue: openAllDay,
    wed: openAllDay,
    thu: openAllDay,
    fri: openAllDay,
    sat: openAllDay,
    sun: openAllDay,
  }

  const groups = new Map<string, MenuRow[]>()
  for (const menu of menus) {
    const menuId = Number(menu.id ?? 0)
    const policy = menuPolicyMap.get(menuId)
    if (policy && !policy.enabled) continue
    const category = normalizeCategory(menu.category)
    const list = groups.get(category) || []
    list.push(menu)
    groups.set(category, list)
  }

  const categories = Array.from(groups.entries())
    .sort(([categoryA, menusA], [categoryB, menusB]) => {
      const mainA = String((menusA?.[0] as MenuRow | undefined)?.category_main ?? '').trim()
      const mainB = String((menusB?.[0] as MenuRow | undefined)?.category_main ?? '').trim()
      const keyA = `${mainA}::${categoryA}`
      const keyB = `${mainB}::${categoryB}`
      const orderA = categoryOrderMap.has(keyA) ? Number(categoryOrderMap.get(keyA)) : Number.MAX_SAFE_INTEGER
      const orderB = categoryOrderMap.has(keyB) ? Number(categoryOrderMap.get(keyB)) : Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
      return categoryA.localeCompare(categoryB)
    })
    .map(([categoryName, categoryMenus], catIndex) => {
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
      const modifierGroups =
        menuOptions.length > 0
          ? [
              {
                id: `${itemId}-mods`,
                name: 'Options',
                sequence: 1,
                availableStatus: 'AVAILABLE' as const,
                selectionRangeMin: 0,
                selectionRangeMax: Math.max(1, Math.min(10, menuOptions.length)),
                modifiers: menuOptions.map((opt, idx) => {
                  const modId = normalizeId(String(opt.id ?? ''), `${itemId}-mod-${idx + 1}`)
                  const modPrice =
                    opt.price_modifier_delivery != null
                      ? opt.price_modifier_delivery
                      : opt.price_modifier
                  return {
                    id: modId,
                    name: String(opt.name ?? `Option ${idx + 1}`),
                    sequence: idx + 1,
                    availableStatus: 'AVAILABLE' as const,
                    price: toMinorUnit(modPrice ?? 0),
                  }
                }),
              },
            ]
          : []

      const soldOut = isSoldOutDate(menu.sold_out_date)
      const active = menu.is_active !== false
      const available = active && !soldOut && isMenuAvailableByDeliveryPolicy(policy)
      const deliveryPrice = menu.price_delivery != null ? menu.price_delivery : menu.price
      return {
        id: itemId,
        name: String(menu.name ?? menu.code ?? 'Menu'),
        nameTranslation: {},
        sequence: itemIndex + 1,
        availableStatus: available ? 'AVAILABLE' : 'UNAVAILABLE',
        price: toMinorUnit(deliveryPrice ?? 0),
        campaignInfo: null,
        description: '',
        photos: isValidPhotoUrl(menu.image) ? [menu.image] : [],
        modifierGroups,
      }
    })

    const categoryId = normalizeId(categoryName, `cat-${catIndex + 1}`)
    return {
      id: categoryId,
      name: categoryName,
      nameTranslation: {} as Record<string, string>,
      sequence: catIndex + 1,
      availableStatus: 'AVAILABLE' as const,
      items,
    }
  })
  .filter((cat) => Array.isArray(cat.items) && cat.items.length > 0)

  if (!categories.length) return grabStubMenuJson(params.merchantID, params.partnerMerchantID)

  /** Grab Menu Simulator / Partner 샘플과 동일: 최상위 `sections` (루트 `sellingTimes`+`categories` 대신) */
  return {
    merchantID: params.merchantID,
    partnerMerchantID: params.partnerMerchantID,
    currency: { code: 'THB', symbol: '฿', exponent: 2 },
    sections: [
      {
        id: 'SECTION-01',
        name: 'Menu',
        sequence: 1,
        serviceHours: serviceHoursForSection,
        categories,
      },
    ],
  }
}
