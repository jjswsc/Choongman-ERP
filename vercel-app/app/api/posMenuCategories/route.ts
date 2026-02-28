import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseUpsert, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { POS_MAIN_CATEGORIES, POS_CATEGORIES_BY_MAIN } from '@/lib/pos-menu-categories'

const SETTINGS_KEY = 'pos_menu_categories'

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
  newConfig: PosMenuCategoriesConfig
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

  const rows = (await supabaseSelect('pos_menus', {
    select: 'id,category_main,category',
    limit: 10000,
  })) as { id: string; category_main?: string; category?: string }[]

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
  return { updated }
}

/** GET: POS 메뉴 대분류·소분류 설정 조회 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelectFilter(
      'system_settings',
      `key=eq.${encodeURIComponent(SETTINGS_KEY)}`,
      { limit: 1 }
    )) as { key?: string; value_json?: PosMenuCategoriesConfig }[] | null

    const raw = rows?.[0]?.value_json
    if (raw && typeof raw === 'object' && Array.isArray(raw.mainCategories) && typeof raw.categoriesByMain === 'object') {
      return NextResponse.json(
        {
          mainCategories: raw.mainCategories,
          categoriesByMain: raw.categoriesByMain,
        },
        { headers }
      )
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

    const newConfig: PosMenuCategoriesConfig = { mainCategories, categoriesByMain }
    let menusUpdated = 0

    if (body.applyToMenus) {
      const oldRows = (await supabaseSelectFilter(
        'system_settings',
        `key=eq.${encodeURIComponent(SETTINGS_KEY)}`,
        { limit: 1 }
      )) as { key?: string; value_json?: PosMenuCategoriesConfig }[] | null
      const raw = oldRows?.[0]?.value_json
      const oldConfig: PosMenuCategoriesConfig =
        raw && typeof raw === 'object' && Array.isArray(raw.mainCategories) && typeof raw.categoriesByMain === 'object'
          ? { mainCategories: raw.mainCategories, categoriesByMain: raw.categoriesByMain }
          : defaultConfig
      const result = await applyCategoryChangesToMenus(oldConfig, newConfig)
      menusUpdated = result.updated
    }

    await supabaseUpsert(
      'system_settings',
      [
        {
          key: SETTINGS_KEY,
          value_json: { mainCategories, categoriesByMain },
          updated_at: new Date().toISOString(),
        },
      ],
      'key'
    )

    return NextResponse.json(
      { success: true, mainCategories, categoriesByMain, menusUpdated },
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
