import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import { runDuePriceSchedules } from '@/lib/price-schedule'
import { normalizePromotionCategoryMain } from '@/lib/pos-promo-constants'
import {
  type PosOptionGroupRow,
  type PosMenuOptionGroupLinkRow,
  buildSelectionConfigFromLinks,
  loadMenuGroupLinks,
  loadPosOptionGroupsWithItems,
} from '@/lib/pos-option-groups-server'
import {
  isChickenMenuCode,
  normalizeChickenOptionSelectionGroups,
  normalizeOptionGroupsForMenu,
  parseOptionSelectionConfigFromDb,
  syncOptionSelectionConfigToGroupKeys,
} from '@/lib/pos-option-selection-groups'
import { normalizeMenuScopeStoreCodes, shouldMenuBeVisibleForStore } from '@/lib/pos-menu-store-scope'

const POS_MENUS_SELECT_BASE = 'id,code,name,category,price,price_delivery,image,vat_included,is_active,sort_order,sold_out_date'
const POS_MENUS_SELECT = POS_MENUS_SELECT_BASE.replace(',category,', ',category,category_main,')
const POS_MENUS_SELECT_WITH_GROUPS = POS_MENUS_SELECT + ',option_selection_groups'
const POS_MENUS_SELECT_WITH_GROUPS_AND_CONFIG = POS_MENUS_SELECT_WITH_GROUPS + ',option_selection_config'
const POS_MENUS_SELECT_WITH_ALL =
  POS_MENUS_SELECT_WITH_GROUPS_AND_CONFIG +
  ',kitchen_printer,cooking_time_min,is_banban,description_default,description_delivery,description_table,sell_hall,sell_delivery,sell_packaging'
const POS_MENUS_SELECT_WITH_ALL_PROMO = POS_MENUS_SELECT_WITH_ALL + ',promo_id'

