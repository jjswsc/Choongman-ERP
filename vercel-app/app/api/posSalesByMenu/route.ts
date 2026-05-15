/**
 * 메뉴별 매출 (수량·금액). pos_orders 기반. items_json에서 추출.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { filterRowsByPosSalesBusinessDateRange, posSalesBusinessDateRangeUtcEnvelope } from '@/lib/pos-sales-business-day-range'
import { parseOrderTypesParam, rowMatchesOrderFilter } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams, appendStoreCodeFilter } from '@/lib/pos-sales-store-filter'
import { loadPosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']

type PosOrderItem = {
  id?: string
  name?: string
  price?: number
  qty?: number
  category?: string
  category_main?: string
}

type PosMenuMeta = {
  id?: number | string
  name?: string
  category?: string
  category_main?: string
}

function parseSearchTokens(raw: string | null): string[] {
  return String(raw ?? '')
    .split(/[,\n]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
}

const MENU_FETCH_LIMIT = 10000

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

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const bizCtx = await loadPosBusinessDaySettingsContext()
    const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(bizCtx, startStr, endStr)
    let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    filter = appendStoreCodeFilter(filter, stores)

    const rowsRaw = (await supabaseSelectFilter('pos_orders', filter, {
      limit: MENU_FETCH_LIMIT,
      select: 'created_at,items_json,status,order_type,store_code',
    })) as { created_at?: string; items_json?: string; status?: string; order_type?: string; store_code?: string }[]

    const rows = filterRowsByPosSalesBusinessDateRange(rowsRaw, bizCtx, startStr, endStr)

    if (rowsRaw.length >= MENU_FETCH_LIMIT) headers.set('X-Sales-Truncated', '1')

    const menus = (await supabaseSelect('pos_menus', {
      limit: 5000,
      select: 'id,name,category,category_main',
    })) as PosMenuMeta[]

    const menuById = new Map<string, PosMenuMeta>()
    const menuByName = new Map<string, PosMenuMeta>()
    for (const m of menus) {
      const idKey = String(m.id ?? '').trim()
      if (idKey) menuById.set(idKey, m)
      const nameKey = String(m.name ?? '').trim().toLowerCase()
      if (nameKey && !menuByName.has(nameKey)) menuByName.set(nameKey, m)
    }

    const byMenu: Record<string, { qty: number; sales: number }> = {}
    for (const r of rows) {
      if (!rowMatchesOrderFilter(r.order_type, orderTypesAllowed)) continue
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
      let items: PosOrderItem[] = []
      try {
        const parsed = JSON.parse(r.items_json || '[]')
        items = Array.isArray(parsed) ? parsed : []
      } catch {
        // skip
      }
      for (const it of items) {
        const name = String(it.name ?? '').trim() || '(없음)'
        const itemId = String(it.id ?? '').trim()
        const menuMeta =
          (itemId ? menuById.get(itemId) : undefined) ??
          menuByName.get(name.toLowerCase())
        const categoryMain = String(it.category_main ?? menuMeta?.category_main ?? '').trim()
        const category = String(it.category ?? menuMeta?.category ?? '').trim()

        if (searchTokens.length > 0) {
          const haystack = [name, categoryMain, category]
            .join(' ')
            .toLowerCase()
          const matched = searchAnd
            ? searchTokens.every((token) => haystack.includes(token))
            : searchTokens.some((token) => haystack.includes(token))
          if (!matched) continue
        }
        const qty = Math.max(0, Number(it.qty) || 0)
        const price = Number(it.price) || 0
        const sales = qty * price
        if (!byMenu[name]) byMenu[name] = { qty: 0, sales: 0 }
        byMenu[name].qty += qty
        byMenu[name].sales += sales
      }
    }

    const result = Object.entries(byMenu)
      .map(([name, v]) => ({ name, qty: v.qty, sales: v.sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 500)

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByMenu:', e)
    return NextResponse.json([], { headers })
  }
}
