import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseUpsert, supabaseUpdateByFilter } from '@/lib/supabase-server'
import {
  POS_MAIN_CATEGORIES,
  POS_CATEGORIES_BY_MAIN,
  mergePromotionIntoCategoriesConfig,
} from '@/lib/pos-menu-categories'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  appendPosCatalogTenantFilter,
  assertPosCatalogTenantWritable,
  isPosCatalogTenantQueryBlocked,
  posMenuCategoriesSettingsKey,
  resolvePosCatalogTenantScope,
  type PosCatalogTenantScope,
} from '@/lib/pos-catalog-tenant-scope'

export interface PosMenuCategoriesConfig {
  mainCategories: string[]
  categoriesByMain: Record<string, string[]>
}

const defaultConfig: PosMenuCategoriesConfig = {
  mainCategories: [...POS_MAIN_CATEGORIES],
  categoriesByMain: Object.fromEntries(
    Object.entries(POS_CATEGORIES_BY_MAIN).map(([k, v]) => [k, [...v]])
  ),
}

/** oldConfig → newConfig 기준으로 pos_menus의 category_main·category 매핑 후 업데이트 */
async function applyCategoryChangesToMenus(
  oldConfig: PosMenuCategoriesConfig,
  newConfig: PosMenuCategoriesConfig,
  catalogScope: PosCatalogTenantScope
): Promise<{ updated: number }> {
  const mainMap = new Map<string, string>()
  const fallbackMain = newConfig.mainCategories[0] ?? ''
  for (let i = 0; i < Math.max(oldConfig.mainCategories.length, newConfig.mainCategories.length); i++) {
    const oldMain = oldConfig.mainCategories[i]
    const newMain = newConfig.mainCategories[i]
    if (oldMain) {
      if (newMain && oldMain !== newMain) {
        mainMap.set(oldMain, newMain)
      } else if (!newMain && fallbackMain) {
        mainMap.set(oldMain, fallbackMain)
      }
    }
  }
  const subMapByMain = new Map<string, Map<string, string>>()
  for (let i = 0; i < oldConfig.mainCategories.length; i++) {
    const oldMain = oldConfig.mainCategories[i]
    const newMain = mainMap.get(oldMain) ?? newConfig.mainCategories[i] ?? newConfig.mainCategories[0]
    const oldSubs = oldConfig.categoriesByMain[oldMain] || []
    const newSubs = (newMain ? newConfig.categoriesByMain[newMain] : []) || []
    const fallbackSub = newSubs[0] ?? ''
    const subMap = new Map<string, string>()
    for (let j = 0; j < Math.max(oldSubs.length, newSubs.length); j++) {
      const oldSub = oldSubs[j]
      const newSub = newSubs[j]
      if (oldSub) {
        if (newSub && oldSub !== newSub) {
          subMap.set(oldSub, newSub)
        } else if (!newSub && fallbackSub) {
          subMap.set(oldSub, fallbackSub)
        }
      }
    }
    if (subMap.size > 0) subMapByMain.set(oldMain, subMap)
  }

  const tenantFilter = appendPosCatalogTenantFilter('', catalogScope)
  const rows = (
    tenantFilter
      ? await supabaseSelectFilter('pos_menus', tenantFilter, {
          select: 'id,category_main,category',
          limit: 10000,
        })
      : await supabaseSelect('pos_menus', {
          select: 'id,category_main,category',
          limit: 10000,
        })
  ) as { id: string; category_main?: string; category?: string }[]

  let updated = 0
  for (const row of rows || []) {
    const oldMain = String(row.category_main ?? '').trim()
    const oldSub = String(row.category ?? '').trim()
    let newMain = oldMain
    let newSub = oldSub
    if (oldMain && mainMap.has(oldMain)) {
      newMain = mainMap.get(oldMain)!
    }
    const subMap = subMapByMain.get(oldMain)
    if (oldSub && subMap?.has(oldSub)) {
      newSub = subMap.get(oldSub)!
    }
    if (newMain !== oldMain || newSub !== oldSub) {
      await supabaseUpdateByFilter(
        'pos_menus',
        `id=eq.${encodeURIComponent(row.id)}`,
        { category_main: newMain || null, category: newSub || null }
      )
      updated++
    }
  }
  const remapCollabScopes = async () => {
    const rows = (await supabaseSelect('marketing_campaigns', {
      select: 'id,collab_detail',
      limit: 10000,
    })) as { id?: number | string; collab_detail?: Record<string, unknown> | null }[] | null

    for (const row of rows || []) {
      const id = String(row.id ?? '').trim()
      const detail = row.collab_detail
      if (!id || !detail || typeof detail !== 'object' || Array.isArray(detail)) continue

      const mapMain = (main: string) => mainMap.get(main) ?? main
      const mapCategoryKey = (key: string) => {
        const raw = String(key ?? '').trim()
        const sep = raw.indexOf('::')
        if (sep < 0) return raw
        const oldMain = raw.slice(0, sep)
        const oldSub = raw.slice(sep + 2)
        const nextMain = mapMain(oldMain)
        const nextSub = subMapByMain.get(oldMain)?.get(oldSub) ?? oldSub
        return `${nextMain}::${nextSub}`
      }
      const uniqueStrings = (value: unknown, mapper: (s: string) => string) =>
        Array.from(
          new Set(
            (Array.isArray(value) ? value : [])
              .map((x) => mapper(String(x ?? '').trim()))
              .filter(Boolean)
          )
        )

      const nextDetail = {
        ...detail,
        scopeMainCategories: uniqueStrings(detail.scopeMainCategories, mapMain),
        scopeCategoryKeys: uniqueStrings(detail.scopeCategoryKeys, mapCategoryKey),
      }
      const changed =
        JSON.stringify(nextDetail.scopeMainCategories) !== JSON.stringify(detail.scopeMainCategories ?? []) ||
        JSON.stringify(nextDetail.scopeCategoryKeys) !== JSON.stringify(detail.scopeCategoryKeys ?? [])
      if (changed) {
        await supabaseUpdateByFilter(
          'marketing_campaigns',
          `id=eq.${encodeURIComponent(id)}`,
          { collab_detail: nextDetail }
        )
      }
    }
  }

  await remapCollabScopes()
  return { updated }
}

