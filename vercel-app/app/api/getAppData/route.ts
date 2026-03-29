import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseRpc } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { isPosAdditiveOptionItemCategory } from '@/lib/pos-additive-item-category'
import { getStockLocationPatterns } from '@/lib/stock-location-patterns'
import { getBangkokEndOfDayUtcIso } from '@/lib/bangkok-time'

export interface AppItem {
  code: string
  category: string
  name: string
  spec: string
  price: number
  cost: number
  taxType: string
  safeQty: number
  image: string
  description?: string
  purchaseSource?: 'hq' | 'store'
  orderDisabled?: boolean
  /** 재고 기본 단위. 비어 있으면 unit 사용 (하위 호환) */
  stockBaseUnit?: string
  /** 조정/조사 시 선택 단위 (하위 호환) */
  stockUnitOptions?: { unit: string; factor: number }[]
  /** 표준 단위 목록. (totalQuantity) [unit] = 1 규격 → 입력÷totalQuantity = 규격 수 */
  standardUnits?: { unit: string; totalQuantity: number }[]
}

const ITEMS_SELECT_FULL = 'code,category,name,spec,unit,total_quantity,price,cost,tax,image,description,purchase_source,order_disabled,stock_base_unit,stock_unit_options,standard_units'
const ITEMS_SELECT_MINIMAL = 'code,category,name,spec,unit,total_quantity,price,cost,tax,image,description,purchase_source,order_disabled'

function parseStockUnitOptions(val: unknown): { unit: string; factor: number }[] {
  if (!Array.isArray(val)) return []
  return val
    .filter((x): x is { unit?: string; factor?: number } => x != null && typeof x === 'object')
    .map((x) => ({ unit: String(x.unit ?? '').trim(), factor: Number(x.factor) || 1 }))
    .filter((x) => x.unit.length > 0)
}

function parseStandardUnits(val: unknown): { unit: string; totalQuantity: number }[] {
  if (!Array.isArray(val)) return []
  return val
    .filter((x): x is { unit?: string; total_quantity?: number } => x != null && typeof x === 'object')
    .map((x) => ({ unit: String(x.unit ?? '').trim(), totalQuantity: Number(x.total_quantity) || 1 }))
    .filter((x) => x.unit.length > 0 && x.totalQuantity > 0)
}

async function getItems(storeName: string, scope?: string): Promise<AppItem[]> {
  const isOrderScope = String(scope || '').toLowerCase().trim() === 'order'
  type Row = {
    code?: string
    category?: string
    name?: string
    spec?: string
    unit?: string
    total_quantity?: number | null
    price?: number
    cost?: number
    tax?: string
    image?: string
    description?: string
    purchase_source?: string
    order_disabled?: boolean
    stock_base_unit?: string
    stock_unit_options?: unknown
    standard_units?: unknown
  }
  let rows: Row[] | null = null
  let useStockUnits = true
  try {
    if (isOrderScope) {
      rows = (await supabaseSelectFilter(
        'items',
        `or=(purchase_source.eq.hq,purchase_source.is.null)`,
        { order: 'id.asc', select: ITEMS_SELECT_FULL }
      )) as Row[] | null
    } else {
      rows = (await supabaseSelect('items', { order: 'id.asc', select: ITEMS_SELECT_FULL })) as Row[] | null
    }
  } catch {
    useStockUnits = false
    if (isOrderScope) {
      rows = (await supabaseSelectFilter(
        'items',
        `or=(purchase_source.eq.hq,purchase_source.is.null)`,
        { order: 'id.asc', select: ITEMS_SELECT_MINIMAL }
      )) as Row[] | null
    } else {
      rows = (await supabaseSelect('items', { order: 'id.asc', select: ITEMS_SELECT_MINIMAL })) as Row[] | null
    }
  }

  const safeMap: Record<string, number> = {}
  if (storeName) {
    const storeNorm = String(storeName).toLowerCase().trim()
    const settings = (await supabaseSelectFilter(
      'store_settings',
      `store=ilike.${encodeURIComponent(storeNorm)}`
    )) as { code?: string; safe_qty?: number }[] | null
    for (let i = 0; i < (settings || []).length; i++) {
      const c = String(settings![i].code || '')
      if (c) safeMap[c] = Number(settings![i].safe_qty) || 0
    }
  }
  const list: AppItem[] = []
  for (let i = 0; i < (rows || []).length; i++) {
    const row = rows![i]
    if (!row?.code) continue
    // 매장 발주 품목(scope=order)에서 order_disabled=true면 제외
    if (isOrderScope && row.order_disabled === true) continue
    // POS 추가형 옵션용 품목 마스터 — 발주 품목이 아님(판매 단위는 POS 메뉴·옵션)
    if (isOrderScope && isPosAdditiveOptionItemCategory(row.category)) continue
    const taxType = row.tax === '면세' ? '면세' : row.tax === '영세율' ? '영세율' : '과세'
    const ps = String(row.purchase_source || '').trim()
    list.push({
      code: String(row.code),
      category: String(row.category || ''),
      name: String(row.name || ''),
      spec: String(row.spec || ''),
      price: Number(row.price) || 0,
      cost: Number(row.cost) || 0,
      taxType,
      safeQty: safeMap[row.code] || 0,
      image: String(row.image || ''),
      description: row.description ? String(row.description).trim() : undefined,
      purchaseSource: ps === 'store' ? 'store' : 'hq',
      orderDisabled: row.order_disabled === true,
      ...(useStockUnits && row
        ? (() => {
            const parsed = parseStandardUnits((row as Row).standard_units)
            const standardUnits =
              parsed.length > 0
                ? parsed
                : (() => {
                    const u = String((row as Row).unit ?? '').trim()
                    const tq = Number((row as Row).total_quantity)
                    if (u && !isNaN(tq) && tq > 0) return [{ unit: u, totalQuantity: tq }]
                    return []
                  })()
            return {
              stockBaseUnit: String((row as Row).stock_base_unit ?? '').trim(),
              stockUnitOptions: parseStockUnitOptions((row as Row).stock_unit_options),
              standardUnits,
            }
          })()
        : {}),
    })
  }
  return list
}

