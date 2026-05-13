import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
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
  syncOptionSelectionConfigToGroupKeys,
} from '@/lib/pos-option-selection-groups'

const POS_MENUS_SELECT_BASE = 'id,code,name,category,price,price_delivery,image,vat_included,is_active,sort_order,sold_out_date'
const POS_MENUS_SELECT = POS_MENUS_SELECT_BASE.replace(',category,', ',category,category_main,')
const POS_MENUS_SELECT_WITH_GROUPS = POS_MENUS_SELECT + ',option_selection_groups'
const POS_MENUS_SELECT_WITH_GROUPS_AND_CONFIG = POS_MENUS_SELECT_WITH_GROUPS + ',option_selection_config'
const POS_MENUS_SELECT_WITH_ALL =
  POS_MENUS_SELECT_WITH_GROUPS_AND_CONFIG +
  ',kitchen_printer,cooking_time_min,is_banban,description_default,description_delivery,description_table'
const POS_MENUS_SELECT_WITH_ALL_PROMO = POS_MENUS_SELECT_WITH_ALL + ',promo_id'

/** POS 메뉴 목록 조회 (category_main, option_selection_groups 등 컬럼 없으면 폴백) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
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
    }[]

    const list = (typedRows || []).map((row) => {
      const v = row.option_selection_groups
      let optionSelectionGroups: string[] = []
      if (Array.isArray(v)) optionSelectionGroups = v
      else if (v && typeof v === 'string') try { optionSelectionGroups = JSON.parse(v) as string[] } catch { /* ignore */ }
      const c = row.option_selection_config
      let optionSelectionConfig: { key: string; label?: string; required?: boolean; minSelect?: number; maxSelect?: number }[] = []
      if (Array.isArray(c)) {
        optionSelectionConfig = c
          .map((cfg) => {
            if (!cfg || typeof cfg !== 'object') return null
            const o = cfg as Record<string, unknown>
            const key = String(o.key ?? '').trim()
            if (!key) return null
            const label = String(o.label ?? '').trim()
            const minRaw = Number(o.minSelect)
            const maxRaw = Number(o.maxSelect)
            const required = o.required === true
            const minSelect = Number.isFinite(minRaw) ? Math.max(0, Math.floor(minRaw)) : (required ? 1 : 0)
            const maxSelect = Number.isFinite(maxRaw) ? Math.max(1, Math.floor(maxRaw)) : 1
            return { key, label: label || key, required, minSelect: Math.min(minSelect, maxSelect), maxSelect }
          })
          .filter((x): x is { key: string; label: string; required: boolean; minSelect: number; maxSelect: number } => !!x)
      } else if (c && typeof c === 'string') {
        try {
          const arr = JSON.parse(c) as unknown
          if (Array.isArray(arr)) {
            optionSelectionConfig = arr
              .map((cfg) => {
                if (!cfg || typeof cfg !== 'object') return null
                const o = cfg as Record<string, unknown>
                const key = String(o.key ?? '').trim()
                if (!key) return null
                const label = String(o.label ?? '').trim()
                const minRaw = Number(o.minSelect)
                const maxRaw = Number(o.maxSelect)
                const required = o.required === true
                const minSelect = Number.isFinite(minRaw) ? Math.max(0, Math.floor(minRaw)) : (required ? 1 : 0)
                const maxSelect = Number.isFinite(maxRaw) ? Math.max(1, Math.floor(maxRaw)) : 1
                return { key, label: label || key, required, minSelect: Math.min(minSelect, maxSelect), maxSelect }
              })
              .filter((x): x is { key: string; label: string; required: boolean; minSelect: number; maxSelect: number } => !!x)
          }
        } catch {
          /* ignore */
        }
      }
      const menuLinks = linksByMenuId.get(Number(row.id || 0)) || []
      if (menuLinks.length > 0 && groupsById.size > 0) {
        const resolved = buildSelectionConfigFromLinks(menuLinks, groupsById)
        if (resolved.optionSelectionGroups.length > 0) {
          let mergedGroups = resolved.optionSelectionGroups
          let mergedConfig = resolved.optionSelectionConfig
          /** 치킨: DB 컬럼에 size가 없는데 링크된 공통 그룹에 size 키가 있으면 컬럼 의도를 존중해 size 제거 (size 단계 폐기 후 링크만으로 부활하는 현상 방지) */
          if (
            isChickenMenuCode(row.code) &&
            optionSelectionGroups.length > 0 &&
            !optionSelectionGroups.includes('size') &&
            mergedGroups.includes('size')
          ) {
            mergedGroups = normalizeChickenOptionSelectionGroups(mergedGroups.filter((k) => k !== 'size'))
            mergedConfig = syncOptionSelectionConfigToGroupKeys(mergedGroups, mergedConfig)
          }
          optionSelectionGroups = mergedGroups
          optionSelectionConfig = mergedConfig
        }
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
        promoId: pid != null && Number(pid) > 0 ? String(pid) : null,
        descriptionDefault: String(row.description_default ?? ''),
        descriptionDelivery:
          row.description_delivery == null ? null : String(row.description_delivery),
        descriptionTable:
          row.description_table == null ? null : String(row.description_table),
      }
    })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosMenus:', e)
    return NextResponse.json([], { headers })
  }
}