/** GET: POS 메뉴 대분류·소분류 설정 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const catalogScope = await resolvePosCatalogTenantScope({ auth })
    if (isPosCatalogTenantQueryBlocked(catalogScope)) {
      return NextResponse.json(defaultConfig, { headers })
    }
    const settingsKey = posMenuCategoriesSettingsKey(catalogScope)
    const rows = (await supabaseSelectFilter(
      'system_settings',
      `key=eq.${encodeURIComponent(settingsKey)}`,
      { limit: 1 }
    )) as { key?: string; value_json?: PosMenuCategoriesConfig }[] | null

    const raw = rows?.[0]?.value_json
    if (raw && typeof raw === 'object' && Array.isArray(raw.mainCategories) && typeof raw.categoriesByMain === 'object') {
      const merged = mergePromotionIntoCategoriesConfig({
        mainCategories: raw.mainCategories,
        categoriesByMain: raw.categoriesByMain,
      })
      return NextResponse.json(merged, { headers })
    }
    return NextResponse.json(defaultConfig, { headers })
  } catch (e) {
    console.error('getPosMenuCategories:', e)
    return NextResponse.json(defaultConfig, { headers })
  }
}

/** POST: POS 메뉴 대분류·소분류 설정 저장 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const catalogScope = await resolvePosCatalogTenantScope({ auth })
    const writeBlock = assertPosCatalogTenantWritable(catalogScope)
    if (writeBlock) {
      return NextResponse.json({ success: false, message: writeBlock }, { status: 403, headers })
    }
    const settingsKey = posMenuCategoriesSettingsKey(catalogScope)

    const body = (await request.json()) as {
      mainCategories?: string[]
      categoriesByMain?: Record<string, string[]>
      applyToMenus?: boolean
    }

    const mainCategories = Array.isArray(body.mainCategories)
      ? body.mainCategories.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
      : defaultConfig.mainCategories

    const categoriesByMain =
      body.categoriesByMain && typeof body.categoriesByMain === 'object'
        ? Object.fromEntries(
            Object.entries(body.categoriesByMain)
              .filter(([k, v]) => typeof k === 'string' && Array.isArray(v))
              .map(([k, v]) => [k, v.filter((c): c is string => typeof c === 'string' && c.trim() !== '')])
          )
        : defaultConfig.categoriesByMain

    const newConfig: PosMenuCategoriesConfig = mergePromotionIntoCategoriesConfig({
      mainCategories,
      categoriesByMain,
    })
    let menusUpdated = 0

    if (body.applyToMenus) {
      const oldRows = (await supabaseSelectFilter(
        'system_settings',
        `key=eq.${encodeURIComponent(settingsKey)}`,
        { limit: 1 }
      )) as { key?: string; value_json?: PosMenuCategoriesConfig }[] | null
      const raw = oldRows?.[0]?.value_json
      const oldConfig: PosMenuCategoriesConfig =
        raw && typeof raw === 'object' && Array.isArray(raw.mainCategories) && typeof raw.categoriesByMain === 'object'
          ? { mainCategories: raw.mainCategories, categoriesByMain: raw.categoriesByMain }
          : defaultConfig
      const result = await applyCategoryChangesToMenus(oldConfig, newConfig, catalogScope)
      menusUpdated = result.updated
    }

    await supabaseUpsert(
      'system_settings',
      [
        {
          key: settingsKey,
          value_json: {
            mainCategories: newConfig.mainCategories,
            categoriesByMain: newConfig.categoriesByMain,
          },
          updated_at: new Date().toISOString(),
        },
      ],
      'key'
    )

    return NextResponse.json(
      {
        success: true,
        mainCategories: newConfig.mainCategories,
        categoriesByMain: newConfig.categoriesByMain,
        menusUpdated,
      },
      { headers }
    )
  } catch (e) {
    console.error('savePosMenuCategories:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { status: 500, headers }
    )
  }
}
