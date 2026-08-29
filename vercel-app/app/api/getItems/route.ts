import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { createVendorNameResolver } from '@/lib/vendor-name-normalizer'
import {
  appendInventoryTenantFilter,
  isInventoryTenantQueryBlocked,
  isMissingInventoryTenantIdColumnError,
  markInventoryTenantIdColumnMissing,
  resolveInventoryTenantScope,
} from '@/lib/inventory-tenant-scope'
import { getVerifiedAuth } from '@/lib/verify-auth'

const ITEMS_SELECT_FULL = 'id,code,category,name,spec,unit,price,cost,total_quantity,image,vendor,tax,outbound_location,description,purchase_source,order_disabled,sort_order,stock_base_unit,stock_unit_options,standard_units,account_subject_id'
const ITEMS_SELECT_MINIMAL = 'id,code,category,name,spec,unit,price,cost,total_quantity,image,vendor,tax,outbound_location,description,purchase_source,order_disabled,sort_order'

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
    .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
    .map((x) => {
      const raw =
        x.total_quantity != null
          ? Number(x.total_quantity)
          : x.totalQuantity != null
            ? Number(x.totalQuantity)
            : NaN
      const totalQuantity = Number.isFinite(raw) && raw > 0 ? raw : 1
      return { unit: String(x.unit ?? '').trim(), totalQuantity }
    })
    .filter((x) => x.unit.length > 0 && x.totalQuantity > 0)
}

type ItemRow = {
  id?: number
  code?: string
  category?: string
  name?: string
  spec?: string
  unit?: string
  price?: number
  cost?: number
  total_quantity?: number
  image?: string
  vendor?: string
  tax?: string
  outbound_location?: string
  description?: string
  purchase_source?: string
  order_disabled?: boolean
  sort_order?: number | null
  stock_base_unit?: string
  stock_unit_options?: { unit: string; factor: number }[] | null
  standard_units?: unknown
  account_subject_id?: number | null
}

/** 관리자 품목 관리 - Supabase items 테이블 조회. scope=outbound|order 시 본사 전용만 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const scope = String(searchParams.get('scope') || '').toLowerCase().trim()
  const isHqOnly = scope === 'outbound' || scope === 'order'

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const tenantScope = await resolveInventoryTenantScope({ auth })
    if (isInventoryTenantQueryBlocked(tenantScope)) {
      return NextResponse.json([], { headers })
    }

    const resolveVendorName = await createVendorNameResolver()
    let rows: ItemRow[] | null = null
    let hasStockCols = true
    const hqFilter = 'or=(purchase_source.eq.hq,purchase_source.is.null)'
    const baseFilter = isHqOnly ? hqFilter : ''
    const filter = appendInventoryTenantFilter(baseFilter, tenantScope)

    const selectItems = async (selectCols: string) => {
      if (filter) {
        return (await supabaseSelectFilter('items', filter, {
          order: 'sort_order.asc.nullslast,id.asc',
          limit: 5000,
          select: selectCols,
        })) as ItemRow[] | null
      }
      return (await supabaseSelect('items', {
        order: 'sort_order.asc.nullslast,id.asc',
        limit: 5000,
        select: selectCols,
      })) as ItemRow[] | null
    }

    try {
      rows = await selectItems(ITEMS_SELECT_FULL)
    } catch (err) {
      if (filter && isMissingInventoryTenantIdColumnError(err)) {
        markInventoryTenantIdColumnMissing()
        if (tenantScope.enforce) return NextResponse.json([], { headers })
      }
      hasStockCols = false
      try {
        rows = await selectItems(ITEMS_SELECT_MINIMAL)
      } catch (err2) {
        if (filter && isMissingInventoryTenantIdColumnError(err2)) {
          markInventoryTenantIdColumnMissing()
          if (tenantScope.enforce) return NextResponse.json([], { headers })
        }
        throw err2
      }
    }
    const list = (rows || [])
      .filter((row) => {
        if (!row) return false
        const c = String(row.code || '').trim()
        if (c) return true
        // 매장 전용 품목: purchase_source=store 이거나 category=매장 전용 (미설정 케이스 대비)
        const isStore =
          row.purchase_source === 'store' || String(row.category || '').trim() === '매장 전용'
        return isStore && row.id != null
      })
      .map((row) => {
        const tax = String(row.tax || '').trim()
        const taxType = tax === '면세' ? 'exempt' : tax === '영세율' ? 'zero' : 'taxable'
        const cat = String(row.category || '').trim()
        const category = cat === '매장 전용' ? 'Store Only' : cat
        const rawCode = String(row.code || '').trim()
        const code = rawCode || (row.id != null ? `_local_${row.id}` : '')
        return {
          code,
          name: String(row.name || ''),
          category,
          vendor: resolveVendorName(String(row.vendor || '')),
          outboundLocation: String(row.outbound_location || ''),
          spec: String(row.spec || ''),
          unit: String(row.unit || ''),
          price: Number(row.price) || 0,
          cost: Number(row.cost) || 0,
          totalQuantity: row.total_quantity != null ? Number(row.total_quantity) : null,
          taxType,
          imageUrl: String(row.image || ''),
          hasImage: !!(row.image && String(row.image).trim()),
          description: row.description ? String(row.description).trim() : '',
          purchaseSource: ((row.purchase_source ?? 'hq') === 'store' ? 'store' : 'hq') as 'hq' | 'store',
          orderDisabled: row.order_disabled === true,
          sortOrder: row.sort_order != null ? Number(row.sort_order) : undefined,
          accountSubjectId:
            row.account_subject_id != null && !Number.isNaN(Number(row.account_subject_id))
              ? Number(row.account_subject_id)
              : null,
          ...(hasStockCols
            ? {
                stockBaseUnit: String(row.stock_base_unit ?? '').trim(),
                stockUnitOptions: parseStockUnitOptions(row.stock_unit_options),
                standardUnits: parseStandardUnits(row.standard_units),
              }
            : {}),
        }
      })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getItems:', e)
    return NextResponse.json([], { headers })
  }
}
