import { normalizeDeliveryAppFeePercent } from '@/lib/cost-data'
import {
  supabaseDeleteByFilter,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpsert,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

export type DeliveryAppCode = 'grab' | 'lineman' | 'shopee'
export type DeliveryAcceptanceMode = 'manual' | 'auto'

export type PosDeliveryAppPolicy = {
  storeCode: string
  appCode: DeliveryAppCode
  enabled: boolean
  orderAcceptanceMode: DeliveryAcceptanceMode
  autoAcceptEnabled: boolean
  /** 플랫폼 정산 수수료(%) — 익일 NET 입금 대사. 본사 PO와 별도 */
  settlementFeePct?: number | null
  updatedAt?: string
}

export type PosDeliveryMenuPolicy = {
  storeCode: string
  appCode: DeliveryAppCode
  menuId: number
  enabled: boolean
  sortOrder: number
  sellStartTime?: string | null
  sellEndTime?: string | null
  stockQty?: number | null
  soldOut: boolean
  autoStopOnZero: boolean
  /** 앱별 메뉴 이미지 override (미설정 시 POS 기본 이미지 사용) */
  imageUrl?: string | null
}

export type PosDeliveryCategoryOrder = {
  storeCode: string
  appCode: DeliveryAppCode
  categoryMain?: string
  category: string
  sortOrder: number
}

export type PosDeliveryPolicyBundle = {
  appPolicy: PosDeliveryAppPolicy
  menuPolicies: PosDeliveryMenuPolicy[]
  categoryOrders: PosDeliveryCategoryOrder[]
}

type SavePolicyInput = {
  storeCode: string
  appCode: DeliveryAppCode
  appPolicy?: Partial<PosDeliveryAppPolicy>
  menuPolicies?: PosDeliveryMenuPolicy[]
  categoryOrders?: PosDeliveryCategoryOrder[]
}

function normalizeAppCode(raw: unknown): DeliveryAppCode {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (s === 'lineman' || s === 'shopee') return s
  return 'grab'
}

function normalizeAcceptanceMode(raw: unknown): DeliveryAcceptanceMode {
  return String(raw ?? '').trim().toLowerCase() === 'auto' ? 'auto' : 'manual'
}

function normalizeTimeHHmm(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s)
  if (!m) return null
  const hh = m[1].padStart(2, '0')
  const mm = m[2]
  return `${hh}:${mm}`
}

function toNum(raw: unknown, fallback = 0): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function isInWindow(nowHHmm: string, start: string | null, end: string | null): boolean {
  if (!start || !end) return true
  if (start === end) return true
  if (start < end) {
    return nowHHmm >= start && nowHHmm <= end
  }
  // overnight: 22:00 ~ 02:00
  return nowHHmm >= start || nowHHmm <= end
}

function bangkokHHmm(date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  return fmt.replace('.', ':')
}

