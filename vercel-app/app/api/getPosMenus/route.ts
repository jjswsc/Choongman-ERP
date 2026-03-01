import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

const POS_MENUS_SELECT_BASE = 'id,code,name,category,price,price_delivery,image,vat_included,is_active,sort_order,sold_out_date'
const POS_MENUS_SELECT = POS_MENUS_SELECT_BASE.replace(',category,', ',category,category_main,')
const POS_MENUS_SELECT_WITH_GROUPS = POS_MENUS_SELECT + ',option_selection_groups'
const POS_MENUS_SELECT_WITH_ALL = POS_MENUS_SELECT_WITH_GROUPS + ',kitchen_printer,cooking_time_min,is_banban'

/** POS 메뉴 목록 조회 (category_main, option_selection_groups 등 컬럼 없으면 폴백) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    let rows: unknown[] | null = null
    for (const cols of [POS_MENUS_SELECT_WITH_ALL, POS_MENUS_SELECT_WITH_GROUPS, POS_MENUS_SELECT, POS_MENUS_SELECT_BASE]) {
      try {
        rows = (await supabaseSelect('pos_menus', {
          order: 'sort_order.asc,name.asc',
          limit: 1000,
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
      kitchen_printer?: number | null
      cooking_time_min?: number | null
      is_banban?: boolean
    }[]

    const list = (typedRows || []).map((row) => {
      const v = row.option_selection_groups
      let optionSelectionGroups: string[] = []
      if (Array.isArray(v)) optionSelectionGroups = v
      else if (v && typeof v === 'string') try { optionSelectionGroups = JSON.parse(v) as string[] } catch { /* ignore */ }
      const kp = row.kitchen_printer
      const ctm = row.cooking_time_min
      const isBanban = (row as { is_banban?: boolean }).is_banban === true
      return {
        id: String(row.id ?? ''),
        code: String(row.code ?? ''),
        name: String(row.name ?? ''),
        category: String(row.category ?? ''),
        categoryMain: String((row as { category_main?: string }).category_main ?? ''),
        price: Number(row.price) ?? 0,
        priceDelivery: row.price_delivery != null ? Number(row.price_delivery) : null,
        imageUrl: String(row.image ?? ''),
        vatIncluded: !!row.vat_included,
        isActive: row.is_active !== false,
        sortOrder: Number(row.sort_order) ?? 0,
        soldOutDate: row.sold_out_date ? String(row.sold_out_date).slice(0, 10) : null,
        optionSelectionGroups,
        kitchenPrinter: kp === 1 || kp === 2 ? kp : null,
        cookingTimeMin: ctm != null && Number.isFinite(ctm) && ctm >= 0 ? ctm : null,
        isBanban,
      }
    })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosMenus:', e)
    return NextResponse.json([], { headers })
  }
}
