/**
 * 메뉴 판매 집계 — 대분류 / 카테고리 / 메인 메뉴 / 옵션 4단계 (pos_orders items_json).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { filterRowsByPosSalesBusinessDateRange, posSalesBusinessDateRangeUtcEnvelope } from '@/lib/pos-sales-business-day-range'
import { parseOrderTypesParam, rowMatchesOrderFilter } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams, appendStoreCodeFilter } from '@/lib/pos-sales-store-filter'
import { applyPosSalesStoreSelectionFilter } from '@/lib/pos-sales-fetch-rows'
import { excludePosSalesTestOfficeRows } from '@/lib/pos-sales-test-office'
import { loadPosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'
import {
  aggregatePosSalesMenuHierarchy,
  filterHierarchyRows,
  type PosSalesHierarchyLevel,
} from '@/lib/pos-sales-menu-hierarchy-aggregate'

const ORDER_FETCH_LIMIT = 10000
const HIERARCHY_LEVELS: PosSalesHierarchyLevel[] = ['main', 'category', 'menu', 'option']

function parseSearchTokens(raw: string | null): string[] {
  return String(raw ?? '')
    .split(/[,\n]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
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
    const levelRaw = String(searchParams.get('level') ?? 'all').toLowerCase()
    const level: PosSalesHierarchyLevel | 'all' = HIERARCHY_LEVELS.includes(
      levelRaw as PosSalesHierarchyLevel
    )
      ? (levelRaw as PosSalesHierarchyLevel)
      : 'all'

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const bizCtx = await loadPosBusinessDaySettingsContext()
    const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(bizCtx, startStr, endStr)
    let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    filter = appendStoreCodeFilter(filter, stores)

    const rowsRaw = (await supabaseSelectFilter('pos_orders', filter, {
      limit: ORDER_FETCH_LIMIT,
      select: 'created_at,items_json,status,order_type,store_code',
    })) as {
      created_at?: string
      items_json?: string
      status?: string
      order_type?: string
      store_code?: string
    }[]

    let rows = filterRowsByPosSalesBusinessDateRange(rowsRaw, bizCtx, startStr, endStr)
    rows = excludePosSalesTestOfficeRows(rows)
    rows = applyPosSalesStoreSelectionFilter(rows, stores.length > 0 ? stores : undefined)
    rows = rows.filter((r) => rowMatchesOrderFilter(r.order_type, orderTypesAllowed))

    const truncated = rowsRaw.length >= ORDER_FETCH_LIMIT
    if (truncated) headers.set('X-Sales-Truncated', '1')

    const menus = (await supabaseSelect('pos_menus', {
      limit: 5000,
      select: 'id,name,category,category_main',
    })) as { id?: number | string; name?: string; category?: string; category_main?: string }[] | null

    let options: { id?: number | string; menu_id?: number | string; name?: string; option_code?: string }[] =
      []
    try {
      options =
        ((await supabaseSelect('pos_menu_options', {
          limit: 8000,
          select: 'id,menu_id,name,option_code',
        })) as typeof options | null) ?? []
    } catch {
      try {
        options =
          ((await supabaseSelect('pos_menu_options', {
            limit: 8000,
            select: 'id,menu_id,name',
          })) as typeof options | null) ?? []
      } catch {
        options = []
      }
    }

    const aggregated = aggregatePosSalesMenuHierarchy({
      orderRows: rows,
      menus: Array.isArray(menus) ? menus : [],
      options: Array.isArray(options) ? options : [],
    })

    const levels = { ...aggregated.levels }
    if (searchTokens.length > 0) {
      for (const lv of HIERARCHY_LEVELS) {
        levels[lv] = filterHierarchyRows(levels[lv], searchTokens, searchAnd)
      }
    }

    const sliceLimit = 500
    for (const lv of HIERARCHY_LEVELS) {
      levels[lv] = levels[lv].slice(0, sliceLimit)
    }

    const body =
      level === 'all'
        ? { levels, totals: aggregated.totals, truncated }
        : { level, rows: levels[level], totals: aggregated.totals, truncated }

    return NextResponse.json(body, { headers })
  } catch (e) {
    console.error('posSalesByMenuHierarchy:', e)
    return NextResponse.json(
      {
        levels: { main: [], category: [], menu: [], option: [] },
        totals: { qty: 0, sales: 0 },
        truncated: false,
      },
      { headers }
    )
  }
}