export async function getPosDeliveryPolicyBundle(params: {
  storeCode: string
  appCode: DeliveryAppCode
}): Promise<PosDeliveryPolicyBundle> {
  const storeCode = String(params.storeCode ?? '').trim()
  const appCode = normalizeAppCode(params.appCode)
  const defaultPolicy: PosDeliveryAppPolicy = {
    storeCode,
    appCode,
    enabled: true,
    orderAcceptanceMode: 'manual',
    autoAcceptEnabled: false,
  }
  if (!storeCode) {
    return { appPolicy: defaultPolicy, menuPolicies: [], categoryOrders: [] }
  }

  const [appRows, menuRows, catRows, imageRows] = await Promise.all([
    supabaseSelectFilter(
      'pos_delivery_app_policies',
      `store_code=eq.${encodeURIComponent(storeCode)}&app_code=eq.${encodeURIComponent(appCode)}`,
      { limit: 1 }
    ).catch(() => []),
    supabaseSelectFilter(
      'pos_delivery_menu_policies',
      `store_code=eq.${encodeURIComponent(storeCode)}&app_code=eq.${encodeURIComponent(appCode)}`,
      { limit: 5000 }
    ).catch(() => []),
    supabaseSelectFilter(
      'pos_delivery_category_orders',
      `store_code=eq.${encodeURIComponent(storeCode)}&app_code=eq.${encodeURIComponent(appCode)}`,
      { limit: 1000, order: 'sort_order.asc,category.asc' }
    ).catch(() => []),
    supabaseSelectFilter(
      'pos_delivery_menu_images',
      `store_code=eq.${encodeURIComponent(storeCode)}&app_code=eq.${encodeURIComponent(appCode)}`,
      { limit: 5000, select: 'menu_id,image_url' }
    ).catch(() => []),
  ])

  const app = (appRows as Record<string, unknown>[] | null)?.[0] || {}
  const rawPct = app.settlement_fee_pct
  const appPolicy: PosDeliveryAppPolicy = {
    storeCode,
    appCode,
    enabled: Boolean(app.enabled ?? true),
    orderAcceptanceMode: normalizeAcceptanceMode(app.order_acceptance_mode),
    autoAcceptEnabled: Boolean(app.auto_accept_enabled ?? false),
    settlementFeePct:
      rawPct != null && rawPct !== '' && Number.isFinite(Number(rawPct))
        ? normalizeDeliveryAppFeePercent(rawPct)
        : null,
    updatedAt: String(app.updated_at ?? '') || undefined,
  }

  const imageMap = new Map<number, string>()
  for (const row of (imageRows as Record<string, unknown>[] | null) || []) {
    const menuId = Math.trunc(toNum(row.menu_id, 0))
    const imageUrl = String(row.image_url ?? '').trim()
    if (menuId > 0 && imageUrl) imageMap.set(menuId, imageUrl)
  }

  const menuPolicies: PosDeliveryMenuPolicy[] = ((menuRows as Record<string, unknown>[] | null) || []).map(
    (r) => ({
      storeCode,
      appCode,
      menuId: Math.trunc(toNum(r.menu_id, 0)),
      enabled: Boolean(r.enabled ?? true),
      sortOrder: Math.trunc(toNum(r.sort_order, 0)),
      sellStartTime: normalizeTimeHHmm(r.sell_start_time),
      sellEndTime: normalizeTimeHHmm(r.sell_end_time),
      stockQty: r.stock_qty == null ? null : toNum(r.stock_qty, 0),
      soldOut: Boolean(r.sold_out ?? false),
      autoStopOnZero: Boolean(r.auto_stop_on_zero ?? true),
      imageUrl: imageMap.get(Math.trunc(toNum(r.menu_id, 0))) || null,
    })
  )

  const categoryOrders: PosDeliveryCategoryOrder[] = ((catRows as Record<string, unknown>[] | null) || []).map(
    (r) => ({
      storeCode,
      appCode,
      categoryMain: String(r.category_main ?? '').trim(),
      category: String(r.category ?? '').trim(),
      sortOrder: Math.trunc(toNum(r.sort_order, 0)),
    })
  )

  return { appPolicy, menuPolicies, categoryOrders }
}

