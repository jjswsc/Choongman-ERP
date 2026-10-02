import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import {
  fallbackPosMenuCategoriesConfig,
  mergeImportedMenuCategoriesIntoConfig,
  type ImportedMenuCategoryPair,
  type PosMenuCategoriesConfigShape,
} from '@/lib/pos-menu-categories'
import { ensureCodePrefixesForMains } from '@/lib/pos-menu-next-code'
import {
  posMenuCategoriesSettingsKey,
  type PosCatalogTenantScope,
} from '@/lib/pos-catalog-tenant-scope'
import { sanitizePosCategoryTabOrder } from '@/lib/pos-category-tab-order'

type StoredCategoriesConfig = PosMenuCategoriesConfigShape & { tabOrder?: unknown }

function isStoredConfig(raw: unknown): raw is StoredCategoriesConfig {
  if (!raw || typeof raw !== 'object') return false
  const cfg = raw as StoredCategoriesConfig
  return Array.isArray(cfg.mainCategories) && !!cfg.categoriesByMain && typeof cfg.categoriesByMain === 'object'
}

/**
 * 일괄 업로드에 들어 있는 대분류·소분류를 카테고리 설정에 추가한다.
 * 메뉴 행의 category_main 만으로는 Category Settings 목록에 나오지 않는다.
 */
export async function persistImportedPosMenuCategories(params: {
  catalogScope: PosCatalogTenantScope
  pairs: ImportedMenuCategoryPair[]
}): Promise<void> {
  const pairs = params.pairs.filter((pair) => String(pair.categoryMain ?? '').trim())
  if (pairs.length === 0) return

  const settingsKey = posMenuCategoriesSettingsKey(params.catalogScope)
  const rows = (await supabaseSelectFilter(
    'system_settings',
    `key=eq.${encodeURIComponent(settingsKey)}`,
    { limit: 1 }
  )) as { value_json?: unknown }[] | null
  const raw = rows?.[0]?.value_json
  const stored = isStoredConfig(raw) ? raw : null
  const base: PosMenuCategoriesConfigShape = stored
    ? {
        mainCategories: stored.mainCategories,
        categoriesByMain: stored.categoriesByMain,
        codePrefixByMain:
          stored.codePrefixByMain && typeof stored.codePrefixByMain === 'object'
            ? stored.codePrefixByMain
            : {},
      }
    : fallbackPosMenuCategoriesConfig(params.catalogScope.enforce)

  const merged = mergeImportedMenuCategoriesIntoConfig(base, pairs)
  const { codePrefixByMain } = ensureCodePrefixesForMains(
    merged.mainCategories,
    merged.codePrefixByMain || {}
  )
  const tabOrder = sanitizePosCategoryTabOrder(stored?.tabOrder)

  await supabaseUpsert(
    'system_settings',
    [
      {
        key: settingsKey,
        value_json: {
          ...(stored && typeof stored === 'object' ? stored : {}),
          mainCategories: merged.mainCategories,
          categoriesByMain: merged.categoriesByMain,
          codePrefixByMain,
          tabOrder,
        },
        updated_at: new Date().toISOString(),
      },
    ],
    'key'
  )
}
