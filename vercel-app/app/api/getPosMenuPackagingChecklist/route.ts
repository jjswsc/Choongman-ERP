import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

type ChecklistRow = {
  id?: number
  menu_id?: number
  option_id?: number | null
  order_type?: string
  item_name?: string
  is_required?: boolean
  sort_order?: number
  is_active?: boolean
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(req.url)
    const menuId = Number(searchParams.get('menuId') ?? 0)
    if (!menuId || Number.isNaN(menuId)) {
      return NextResponse.json({ success: false, message: 'menuId_required', items: [] }, { status: 400, headers })
    }
    const rows = (await supabaseSelectFilter(
      'pos_menu_packaging_check_items',
      `menu_id=eq.${menuId}`,
      {
        order: 'sort_order.asc,id.asc',
        limit: 1000,
        select: 'id,menu_id,option_id,order_type,item_name,is_required,sort_order,is_active',
      }
    )) as ChecklistRow[] | null
    const items = (rows || []).map((r) => ({
      id: String(r.id ?? ''),
      menuId: String(r.menu_id ?? ''),
      optionId: r.option_id != null ? String(r.option_id) : null,
      orderType: String(r.order_type ?? 'both'),
      itemName: String(r.item_name ?? ''),
      isRequired: r.is_required !== false,
      sortOrder: Number(r.sort_order ?? 0) || 0,
      isActive: r.is_active !== false,
    }))
    return NextResponse.json({ success: true, items }, { headers })
  } catch (e) {
    const msg = String(e ?? '')
    if (/pos_menu_packaging_check_items|relation .* does not exist|42P01/i.test(msg)) {
      return NextResponse.json({ success: true, schemaReady: false, items: [] }, { headers })
    }
    return NextResponse.json(
      { success: false, message: msg.slice(0, 300), items: [] },
      { status: 500, headers }
    )
  }
}