export async function savePosDeliveryPolicyBundle(input: SavePolicyInput): Promise<void> {
  const storeCode = String(input.storeCode ?? '').trim()
  const appCode = normalizeAppCode(input.appCode)
  if (!storeCode) throw new Error('storeCode_required')

  const appPolicy = input.appPolicy || {}
  const row: Record<string, unknown> = {
    store_code: storeCode,
    app_code: appCode,
    enabled: Boolean(appPolicy.enabled ?? true),
    order_acceptance_mode: normalizeAcceptanceMode(appPolicy.orderAcceptanceMode),
    auto_accept_enabled: Boolean(appPolicy.autoAcceptEnabled ?? false),
    updated_at: new Date().toISOString(),
  }
  if (appPolicy.settlementFeePct !== undefined) {
    const p = appPolicy.settlementFeePct
    row.settlement_fee_pct = p == null ? null : normalizeDeliveryAppFeePercent(p)
  }
  try {
    await supabaseUpsert('pos_delivery_app_policies', [row], 'store_code,app_code')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (row.settlement_fee_pct !== undefined && /settlement_fee_pct/i.test(msg)) {
      delete row.settlement_fee_pct
      await supabaseUpsert('pos_delivery_app_policies', [row], 'store_code,app_code')
    } else {
      throw e
    }
  }

  if (Array.isArray(input.menuPolicies)) {
    await supabaseDeleteByFilter(
      'pos_delivery_menu_policies',
      `store_code=eq.${encodeURIComponent(storeCode)}&app_code=eq.${encodeURIComponent(appCode)}`
    )
    const rows = input.menuPolicies
      .map((r) => ({
        store_code: storeCode,
        app_code: appCode,
        menu_id: Math.trunc(toNum(r.menuId, 0)),
        enabled: Boolean(r.enabled ?? true),
        sort_order: Math.trunc(toNum(r.sortOrder, 0)),
        sell_start_time: normalizeTimeHHmm(r.sellStartTime),
        sell_end_time: normalizeTimeHHmm(r.sellEndTime),
        stock_qty: r.stockQty == null ? null : toNum(r.stockQty, 0),
        sold_out: Boolean(r.soldOut ?? false),
        auto_stop_on_zero: Boolean(r.autoStopOnZero ?? true),
        updated_at: new Date().toISOString(),
      }))
      .filter((r) => r.menu_id > 0)
    if (rows.length > 0) {
      await supabaseUpsert('pos_delivery_menu_policies', rows, 'store_code,app_code,menu_id')
    }

    // 앱별 이미지 override는 별도 테이블에서 관리 (미지정 시 POS 기본 이미지 fallback).
    try {
      await supabaseDeleteByFilter(
        'pos_delivery_menu_images',
        `store_code=eq.${encodeURIComponent(storeCode)}&app_code=eq.${encodeURIComponent(appCode)}`
      )
      const imageRows = input.menuPolicies
        .map((r) => ({
          store_code: storeCode,
          app_code: appCode,
          menu_id: Math.trunc(toNum(r.menuId, 0)),
          image_url: String(r.imageUrl ?? '').trim(),
          updated_at: new Date().toISOString(),
        }))
        .filter((r) => r.menu_id > 0 && !!r.image_url)
      if (imageRows.length > 0) {
        await supabaseUpsert('pos_delivery_menu_images', imageRows, 'store_code,app_code,menu_id')
      }
    } catch {
      // 마이그레이션 미적용 환경에서는 이미지 override 저장을 건너뛴다.
    }
  }

  if (Array.isArray(input.categoryOrders)) {
    await supabaseDeleteByFilter(
      'pos_delivery_category_orders',
      `store_code=eq.${encodeURIComponent(storeCode)}&app_code=eq.${encodeURIComponent(appCode)}`
    )
    const rows = input.categoryOrders
      .map((r) => ({
        store_code: storeCode,
        app_code: appCode,
        category_main: String(r.categoryMain ?? '').trim(),
        category: String(r.category ?? '').trim(),
        sort_order: Math.trunc(toNum(r.sortOrder, 0)),
        updated_at: new Date().toISOString(),
      }))
      .filter((r) => !!r.category)
    if (rows.length > 0) {
      await supabaseUpsert(
        'pos_delivery_category_orders',
        rows,
        'store_code,app_code,category_main,category'
      )
    }
  }
}

export function resolveOrderAcceptanceMode(
  bundle: PosDeliveryPolicyBundle | null
): DeliveryAcceptanceMode {
  if (!bundle?.appPolicy?.enabled) return 'manual'
  return normalizeAcceptanceMode(bundle.appPolicy.orderAcceptanceMode)
}