/** POS 메뉴 목록 조회 (category_main, option_selection_groups 등 컬럼 없으면 폴백) */
export async function GET(request: Request) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const requestedStoreCode = String(searchParams.get('storeCode') ?? '').trim()
    const menuScopeCompatibilityMode = String(process.env.POS_MENU_SCOPE_COMPATIBILITY_MODE ?? '1') !== '0'
    try {
      await runDuePriceSchedules(new Date())
    } catch (scheduleErr) {
      console.error('getPosMenus runDuePriceSchedules:', scheduleErr)
    }

    let groupsById = new Map<number, PosOptionGroupRow>()
    let linksByMenuId = new Map<number, PosMenuOptionGroupLinkRow[]>()
    try {
      const [{ groups }, links] = await Promise.all([
        loadPosOptionGroupsWithItems(),
        loadMenuGroupLinks(),
      ])
      const nextGroupsById = new Map<number, typeof groups[number]>()
      for (const g of groups || []) {
        const id = Number(g.id || 0)
        if (!id) continue
        nextGroupsById.set(id, g)
      }
      groupsById = nextGroupsById
      const grouped = new Map<number, typeof links>()
      for (const link of links || []) {
        const menuId = Number(link.menu_id || 0)
        if (!menuId) continue
        if (!grouped.has(menuId)) grouped.set(menuId, [])
        grouped.get(menuId)!.push(link)
      }
      linksByMenuId = grouped
    } catch {
      // 신규 테이블 미배포 환경 fallback
    }

    const banbanFlavorMenuIdsByMenuId = new Map<number, string[]>()
    let banbanFlavorSchemaReady = false
    try {
      const rows = (await supabaseSelect('pos_banban_flavor_links', {
        limit: 100000,
        select: 'banban_menu_id,flavor_menu_id,enabled,sort_order',
      })) as {
        banban_menu_id?: number | null
        flavor_menu_id?: number | null
        enabled?: boolean | null
        sort_order?: number | null
      }[] | null
      const sorted = (rows || [])
        .filter((row) => row.enabled !== false)
        .sort((a, b) => {
          const aMenuId = Number(a.banban_menu_id || 0)
          const bMenuId = Number(b.banban_menu_id || 0)
          if (aMenuId !== bMenuId) return aMenuId - bMenuId
          const aSort = Number(a.sort_order || 0)
          const bSort = Number(b.sort_order || 0)
          if (aSort !== bSort) return aSort - bSort
          return Number(a.flavor_menu_id || 0) - Number(b.flavor_menu_id || 0)
        })
      for (const row of sorted) {
        const menuId = Number(row.banban_menu_id || 0)
        const flavorMenuId = String(row.flavor_menu_id || '').trim()
        if (!menuId || !flavorMenuId) continue
        const list = banbanFlavorMenuIdsByMenuId.get(menuId) || []
        if (!list.includes(flavorMenuId)) list.push(flavorMenuId)
        banbanFlavorMenuIdsByMenuId.set(menuId, list)
      }
      banbanFlavorSchemaReady = true
    } catch {
      // 신규 테이블 미배포 환경 fallback
    }

    let rows: unknown[] | null = null
    for (const cols of [
      POS_MENUS_SELECT_WITH_ALL_PROMO,
      POS_MENUS_SELECT_WITH_ALL,
      POS_MENUS_SELECT_WITH_GROUPS_AND_CONFIG,
      POS_MENUS_SELECT_WITH_GROUPS,
      POS_MENUS_SELECT,
      POS_MENUS_SELECT_BASE,
    ]) {
      try {
        rows = (await supabaseSelect('pos_menus', {
          order: 'sort_order.asc,name.asc',
          limit: 10000,
          select: cols,
        })) as unknown[] | null
        break
      } catch (colErr: unknown) {
        if (cols === POS_MENUS_SELECT_BASE) throw colErr
      }
    }

    const typedRows = rows as {
      id?: number
      code?: string
      name?: string
      category?: string
      category_main?: string
      price?: number
      price_delivery?: number | null
      image?: string
      vat_included?: boolean
      is_active?: boolean
      sort_order?: number
      sold_out_date?: string | null
      option_selection_groups?: unknown
      option_selection_config?: unknown
      kitchen_printer?: number | null
      cooking_time_min?: number | null
      is_banban?: boolean
      promo_id?: number | null
      description_default?: string
      description_delivery?: string | null
      description_table?: string | null
      sell_hall?: boolean
      sell_delivery?: boolean
      sell_packaging?: boolean
    }[]

    const storeCodesByMenuId = new Map<number, string[]>()
    let scopeSchemaReady = true
    try {
      const scopeRows = (await supabaseSelect('pos_menu_store_scopes', {
        limit: 100000,
        select: 'menu_id,store_code,enabled',
      })) as { menu_id?: number | null; store_code?: string | null; enabled?: boolean | null }[]
      for (const row of scopeRows || []) {
        if (row.enabled === false) continue
        const menuId = Number(row.menu_id || 0)
        const storeCode = String(row.store_code || '').trim()
        if (!menuId || !storeCode) continue
        const list = storeCodesByMenuId.get(menuId) || []
        if (!list.some((x) => x.toLowerCase() === storeCode.toLowerCase())) list.push(storeCode)
        storeCodesByMenuId.set(menuId, list)
      }
    } catch {
      scopeSchemaReady = false
    }

    const list = (typedRows || []).flatMap((row) => {
      const rowMenuId = Number(row.id || 0)
      const scopedStores = normalizeMenuScopeStoreCodes(
        rowMenuId > 0 ? storeCodesByMenuId.get(rowMenuId) || [] : []
      )
      if (
        !shouldMenuBeVisibleForStore({
          requestedStoreCode,
          scopedStores,
          compatibilityMode: menuScopeCompatibilityMode,
          scopeSchemaReady,
        })
      ) {
        return []
      }
      const v = row.option_selection_groups
      let optionSelectionGroups: string[] = []
      if (Array.isArray(v)) optionSelectionGroups = v
      else if (v && typeof v === 'string') try { optionSelectionGroups = JSON.parse(v) as string[] } catch { /* ignore */ }
      let optionSelectionConfig = parseOptionSelectionConfigFromDb(row.option_selection_config)
      const menuLinks = linksByMenuId.get(Number(row.id || 0)) || []
      const columnGroups =
        optionSelectionGroups.length > 0
          ? normalizeOptionGroupsForMenu(optionSelectionGroups, row.code)
          : []
      if (menuLinks.length > 0 && groupsById.size > 0) {
        const resolved = buildSelectionConfigFromLinks(menuLinks, groupsById)
        if (resolved.optionSelectionGroups.length > 0) {
          let mergedGroups = resolved.optionSelectionGroups
          let mergedConfig = resolved.optionSelectionConfig
          if (columnGroups.length > 0) {
            const unionKeys = [...mergedGroups]
            for (const k of columnGroups) {
              if (!unionKeys.includes(k)) unionKeys.push(k)
            }
            mergedGroups = normalizeOptionGroupsForMenu(unionKeys, row.code)
            mergedConfig = syncOptionSelectionConfigToGroupKeys(mergedGroups, [
              ...mergedConfig,
              ...optionSelectionConfig,
            ])
          }
          /** 치킨: DB 컬럼에 size가 없는데 링크된 공통 그룹에 size 키가 있으면 컬럼 의도를 존중해 size 제거 (size 단계 폐기 후 링크만으로 부활하는 현상 방지) */
          if (
            isChickenMenuCode(row.code) &&
            columnGroups.length > 0 &&
            !columnGroups.includes('size') &&
            mergedGroups.includes('size')
          ) {
            mergedGroups = normalizeChickenOptionSelectionGroups(mergedGroups.filter((k) => k !== 'size'))
            mergedConfig = syncOptionSelectionConfigToGroupKeys(mergedGroups, mergedConfig)
          }
          optionSelectionGroups = mergedGroups
          optionSelectionConfig = mergedConfig
        }
      } else if (columnGroups.length > 0) {
        optionSelectionGroups = columnGroups
      }
      const kp = row.kitchen_printer
      const ctm = row.cooking_time_min
      const isBanban = (row as { is_banban?: boolean }).is_banban === true
      const pid = row.promo_id
      return [{
        id: String(row.id ?? ''),
        code: String(row.code ?? ''),
        name: String(row.name ?? ''),
        category: normalizePromotionCategoryMain(String(row.category ?? '').trim()),
        categoryMain: normalizePromotionCategoryMain((row as { category_main?: string }).category_main),
        price: Number(row.price) ?? 0,
        priceDelivery: row.price_delivery != null ? Number(row.price_delivery) : null,
        imageUrl: String(row.image ?? ''),
        vatIncluded: !!row.vat_included,
        isActive: row.is_active !== false,
        sortOrder: Number(row.sort_order) ?? 0,
        soldOutDate: row.sold_out_date ? String(row.sold_out_date).slice(0, 10) : null,
        optionSelectionGroups,
        optionSelectionConfig,
        kitchenPrinter: kp === 0 || kp === 1 || kp === 2 || kp === 3 ? kp : null,
        cookingTimeMin: ctm != null && Number.isFinite(ctm) && ctm >= 0 ? ctm : null,
        isBanban,
        banbanFlavorMenuIds: (() => {
          if (!banbanFlavorSchemaReady || rowMenuId <= 0) return undefined
          const linked = banbanFlavorMenuIdsByMenuId.get(rowMenuId) || []
          return linked.length > 0 ? linked : undefined
        })(),
        promoId: pid != null && Number(pid) > 0 ? String(pid) : null,
        descriptionDefault: String(row.description_default ?? ''),
        descriptionDelivery:
          row.description_delivery == null ? null : String(row.description_delivery),
        descriptionTable:
          row.description_table == null ? null : String(row.description_table),
        storeCodes: scopedStores,
        sellHall: row.sell_hall !== false,
        sellDelivery: row.sell_delivery !== false,
        sellPackaging: row.sell_packaging !== false,
      }]
    })

    // 매장 코드 표기 차이(레거시 별칭, CM 접두 유무 등)로 필터 결과가 0건이면
    // POS 빈 화면을 막기 위해 1회 전체 목록 폴백을 허용한다.
    if (requestedStoreCode && list.length === 0 && (typedRows || []).length > 0) {
      const fallbackList = (typedRows || []).map((row) => {
        const rowMenuId = Number(row.id || 0)
        const scopedStores = normalizeMenuScopeStoreCodes(
          rowMenuId > 0 ? storeCodesByMenuId.get(rowMenuId) || [] : []
        )
        const v = row.option_selection_groups
        let optionSelectionGroups: string[] = []
        if (Array.isArray(v)) optionSelectionGroups = v
        else if (v && typeof v === 'string') try { optionSelectionGroups = JSON.parse(v) as string[] } catch { /* ignore */ }
        let optionSelectionConfig = parseOptionSelectionConfigFromDb(row.option_selection_config)
        const menuLinks = linksByMenuId.get(Number(row.id || 0)) || []
        const columnGroups =
          optionSelectionGroups.length > 0
            ? normalizeOptionGroupsForMenu(optionSelectionGroups, row.code)
            : []
        if (menuLinks.length > 0 && groupsById.size > 0) {
          const resolved = buildSelectionConfigFromLinks(menuLinks, groupsById)
          if (resolved.optionSelectionGroups.length > 0) {
            let mergedGroups = resolved.optionSelectionGroups
            let mergedConfig = resolved.optionSelectionConfig
            if (columnGroups.length > 0) {
              const unionKeys = [...mergedGroups]
              for (const k of columnGroups) {
                if (!unionKeys.includes(k)) unionKeys.push(k)
              }
              mergedGroups = normalizeOptionGroupsForMenu(unionKeys, row.code)
              mergedConfig = syncOptionSelectionConfigToGroupKeys(mergedGroups, [
                ...mergedConfig,
                ...optionSelectionConfig,
              ])
            }
            if (
              isChickenMenuCode(row.code) &&
              columnGroups.length > 0 &&
              !columnGroups.includes('size') &&
              mergedGroups.includes('size')
            ) {
              mergedGroups = normalizeChickenOptionSelectionGroups(mergedGroups.filter((k) => k !== 'size'))
              mergedConfig = syncOptionSelectionConfigToGroupKeys(mergedGroups, mergedConfig)
            }
            optionSelectionGroups = mergedGroups
            optionSelectionConfig = mergedConfig
          }
        } else if (columnGroups.length > 0) {
          optionSelectionGroups = columnGroups
        }
        const kp = row.kitchen_printer
        const ctm = row.cooking_time_min
        const isBanban = (row as { is_banban?: boolean }).is_banban === true
        const pid = row.promo_id
        return {
          id: String(row.id ?? ''),
          code: String(row.code ?? ''),
          name: String(row.name ?? ''),
          category: normalizePromotionCategoryMain(String(row.category ?? '').trim()),
          categoryMain: normalizePromotionCategoryMain((row as { category_main?: string }).category_main),
          price: Number(row.price) ?? 0,
          priceDelivery: row.price_delivery != null ? Number(row.price_delivery) : null,
          imageUrl: String(row.image ?? ''),
          vatIncluded: !!row.vat_included,
          isActive: row.is_active !== false,
          sortOrder: Number(row.sort_order) ?? 0,
          soldOutDate: row.sold_out_date ? String(row.sold_out_date).slice(0, 10) : null,
          optionSelectionGroups,
          optionSelectionConfig,
          kitchenPrinter: kp === 0 || kp === 1 || kp === 2 || kp === 3 ? kp : null,
          cookingTimeMin: ctm != null && Number.isFinite(ctm) && ctm >= 0 ? ctm : null,
          isBanban,
          banbanFlavorMenuIds: (() => {
            if (!banbanFlavorSchemaReady || rowMenuId <= 0) return undefined
            const linked = banbanFlavorMenuIdsByMenuId.get(rowMenuId) || []
            return linked.length > 0 ? linked : undefined
          })(),
          promoId: pid != null && Number(pid) > 0 ? String(pid) : null,
          descriptionDefault: String(row.description_default ?? ''),
          descriptionDelivery:
            row.description_delivery == null ? null : String(row.description_delivery),
          descriptionTable:
            row.description_table == null ? null : String(row.description_table),
          storeCodes: scopedStores,
          sellHall: row.sell_hall !== false,
          sellDelivery: row.sell_delivery !== false,
          sellPackaging: row.sell_packaging !== false,
        }
      })
      console.warn('getPosMenus scope fallback to all menus', {
        requestedStoreCode,
        rowCount: (typedRows || []).length,
      })
      return NextResponse.json(fallbackList, { headers })
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosMenus:', e)
    return NextResponse.json([], { headers })
  }
}
