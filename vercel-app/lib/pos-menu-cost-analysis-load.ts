/**
 * POS 원가 분석 — tenant 스코프별 페이지 로드 (전 테이블 스캔 방지)
 */
import { supabaseSelectAllPages, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import {
  appendPosCatalogTenantFilter,
  buildPosCatalogTenantFilter,
  isPosCatalogTenantQueryBlocked,
  type PosCatalogTenantScope,
} from '@/lib/pos-catalog-tenant-scope'
import {
  buildInventoryTenantFilter,
  isInventoryTenantQueryBlocked,
  type InventoryTenantScope,
} from '@/lib/inventory-tenant-scope'

export type CostAnalysisMenuRow = {
  id?: number
  code?: string
  name?: string
  category?: string
  category_main?: string
  promo_id?: number | null
  is_active?: boolean | null
  price?: number
  price_delivery?: number | null
  vat_included?: boolean
  cooking_time_min?: number | null
  delivery_app_fee_percent?: number | null
}

export type CostAnalysisIngRow = {
  id?: number
  menu_id?: number
  menu_code?: string | null
  option_id?: number | null
  item_code?: string
  quantity?: number
  loss_rate?: number
  ingredient_type?: string
  quantity_unit_key?: string | null
}

export type CostAnalysisOptRow = {
  id?: number
  menu_id?: number
  name?: string
  option_code?: string | null
  option_type?: string
  item_code?: string | null
  additive_source_menu_id?: number | null
  quantity?: number
  sort_order?: number
  price_modifier?: number
  price_modifier_delivery?: number | null
}

export type CostAnalysisItemRow = {
  id?: number
  code?: string
  name?: string
  cost?: number
  price?: number
  total_quantity?: number
  unit?: string
  purchase_source?: string
  category?: string
}

async function selectAllWithOptionalTenantFilter(
  table: string,
  tenantFilter: string,
  options: { order: string; select: string }
): Promise<unknown[]> {
  if (tenantFilter) {
    return supabaseSelectFilterAllPages(table, tenantFilter, options)
  }
  return supabaseSelectAllPages(table, options)
}

export async function loadCostAnalysisMenus(
  scope: PosCatalogTenantScope
): Promise<CostAnalysisMenuRow[]> {
  if (isPosCatalogTenantQueryBlocked(scope)) return []
  const tenantFilter = buildPosCatalogTenantFilter(scope)
  try {
    return (await selectAllWithOptionalTenantFilter('pos_menus', tenantFilter, {
      order: 'category_main.asc,category.asc,sort_order.asc,name.asc',
      select:
        'id,code,name,category,category_main,promo_id,is_active,price,price_delivery,vat_included,cooking_time_min,delivery_app_fee_percent',
    })) as CostAnalysisMenuRow[]
  } catch {
    try {
      return (await selectAllWithOptionalTenantFilter('pos_menus', tenantFilter, {
        order: 'category.asc,sort_order.asc,name.asc',
        select: 'id,code,name,category,promo_id,price,price_delivery,vat_included',
      })) as CostAnalysisMenuRow[]
    } catch {
      return []
    }
  }
}

export async function loadCostAnalysisIngredients(
  scope: PosCatalogTenantScope,
  menuIds: Set<number>
): Promise<CostAnalysisIngRow[]> {
  if (isPosCatalogTenantQueryBlocked(scope)) return []
  const order = 'id.asc'
  const selects = [
    'id,menu_id,menu_code,option_id,item_code,quantity,loss_rate,ingredient_type,quantity_unit_key',
    'id,menu_id,menu_code,option_id,item_code,quantity,loss_rate,ingredient_type',
    'id,menu_id,option_id,item_code,quantity,loss_rate,ingredient_type',
  ]
  const tenantFilter = buildPosCatalogTenantFilter(scope)
  let rows: CostAnalysisIngRow[] = []
  for (const select of selects) {
    try {
      rows = (await selectAllWithOptionalTenantFilter('pos_menu_ingredients', tenantFilter, {
        order,
        select,
      })) as CostAnalysisIngRow[]
      break
    } catch {
      /* 다음 select */
    }
  }
  if (!scope.enforce || menuIds.size === 0) return rows
  return rows.filter((r) => menuIds.has(Number(r.menu_id || 0)))
}

export async function loadCostAnalysisOptions(menuIds: Set<number>): Promise<CostAnalysisOptRow[]> {
  const ids = [...menuIds].filter((id) => id > 0)
  if (!ids.length) return []
  const order = 'menu_id.asc,sort_order.asc,name.asc'
  const selects = [
    'id,menu_id,name,option_code,option_type,item_code,additive_source_menu_id,quantity,sort_order,price_modifier,price_modifier_delivery',
    'id,menu_id,name,option_code,option_type,item_code,quantity,sort_order,price_modifier,price_modifier_delivery',
    'id,menu_id,name,option_type,item_code,quantity,sort_order',
  ]
  const chunkSize = 200
  const out: CostAnalysisOptRow[] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const filter = `menu_id=in.(${chunk.join(',')})`
    for (const select of selects) {
      try {
        const batch = (await supabaseSelectFilterAllPages('pos_menu_options', filter, {
          order,
          select,
        })) as CostAnalysisOptRow[]
        out.push(...batch)
        break
      } catch {
        /* 다음 select */
      }
    }
  }
  return out
}

export async function loadCostAnalysisItems(
  scope: InventoryTenantScope
): Promise<CostAnalysisItemRow[]> {
  if (isInventoryTenantQueryBlocked(scope)) return []
  const tenantFilter = buildInventoryTenantFilter(scope)
  try {
    return (await selectAllWithOptionalTenantFilter('items', tenantFilter, {
      order: 'code.asc',
      select: 'id,code,name,cost,price,total_quantity,unit,purchase_source,category',
    })) as CostAnalysisItemRow[]
  } catch {
    return []
  }
}

/** sauces 테이블에 tenant_id 없음 — Omni enforce 시 빈 목록(fail-closed) */
export async function loadCostAnalysisSauces(scope: InventoryTenantScope): Promise<
  Array<{ id?: number; code?: string; name?: string; cost_per_unit?: number; unit?: string; overhead_percent?: number }>
> {
  if (scope.enforce) return []
  try {
    return (await supabaseSelectAllPages('sauces', {
      order: 'id.asc',
      select: 'id,code,name,cost_per_unit,unit,overhead_percent',
    })) as Array<{
      id?: number
      code?: string
      name?: string
      cost_per_unit?: number
      unit?: string
      overhead_percent?: number
    }>
  } catch {
    return []
  }
}

export async function loadCostAnalysisSauceIngredients(scope: InventoryTenantScope): Promise<
  Array<{ sauce_id?: number; item_code?: string; quantity?: number; loss_rate?: number }>
> {
  if (scope.enforce) return []
  try {
    return (await supabaseSelectAllPages('sauce_ingredients', {
      order: 'sauce_id.asc',
      select: 'sauce_id,item_code,quantity,loss_rate',
    })) as Array<{ sauce_id?: number; item_code?: string; quantity?: number; loss_rate?: number }>
  } catch {
    return []
  }
}

export function appendCatalogScopeToPromoItemsFilter(
  promoIds: number[],
  scope: PosCatalogTenantScope
): string {
  const base = `promo_id=in.(${promoIds.join(',')})`
  return appendPosCatalogTenantFilter(base, scope)
}