export function buildCategoryOrderMap(
  categoryOrders: PosDeliveryCategoryOrder[]
): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of categoryOrders || []) {
    const k = `${String(row.categoryMain ?? '').trim()}::${String(row.category ?? '').trim()}`
    if (!k.endsWith('::')) map.set(k, Math.trunc(toNum(row.sortOrder, 0)))
  }
  return map
}

export function buildMenuPolicyMap(
  menuPolicies: PosDeliveryMenuPolicy[]
): Map<number, PosDeliveryMenuPolicy> {
  const map = new Map<number, PosDeliveryMenuPolicy>()
  for (const row of menuPolicies || []) {
    if (row.menuId > 0) map.set(row.menuId, row)
  }
  return map
}

export function isMenuAvailableByDeliveryPolicy(
  policy: PosDeliveryMenuPolicy | undefined,
  now = new Date()
): boolean {
  if (!policy) return true
  if (!policy.enabled) return false
  if (policy.soldOut) return false
  if (policy.autoStopOnZero && policy.stockQty != null && policy.stockQty <= 0) return false
  const hhmm = bangkokHHmm(now)
  const start = normalizeTimeHHmm(policy.sellStartTime)
  const end = normalizeTimeHHmm(policy.sellEndTime)
  return isInWindow(hhmm, start, end)
}

export async function consumeDeliveryMenuStockByName(params: {
  storeCode: string
  appCode: DeliveryAppCode
  items: Array<{ name?: string; qty?: number }>
}): Promise<void> {
  const storeCode = String(params.storeCode ?? '').trim()
  const appCode = normalizeAppCode(params.appCode)
  if (!storeCode || !params.items?.length) return

  const menuRows = (await supabaseSelect('pos_menus', {
    select: 'id,name',
    limit: 10000,
  }).catch(() => [])) as { id?: number; name?: string }[] | null
  const menuIdByName = new Map<string, number>()
  for (const m of menuRows || []) {
    const name = String(m.name ?? '').trim().toLowerCase()
    const id = Math.trunc(toNum(m.id, 0))
    if (name && id > 0 && !menuIdByName.has(name)) menuIdByName.set(name, id)
  }

  const usage = new Map<number, number>()
  for (const it of params.items) {
    const name = String(it.name ?? '').trim().toLowerCase()
    const menuId = menuIdByName.get(name)
    if (!menuId) continue
    const qty = Math.max(1, Math.trunc(toNum(it.qty, 1)))
    usage.set(menuId, (usage.get(menuId) || 0) + qty)
  }
  if (!usage.size) return

  const existing = (await supabaseSelectFilter(
    'pos_delivery_menu_policies',
    `store_code=eq.${encodeURIComponent(storeCode)}&app_code=eq.${encodeURIComponent(appCode)}`,
    { limit: 5000, select: 'id,menu_id,stock_qty,auto_stop_on_zero,sold_out' }
  ).catch(() => [])) as
    | { id?: number; menu_id?: number; stock_qty?: number | null; auto_stop_on_zero?: boolean; sold_out?: boolean }[]
    | null

  for (const row of existing || []) {
    const id = Math.trunc(toNum(row.id, 0))
    const menuId = Math.trunc(toNum(row.menu_id, 0))
    if (!id || !menuId || !usage.has(menuId)) continue
    const dec = usage.get(menuId) || 0
    const hasStock = row.stock_qty != null && Number.isFinite(Number(row.stock_qty))
    if (!hasStock) continue
    const next = Number(row.stock_qty) - dec
    const soldOut =
      Boolean(row.sold_out) || (Boolean(row.auto_stop_on_zero ?? true) && Number.isFinite(next) && next <= 0)
    await supabaseUpdateByFilter(
      'pos_delivery_menu_policies',
      `id=eq.${id}`,
      {
        stock_qty: Math.max(0, next),
        sold_out: soldOut,
        updated_at: new Date().toISOString(),
      }
    ).catch(() => {})
  }
}
