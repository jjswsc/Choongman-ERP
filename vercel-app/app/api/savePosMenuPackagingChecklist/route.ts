import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseInsertMany } from '@/lib/supabase-server'

type RequestItem = {
  id?: string
  optionId?: string | null
  orderType?: 'takeout' | 'delivery' | 'both' | string
  itemName?: string
  isRequired?: boolean
  sortOrder?: number
  isActive?: boolean
}

const ALLOWED_ORDER_TYPES = new Set(['takeout', 'delivery', 'both'])

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as {
      menuId?: string | number
      items?: RequestItem[]
    }
    const menuId = Number(body.menuId ?? 0)
    if (!menuId || Number.isNaN(menuId)) {
      return NextResponse.json({ success: false, message: 'menuId_required' }, { status: 400, headers })
    }
    const src = Array.isArray(body.items) ? body.items : []
    const rows = src
      .map((it, idx) => {
        const itemName = String(it.itemName ?? '').trim()
        if (!itemName) return null
        const orderTypeRaw = String(it.orderType ?? 'both').trim().toLowerCase()
        const orderType = ALLOWED_ORDER_TYPES.has(orderTypeRaw) ? orderTypeRaw : 'both'
        const optionIdNum = it.optionId == null || String(it.optionId).trim() === ''
          ? null
          : Number(it.optionId)
        const optionId = optionIdNum != null && Number.isFinite(optionIdNum) && optionIdNum > 0
          ? optionIdNum
          : null
        return {
          menu_id: menuId,
          option_id: optionId,
          order_type: orderType,
          item_name: itemName.slice(0, 200),
          is_required: it.isRequired !== false,
          sort_order: Number.isFinite(Number(it.sortOrder)) ? Math.max(0, Math.trunc(Number(it.sortOrder))) : idx,
          is_active: it.isActive !== false,
        }
      })
      .filter(Boolean) as Record<string, unknown>[]

    await supabaseDeleteByFilter('pos_menu_packaging_check_items', `menu_id=eq.${menuId}`)
    if (rows.length > 0) {
      await supabaseInsertMany('pos_menu_packaging_check_items', rows)
    }
    return NextResponse.json({ success: true, saved: rows.length }, { headers })
  } catch (e) {
    const msg = String(e ?? '')
    if (/pos_menu_packaging_check_items|relation .* does not exist|42P01/i.test(msg)) {
      return NextResponse.json(
        { success: false, message: 'schema_not_ready_pos_menu_packaging_check_items' },
        { status: 400, headers }
      )
    }
    return NextResponse.json(
      { success: false, message: msg.slice(0, 300) },
      { status: 500, headers }
    )
  }
}
