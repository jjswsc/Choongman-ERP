/**
 * 원재료 이론 소진(판매×BOM) vs 실제 소진(재고등식) 집계.
 */
import { getBangkokDateRangeUtc } from '@/lib/bangkok-time'
import { stockLogBangkokDateRangeFilter } from '@/lib/bangkok-date'
import {
  appendInventoryTenantFilter,
  isInventoryTenantQueryBlocked,
  isMissingInventoryTenantIdColumnError,
  markInventoryTenantIdColumnMissing,
  resolveInventoryTenantScope,
  type InventoryTenantScope,
} from '@/lib/inventory-tenant-scope'
import {
  buildPosMenuBomIndex,
  explodeMenuIngredientsSync,
  type PosMenuBomIndex,
} from '@/lib/pos-menu-bom-explode'
import { filterCompletedPosSalesRows } from '@/lib/pos-sales-period-aggregate'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_MENU_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { getStockLocationPatterns, isOfficeStockSelection } from '@/lib/stock-location-patterns'
import { getItemCostPerUnit } from '@/lib/item-cost-util'
import { resolveItemsJsonLineQty } from '@/lib/pos-order-item-map'
import { supabaseRpc, supabaseSelectAllPages, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import type { NextRequest } from 'next/server'

/** items_json 줄 → menu/option (원가·마진 집계와 동일 우선순위) */
function resolveLineMenuOption(it: {
  id?: string
  menuId?: string
  menu_id?: string
  menuId1?: string
  menu_id1?: string
  optionId?: string
  option_id?: string
  optionId1?: string
  option_id1?: string
}): { menuId: string; optionId: string } {
  let menuId = String(it.menuId1 ?? it.menu_id1 ?? it.menuId ?? it.menu_id ?? '').trim()
  let optionId = String(it.optionId1 ?? it.option_id1 ?? it.optionId ?? it.option_id ?? '').trim()
  if (menuId) return { menuId, optionId }

  let raw = String(it.id ?? '').trim()
  if (!raw || raw.toLowerCase().startsWith('promo-')) return { menuId: '', optionId: '' }
  if (raw.toLowerCase().startsWith('cart-')) raw = raw.slice(5).trim()
  const parts = raw.split('-')
  if (parts[0] && /^\d+$/.test(parts[0])) {
    menuId = parts[0]
    if (parts[1] && /^\d+$/.test(parts[1])) optionId = parts[1]
  }
  return { menuId, optionId }
}

export type IngredientUsageMenuContribution = {
  menuId: string
  optionId: string
  menuLabel: string
  optionLabel: string
  theoreticalQty: number
}

export type IngredientUsageVarianceRow = {
  itemCode: string
  itemName: string
  unit: string
  cost: number
  ingredientType: 'food' | 'packaging' | 'unknown'
  theoreticalQty: number
  actualQty: number
  varianceQty: number
  variancePct: number | null
  varianceCost: number
  beginningQty: number
  endingQty: number
  inboundQty: number
  outboundQty: number
  usageQty: number
  adjustmentQty: number
  posQty: number
  hasAdjustment: boolean
  menuContributions: IngredientUsageMenuContribution[]
}

export type IngredientUsageVarianceResult = {
  success: boolean
  message?: string
  startYmd: string
  endYmd: string
  store: string
  posTruncated: boolean
  actualSource: 'rpc' | 'fallback' | 'none'
  unmatchedOrderLines: number
  orderCount: number
  rows: IngredientUsageVarianceRow[]
  warnings: string[]
}

type ActualRow = {
  item_code: string
  beginning_qty: number
  ending_qty: number
  inbound_qty: number
  outbound_qty: number
  usage_qty: number
  adjustment_qty: number
  pos_qty: number
  actual_usage_qty: number
  has_adjustment: boolean
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseItems(itemsJson: string | undefined): Record<string, unknown>[] {
  if (!itemsJson) return []
  try {
    const parsed = JSON.parse(itemsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function lineLabel(row: Record<string, unknown>): { menuLabel: string; optionLabel: string } {
  const menuLabel = String(row.menuName ?? row.menu_name ?? row.name ?? '').trim()
  const optionLabel = String(row.optionName ?? row.option_name ?? '').trim()
  return { menuLabel, optionLabel }
}

/** 주문 라인들을 메뉴 기여 + 품목 이론 소진으로 집계 */
function aggregateTheoreticalFromOrders(
  index: PosMenuBomIndex,
  orderRows: { items_json?: string }[]
): {
  byItem: Record<string, number>
  typeByItem: Record<string, 'food' | 'packaging'>
  contributions: Map<string, Map<string, IngredientUsageMenuContribution>>
  unmatchedOrderLines: number
  orderCount: number
} {
  const byItem: Record<string, number> = {}
  const typeByItem: Record<string, 'food' | 'packaging'> = {}
  const contributions = new Map<string, Map<string, IngredientUsageMenuContribution>>()
  let unmatchedOrderLines = 0
  let orderCount = 0

  const addContribution = (
    itemCode: string,
    menuId: string,
    optionId: string,
    menuLabel: string,
    optionLabel: string,
    qty: number
  ) => {
    if (!(qty > 0) || !itemCode) return
    let byMenu = contributions.get(itemCode)
    if (!byMenu) {
      byMenu = new Map()
      contributions.set(itemCode, byMenu)
    }
    const ck = `${menuId}|${optionId}`
    const prev = byMenu.get(ck)
    if (prev) {
      prev.theoreticalQty = round4(prev.theoreticalQty + qty)
    } else {
      byMenu.set(ck, {
        menuId,
        optionId,
        menuLabel: menuLabel || (menuId ? `#${menuId}` : '—'),
        optionLabel,
        theoreticalQty: round4(qty),
      })
    }
  }

  const explodeAndTrack = (
    menuId: string,
    optionId: string,
    menuQty: number,
    labelMenu: string,
    labelOpt: string
  ) => {
    if (!menuId || !(menuQty > 0)) {
      unmatchedOrderLines += 1
      return
    }
    const snap: Record<string, number> = {}
    explodeMenuIngredientsSync(index, menuId, optionId || null, menuQty, snap, typeByItem)
    const keys = Object.keys(snap)
    if (!keys.length) {
      unmatchedOrderLines += 1
      return
    }
    for (const code of keys) {
      const q = snap[code] || 0
      byItem[code] = (byItem[code] || 0) + q
      addContribution(code, menuId, optionId, labelMenu, labelOpt, q)
    }
  }

  for (const order of orderRows) {
    orderCount += 1
    const items = parseItems(order.items_json)
    for (const raw of items) {
      const it = raw as {
        id?: string
        qty?: number
        quantity?: number
        promoId?: string
        promoItems?: { menuId: string; optionId: string | null; quantity: number; name?: string }[]
        menuId?: string
        menu_id?: string
        menuId1?: string
        menu_id1?: string
        optionId?: string
        option_id?: string
        optionId1?: string
        option_id1?: string
        menuId2?: string
        optionId2?: string
        cancelledAt?: string
        cancelled_at?: string
      }
      if (it.cancelledAt || it.cancelled_at) continue

      const cartQty = Math.max(0, resolveItemsJsonLineQty(it))
      if (cartQty <= 0) continue

      const { menuLabel, optionLabel } = lineLabel(raw)

      if (it.promoId && Array.isArray(it.promoItems) && it.promoItems.length > 0) {
        for (const pi of it.promoItems) {
          const menuId = String(pi.menuId ?? '').trim()
          const optionId = pi.optionId ? String(pi.optionId) : ''
          const menuQty = cartQty * (Number(pi.quantity) ?? 1)
          explodeAndTrack(
            menuId,
            optionId,
            menuQty,
            String(pi.name || menuLabel || menuId),
            optionLabel
          )
        }
        continue
      }

      if (it.menuId1 && it.menuId2) {
        const halfQty = cartQty * 0.5
        const opt1 = it.optionId1 ? String(it.optionId1) : ''
        const opt2 = it.optionId2 ? String(it.optionId2) : ''
        explodeAndTrack(String(it.menuId1), opt1, halfQty, menuLabel || String(it.menuId1), optionLabel)
        explodeAndTrack(String(it.menuId2), opt2, halfQty, menuLabel || String(it.menuId2), optionLabel)
        continue
      }

      const { menuId, optionId } = resolveLineMenuOption(it)
      explodeAndTrack(menuId, optionId, cartQty, menuLabel || menuId, optionLabel)
    }
  }

  return { byItem, typeByItem, contributions, unmatchedOrderLines, orderCount }
}

async function fetchActualViaRpc(
  patterns: string[],
  startIso: string,
  endExclusiveIso: string,
  tenantScope: InventoryTenantScope
): Promise<ActualRow[] | null> {
  try {
    const rows = (await supabaseRpc<
      {
        item_code?: string
        beginning_qty?: number
        ending_qty?: number
        inbound_qty?: number
        outbound_qty?: number
        usage_qty?: number
        adjustment_qty?: number
        pos_qty?: number
        actual_usage_qty?: number
        has_adjustment?: boolean
      }[]
    >('get_ingredient_usage_actual', {
      p_location_patterns: patterns,
      p_start: startIso,
      p_end_exclusive: endExclusiveIso,
      ...(tenantScope.enforce && tenantScope.tenantId
        ? { p_tenant_id: tenantScope.tenantId }
        : { p_tenant_id: null }),
    })) as {
      item_code?: string
      beginning_qty?: number
      ending_qty?: number
      inbound_qty?: number
      outbound_qty?: number
      usage_qty?: number
      adjustment_qty?: number
      pos_qty?: number
      actual_usage_qty?: number
      has_adjustment?: boolean
    }[] | null

    return (rows || [])
      .map((r) => {
        const code = String(r.item_code || '').trim()
        if (!code) return null
        return {
          item_code: code,
          beginning_qty: Number(r.beginning_qty ?? 0),
          ending_qty: Number(r.ending_qty ?? 0),
          inbound_qty: Number(r.inbound_qty ?? 0),
          outbound_qty: Number(r.outbound_qty ?? 0),
          usage_qty: Number(r.usage_qty ?? 0),
          adjustment_qty: Number(r.adjustment_qty ?? 0),
          pos_qty: Number(r.pos_qty ?? 0),
          actual_usage_qty: Number(r.actual_usage_qty ?? 0),
          has_adjustment: Boolean(r.has_adjustment),
        }
      })
      .filter((x): x is ActualRow => Boolean(x))
  } catch {
    return null
  }
}

async function fetchActualFallback(
  patterns: string[],
  startYmd: string,
  endYmd: string,
  tenantScope: InventoryTenantScope
): Promise<ActualRow[]> {
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startYmd, endYmd)
  const { gtePart, ltPart } = stockLogBangkokDateRangeFilter(startYmd, endYmd)

  const locOr =
    patterns.length === 1
      ? `location=ilike.${encodeURIComponent(patterns[0])}`
      : `or=(${patterns.map((p) => `location.ilike.${encodeURIComponent(p)}`).join(',')})`

  const beginningAsOf = new Date(Date.parse(dayStartUtcIso) - 1).toISOString()
  const endingAsOf = new Date(Date.parse(nextDayStartUtcIso) - 1).toISOString()

  const fetchBalance = async (asOf: string): Promise<Record<string, number>> => {
    try {
      const rows = (await supabaseRpc<{ item_code: string; total_qty: number }[]>('get_store_stock', {
        p_location_patterns: patterns,
        p_as_of_date: asOf,
        ...(tenantScope.enforce && tenantScope.tenantId
          ? { p_tenant_id: tenantScope.tenantId }
          : {}),
      })) as { item_code?: string; total_qty?: number }[] | null
      const m: Record<string, number> = {}
      for (const r of rows || []) {
        const code = String(r.item_code || '').trim()
        if (!code) continue
        m[code] = Number(r.total_qty ?? 0)
      }
      return m
    } catch {
      const dateSuffix = `&log_date=lte.${encodeURIComponent(asOf)}`
      const filter = appendInventoryTenantFilter(`${locOr}${dateSuffix}`, tenantScope)
      const rows = (await supabaseSelectFilterAllPages('stock_logs', filter, {
        select: 'item_code,qty',
        order: 'id.asc',
        pageSize: 8000,
        maxRows: 400000,
      })) as { item_code?: string; qty?: number }[]
      const m: Record<string, number> = {}
      for (const r of rows || []) {
        const code = String(r.item_code || '').trim()
        if (!code) continue
        m[code] = (m[code] || 0) + (Number(r.qty) || 0)
      }
      return m
    }
  }

  const [beginning, ending] = await Promise.all([fetchBalance(beginningAsOf), fetchBalance(endingAsOf)])

  const tryPeriod = async (withDeletedFilter: boolean) => {
    const parts = [locOr, gtePart, ltPart]
    if (withDeletedFilter) parts.push('or=(is_deleted.is.null,is_deleted.is.false)')
    const periodFilter = appendInventoryTenantFilter(parts.join('&'), tenantScope)
    return (await supabaseSelectFilterAllPages('stock_logs', periodFilter, {
      select: 'id,item_code,qty,log_type',
      order: 'id.asc',
      pageSize: 8000,
      maxRows: 400000,
    })) as { id?: number; item_code?: string; qty?: number; log_type?: string }[]
  }

  let periodRows: { id?: number; item_code?: string; qty?: number; log_type?: string }[]
  try {
    periodRows = await tryPeriod(true)
  } catch (e) {
    if (tenantScope.enforce && isMissingInventoryTenantIdColumnError(e)) {
      markInventoryTenantIdColumnMissing()
    }
    try {
      periodRows = await tryPeriod(false)
    } catch (e2) {
      if (tenantScope.enforce && isMissingInventoryTenantIdColumnError(e2)) {
        markInventoryTenantIdColumnMissing()
        periodRows = []
      } else {
        throw e2
      }
    }
  }

  const inbound: Record<string, number> = {}
  const outbound: Record<string, number> = {}
  const usage: Record<string, number> = {}
  const adjustment: Record<string, number> = {}
  const pos: Record<string, number> = {}
  const hasAdj = new Set<string>()
  const seenP = new Set<number>()

  for (const row of periodRows || []) {
    const rid = Number(row.id)
    if (Number.isFinite(rid) && rid > 0) {
      if (seenP.has(rid)) continue
      seenP.add(rid)
    }
    const code = String(row.item_code || '').trim()
    if (!code) continue
    const q = Number(row.qty) || 0
    const lt = String(row.log_type || '')
    if (lt === 'Inbound' || lt === 'ForcePush') {
      if (q > 0) inbound[code] = (inbound[code] || 0) + q
    } else if (lt === 'Outbound' || lt === 'ForceOutbound') {
      outbound[code] = (outbound[code] || 0) + Math.abs(q)
    } else if (lt === 'Usage') {
      usage[code] = (usage[code] || 0) + Math.abs(q)
    } else if (lt === 'Adjustment') {
      adjustment[code] = (adjustment[code] || 0) + q
      hasAdj.add(code)
    } else if (lt === 'POS') {
      pos[code] = (pos[code] || 0) + Math.abs(q)
    } else if (lt === 'POS_REVERSAL') {
      pos[code] = (pos[code] || 0) - Math.abs(q)
    }
  }

  const codes = new Set<string>([
    ...Object.keys(beginning),
    ...Object.keys(ending),
    ...Object.keys(inbound),
    ...Object.keys(outbound),
    ...Object.keys(usage),
    ...Object.keys(adjustment),
    ...Object.keys(pos),
  ])

  const out: ActualRow[] = []
  for (const code of codes) {
    const b = beginning[code] || 0
    const e = ending[code] || 0
    const inn = inbound[code] || 0
    const outb = outbound[code] || 0
    out.push({
      item_code: code,
      beginning_qty: b,
      ending_qty: e,
      inbound_qty: inn,
      outbound_qty: outb,
      usage_qty: usage[code] || 0,
      adjustment_qty: adjustment[code] || 0,
      pos_qty: pos[code] || 0,
      actual_usage_qty: b + inn - outb - e,
      has_adjustment: hasAdj.has(code),
    })
  }
  return out
}

export async function computeIngredientUsageVariance(params: {
  store: string
  startYmd: string
  endYmd: string
  request?: NextRequest
  auth?: { role?: string; store?: string; tenantId?: string }
}): Promise<IngredientUsageVarianceResult> {
  const warnings: string[] = []
  const store = String(params.store || '').trim()
  const startYmd = String(params.startYmd || '').trim().slice(0, 10)
  const endYmd = String(params.endYmd || '').trim().slice(0, 10)

  if (!store || !/^\d{4}-\d{2}-\d{2}$/.test(startYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)) {
    return {
      success: false,
      message: 'store and date range required',
      startYmd,
      endYmd,
      store,
      posTruncated: false,
      actualSource: 'none',
      unmatchedOrderLines: 0,
      orderCount: 0,
      rows: [],
      warnings,
    }
  }

  if (isOfficeStockSelection(store)) {
    return {
      success: false,
      message: 'STORE_ONLY',
      startYmd,
      endYmd,
      store,
      posTruncated: false,
      actualSource: 'none',
      unmatchedOrderLines: 0,
      orderCount: 0,
      rows: [],
      warnings: ['STORE_ONLY'],
    }
  }

  const tenantScope = await resolveInventoryTenantScope({
    auth: params.auth?.tenantId ? { tenantId: params.auth.tenantId } : undefined,
    storeCode: store,
  })
  if (isInventoryTenantQueryBlocked(tenantScope)) {
    return {
      success: false,
      message: 'TENANT_BLOCKED',
      startYmd,
      endYmd,
      store,
      posTruncated: false,
      actualSource: 'none',
      unmatchedOrderLines: 0,
      orderCount: 0,
      rows: [],
      warnings: ['TENANT_BLOCKED'],
    }
  }

  const patterns = getStockLocationPatterns(store)
  if (!patterns.length) {
    return {
      success: true,
      startYmd,
      endYmd,
      store,
      posTruncated: false,
      actualSource: 'none',
      unmatchedOrderLines: 0,
      orderCount: 0,
      rows: [],
      warnings: ['NO_LOCATION'],
    }
  }

  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startYmd, endYmd)

  const [bomIndex, posFetch, itemsRows] = await Promise.all([
    buildPosMenuBomIndex(),
    fetchPosSalesOrdersForBusinessRange({
      startStr: startYmd,
      endStr: endYmd,
      storeCodes: [store],
      select: POS_SALES_MENU_ROW_SELECT,
      request: params.request,
      queryLabel: 'ingredientUsageVariance',
    }),
    supabaseSelectAllPages('items', {
      order: 'code.asc',
      select: 'code,name,unit,cost,price,total_quantity,category',
    }).catch(() => []) as Promise<
      {
        code?: string
        name?: string
        unit?: string
        cost?: number
        price?: number
        total_quantity?: number | null
        category?: string
      }[]
    >,
  ])

  const completed = filterCompletedPosSalesRows(posFetch.rows, null) as Array<{
    items_json?: string
    status?: string
    order_type?: string
  }>
  const theo = aggregateTheoreticalFromOrders(bomIndex, completed)

  let actualSource: 'rpc' | 'fallback' | 'none' = 'none'
  let actualRows: ActualRow[] = []
  const rpcRows = await fetchActualViaRpc(patterns, dayStartUtcIso, nextDayStartUtcIso, tenantScope)
  if (rpcRows) {
    actualRows = rpcRows
    actualSource = 'rpc'
  } else {
    warnings.push('ACTUAL_RPC_FALLBACK')
    actualRows = await fetchActualFallback(patterns, startYmd, endYmd, tenantScope)
    actualSource = 'fallback'
  }

  const itemMeta = new Map<
    string,
    {
      name: string
      unit: string
      raw: {
        cost?: number
        price?: number
        total_quantity?: number | null
        unit?: string
      }
    }
  >()
  for (const it of itemsRows || []) {
    const code = String(it.code || '').trim()
    if (!code) continue
    itemMeta.set(code, {
      name: String(it.name || code).trim() || code,
      unit: String(it.unit || '').trim(),
      raw: {
        cost: it.cost,
        price: it.price,
        total_quantity: it.total_quantity,
        unit: it.unit,
      },
    })
  }

  const actualByCode = new Map(actualRows.map((r) => [r.item_code, r]))
  const allCodes = new Set<string>([...Object.keys(theo.byItem), ...actualByCode.keys()])

  const rows: IngredientUsageVarianceRow[] = []
  for (const code of allCodes) {
    const theoreticalQty = round4(theo.byItem[code] || 0)
    const act = actualByCode.get(code)
    const actualQty = round4(act?.actual_usage_qty ?? 0)
    const varianceQty = round4(actualQty - theoreticalQty)
    const variancePct =
      theoreticalQty > 0.0001 ? round2((varianceQty / theoreticalQty) * 100) : theoreticalQty === 0 && actualQty !== 0 ? null : 0
    const meta = itemMeta.get(code)
    const ingredientType = theo.typeByItem[code] || 'unknown'
    const unitCost = meta
      ? getItemCostPerUnit(meta.raw, ingredientType === 'packaging')
      : 0
    const cost = Number.isFinite(unitCost) ? unitCost : 0
    const contribMap = theo.contributions.get(code)
    const menuContributions = contribMap
      ? Array.from(contribMap.values()).sort((a, b) => b.theoreticalQty - a.theoreticalQty)
      : []

    rows.push({
      itemCode: code,
      itemName: meta?.name || code,
      unit: meta?.unit || '',
      cost,
      ingredientType,
      theoreticalQty,
      actualQty,
      varianceQty,
      variancePct,
      varianceCost: round2(varianceQty * cost),
      beginningQty: round4(act?.beginning_qty ?? 0),
      endingQty: round4(act?.ending_qty ?? 0),
      inboundQty: round4(act?.inbound_qty ?? 0),
      outboundQty: round4(act?.outbound_qty ?? 0),
      usageQty: round4(act?.usage_qty ?? 0),
      adjustmentQty: round4(act?.adjustment_qty ?? 0),
      posQty: round4(act?.pos_qty ?? 0),
      hasAdjustment: Boolean(act?.has_adjustment),
      menuContributions,
    })
  }

  rows.sort((a, b) => Math.abs(b.varianceQty) - Math.abs(a.varianceQty))

  if (posFetch.truncated) warnings.push('POS_TRUNCATED')

  return {
    success: true,
    startYmd,
    endYmd,
    store,
    posTruncated: posFetch.truncated,
    actualSource,
    unmatchedOrderLines: theo.unmatchedOrderLines,
    orderCount: theo.orderCount,
    rows,
    warnings,
  }
}
