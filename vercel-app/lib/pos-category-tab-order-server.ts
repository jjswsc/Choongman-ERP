import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  posMenuCategoriesSettingsKey,
  type PosCatalogTenantScope,
} from '@/lib/pos-catalog-tenant-scope'
import { emptyPosCategoryTabOrder, sanitizePosCategoryTabOrder, type PosCategoryTabOrder } from '@/lib/pos-category-tab-order'

export async function readPosCategoryTabOrder(scope: PosCatalogTenantScope): Promise<PosCategoryTabOrder> {
  try {
    const settingsKey = posMenuCategoriesSettingsKey(scope)
    const rows = (await supabaseSelectFilter(
      'system_settings',
      `key=eq.${encodeURIComponent(settingsKey)}`,
      { limit: 1 }
    )) as { value_json?: { tabOrder?: unknown } }[] | null
    return sanitizePosCategoryTabOrder(rows?.[0]?.value_json?.tabOrder)
  } catch (e) {
    console.error('readPosCategoryTabOrder:', e)
    return emptyPosCategoryTabOrder()
  }
}
