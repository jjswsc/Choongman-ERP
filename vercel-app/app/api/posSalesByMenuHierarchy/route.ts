/**
 * 메뉴 판매 집계 — 대분류 / 카테고리 / 메인 메뉴 / 옵션 4단계 (pos_orders items_json).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import {
  POS_ORDER_TYPE_DB_VALUES,
  parseOrderTypesParam,
  rowMatchesOrderFilter,
  type PosOrderTypeValue,
} from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_MENU_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { filterCompletedPosSalesRows } from '@/lib/pos-sales-period-aggregate'
import {
  aggregatePosSalesMenuHierarchy,
  filterHierarchyRows,
  type PosSalesHierarchyLevel,
} from '@/lib/pos-sales-menu-hierarchy-aggregate'
import { loadPosSalesOptionCatalog } from '@/lib/pos-sales-option-catalog-server'

const HIERARCHY_LEVELS: PosSalesHierarchyLevel[] = ['main', 'category', 'menu', 'option']

function parseSearchTokens(raw: string | null): string[] {
  return String(raw ?? '')
    .split(/[,\n]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
}

function applySearchSliceLevels(
  levels: Record<PosSalesHierarchyLevel, import('@/lib/pos-sales-menu-hierarchy-aggregate').PosSalesHierarchyRow[]>,
  searchTokens: string[],
  searchAnd: boolean,
  sliceLimit: number
) {
  const out = { ...levels }
  if (searchTokens.length > 0) {
    for (const lv of HIERARCHY_LEVELS) {
      out[lv] = filterHierarchyRows(out[lv], searchTokens, searchAnd)
    }
  }
  for (const lv of HIERARCHY_LEVELS) {
    out[lv] = out[lv].slice(0, sliceLimit)
  }
  return out
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const stores = resolveStoresFromParams(pos, searchParams.get('stores'))
    const searchTokens = parseSearchTokens(searchParams.get('search'))
    const searchMode = String(searchParams.get('searchMode') ?? 'or').toLowerCase()
    const searchAnd = searchMode === 'and' || searchMode === 'all'
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))
    const splitByOrderType =
      searchParams.get('splitByOrderType') === '1' ||
      searchParams.get('splitByOrderType') === 'true'
    const levelRaw = String(searchParams.get('level') ?? 'all').toLowerCase()
    const level: PosSalesHierarchyLevel | 'all' = HIERARCHY_LEVELS.includes(
      levelRaw as PosSalesHierarchyLevel
    )
      ? (levelRaw as PosSalesHierarchyLevel)
      : 'all'

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const { rows: rawRows, truncated } = await fetchPosSalesOrdersForBusinessRange({
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      select: POS_SALES_MENU_ROW_SELECT,
      queryLabel: 'posSalesByMenuHierarchy',
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'posSalesFetchRows')

    const rows = filterCompletedPosSalesRows(rawRows, orderTypesAllowed)

    const menus = (await supabaseSelect('pos_menus', {
      limit: 5000,
      select: 'id,name,category,category_main',
    })) as { id?: number | string; name?: string; category?: string; category_main?: string }[] | null

    let options: Awaited<ReturnType<typeof loadPosSalesOptionCatalog>> = []
    try {
      options = await loadPosSalesOptionCatalog()
    } catch (catalogErr) {
      console.error('loadPosSalesOptionCatalog:', catalogErr)
    }
    const menuList = Array.isArray(menus) ? menus : []
    const sliceLimit = 500

    const aggregated = aggregatePosSalesMenuHierarchy({
      orderRows: rows,
      menus: menuList,
      options: Array.isArray(options) ? options : [],
    })

    const levels = applySearchSliceLevels(
      { ...aggregated.levels },
      searchTokens,
      searchAnd,
      sliceLimit
    )

    let byOrderType:
      | Record<
          PosOrderTypeValue,
          {
            levels: Record<PosSalesHierarchyLevel, import('@/lib/pos-sales-menu-hierarchy-aggregate').PosSalesHierarchyRow[]>
            totals: { qty: number; sales: number }
          }
        >
      | undefined

    if (splitByOrderType) {
      const channels: PosOrderTypeValue[] = orderTypesAllowed ?? [...POS_ORDER_TYPE_DB_VALUES]
      byOrderType = {} as NonNullable<typeof byOrderType>
      for (const ch of channels) {
        const chRows = rows.filter((r) => rowMatchesOrderFilter(r.order_type, [ch]))
        const chAgg = aggregatePosSalesMenuHierarchy({
          orderRows: chRows,
          menus: menuList,
          options: Array.isArray(options) ? options : [],
        })
        byOrderType[ch] = {
          levels: applySearchSliceLevels({ ...chAgg.levels }, searchTokens, searchAnd, sliceLimit),
          totals: chAgg.totals,
        }
      }
    }

    const body =
      level === 'all'
        ? { levels, totals: aggregated.totals, truncated, ...(byOrderType ? { byOrderType } : {}) }
        : {
            level,
            rows: levels[level],
            totals: aggregated.totals,
            truncated,
            ...(byOrderType ? { byOrderType } : {}),
          }

    return NextResponse.json(body, { headers })
  } catch (e) {
    console.error('posSalesByMenuHierarchy:', e)
    return NextResponse.json(
      {
        levels: { main: [], category: [], menu: [], option: [] },
        totals: { qty: 0, sales: 0 },
        truncated: false,
        byOrderType: undefined,
      },
      { headers }
    )
  }
}
