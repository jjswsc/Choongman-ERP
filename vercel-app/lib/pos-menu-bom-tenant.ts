import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  appendPosCatalogTenantFilter,
  assertPosCatalogTenantWritable,
  isMissingTenantIdColumnError,
  isPosCatalogTenantQueryBlocked,
  markPosMenusTenantIdColumnMissing,
  resolvePosCatalogTenantScope,
  rowBelongsToPosCatalogTenant,
  stampPosCatalogTenantId,
  type PosCatalogTenantScope,
} from '@/lib/pos-catalog-tenant-scope'

export type PosMenuBomRow = { id?: number; code?: string; tenant_id?: string | null }
export type PosMenuIngredientRow = { id?: number; menu_id?: number; tenant_id?: string | null }

export async function resolvePosMenuBomTenantScope(auth?: {
  tenantId?: string
  company?: string
  store?: string
} | null): Promise<PosCatalogTenantScope> {
  return resolvePosCatalogTenantScope({ auth, storeCode: auth?.store })
}

export async function loadPosMenuForBom(
  menuId: number,
  scope: PosCatalogTenantScope
): Promise<PosMenuBomRow | null> {
  const id = Math.floor(Number(menuId || 0))
  if (!id) return null
  if (isPosCatalogTenantQueryBlocked(scope)) return null
  const base = `id=eq.${id}`
  try {
    const filter = scope.enforce ? appendPosCatalogTenantFilter(base, scope) : base
    const rows = (await supabaseSelectFilter('pos_menus', filter, {
      limit: 1,
      select: 'id,code,tenant_id',
    })) as PosMenuBomRow[]
    const row = rows?.[0]
    if (!row?.id) return null
    if (!rowBelongsToPosCatalogTenant(row, scope)) return null
    return row
  } catch (e) {
    if (isMissingTenantIdColumnError(e)) {
      markPosMenusTenantIdColumnMissing()
      if (scope.enforce) return null
      const rows = (await supabaseSelectFilter('pos_menus', base, {
        limit: 1,
        select: 'id,code',
      })) as PosMenuBomRow[]
      return rows?.[0] ?? null
    }
    throw e
  }
}

export async function loadPosMenuIngredientForBom(
  ingredientId: number | string,
  scope: PosCatalogTenantScope
): Promise<PosMenuIngredientRow | null> {
  const id = String(ingredientId || '').trim()
  if (!id) return null
  if (isPosCatalogTenantQueryBlocked(scope)) return null
  const rows = (await supabaseSelectFilter('pos_menu_ingredients', `id=eq.${encodeURIComponent(id)}`, {
    limit: 1,
    select: 'id,menu_id,tenant_id',
  })) as PosMenuIngredientRow[]
  const row = rows?.[0]
  if (!row?.id) return null
  if (scope.enforce && row.tenant_id && !rowBelongsToPosCatalogTenant(row, scope)) return null
  const menuId = Number(row.menu_id || 0)
  if (scope.enforce && menuId) {
    const menu = await loadPosMenuForBom(menuId, scope)
    if (!menu) return null
  }
  return row
}

export function stampPosMenuIngredientRow<T extends Record<string, unknown>>(
  row: T,
  scope: PosCatalogTenantScope
): T {
  return stampPosCatalogTenantId(row, scope)
}

export function assertPosMenuBomWritable(scope: PosCatalogTenantScope): string | null {
  return assertPosCatalogTenantWritable(scope)
}