async function getStoreStock(store: string, asOfDate?: string): Promise<Record<string, number>> {
  try {
    const storeNorm = String(store || '').toLowerCase().trim()
    if (!storeNorm) return {}

    const patterns: string[] = getStockLocationPatterns(store)
    if (patterns.length === 0) return {}

    const asOfTrim = asOfDate?.trim() || ''
    const asOfTimestamp =
      asOfTrim && /^\d{4}-\d{2}-\d{2}$/.test(asOfTrim) ? getBangkokEndOfDayUtcIso(asOfTrim) : null

    try {
      const rows = (await supabaseRpc<{ item_code: string; total_qty: number }[]>(
        'get_store_stock',
        {
          p_location_patterns: patterns,
          p_as_of_date: asOfTimestamp,
        }
      )) as { item_code?: string; total_qty?: number }[] | null

      const m: Record<string, number> = {}
      for (let i = 0; i < (rows || []).length; i++) {
        const code = rows![i].item_code
        if (!code) continue
        m[code] = Number(rows![i].total_qty ?? 0)
      }
      return m
    } catch (rpcErr) {
      // RPC 미배포 시 fallback: 기존 select 방식 (limit 50000)
      const locFilter =
        patterns.length === 1
          ? `location=ilike.${encodeURIComponent(patterns[0])}`
          : `or=(${patterns.map((p) => `location.ilike.${encodeURIComponent(p)}`).join(',')})`
      const dateSuffix = asOfTimestamp
        ? `&log_date=lte.${encodeURIComponent(asOfTimestamp)}`
        : ''
      const rows = (await supabaseSelectFilter(
        'stock_logs',
        `${locFilter}${dateSuffix}`,
        { order: 'id.asc', limit: 50000, select: 'item_code,qty' }
      )) as { item_code?: string; qty?: number }[] | null
      const m: Record<string, number> = {}
      for (let i = 0; i < (rows || []).length; i++) {
        const code = rows![i].item_code
        if (!code) continue
        m[code] = (m[code] || 0) + Number(rows![i].qty || 0)
      }
      return m
    }
  } catch {
    return {}
  }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeName = String(searchParams.get('storeName') || searchParams.get('store') || '').trim()
  const asOfDate = String(searchParams.get('asOfDate') || searchParams.get('date') || '').trim()
  const scope = String(searchParams.get('scope') || '').trim()

  const auth = await getVerifiedAuth(request)
  const userRole = (auth?.role || '').toLowerCase()
  const isManager = userRole.includes('manager') || userRole.includes('franchisee')
  const userStore = (auth?.store || '').trim()
  if (isManager && userStore && storeName) {
    const storeNorm = storeName.toLowerCase().trim()
    const userNorm = userStore.toLowerCase().trim()
    const matches = storeNorm === userNorm || userNorm.includes(storeNorm) || storeNorm.includes(userNorm)
    if (!matches) {
      return NextResponse.json({ items: [], stock: {} }, { headers })
    }
  }

  try {
    const [items, stock] = await Promise.all([
      getItems(storeName, scope || undefined),
      getStoreStock(storeName, asOfDate || undefined),
    ])
    return NextResponse.json({ items, stock }, { headers })
  } catch (e) {
    console.error('getAppData:', e)
    return NextResponse.json({ items: [], stock: {} }, { headers })
  }
}
