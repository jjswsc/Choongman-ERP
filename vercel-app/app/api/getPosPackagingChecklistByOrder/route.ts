import { NextRequest, NextResponse } from 'next/server'
import { canonicalEnglishChickenMenuLine } from '@/lib/pos-print-translate'
import { supabaseSelectFilter } from '@/lib/supabase-server'

type PosOrderRow = {
  id?: number
  order_type?: string
  items_json?: string
}

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

type NameRow = { id?: number; name?: string }

type ParsedOrderItem = {
  orderItemId: string
  rawName: string
  menuId: number | null
  optionId: number | null
}

function normalizeOrderType(raw: unknown): 'takeout' | 'delivery' | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'takeout' || s === 'delivery') return s
  return null
}

function parseItemsJson(raw: string): ParsedOrderItem[] {
  let arr: unknown[] = []
  try {
    const parsed = JSON.parse(raw || '[]')
    arr = Array.isArray(parsed) ? parsed : []
  } catch {
    arr = []
  }
  return arr.map((row, idx) => {
    const it = (row && typeof row === 'object') ? (row as Record<string, unknown>) : {}
    const menuIdRaw = String(it.menuId1 ?? it.menu_id1 ?? it.menuId2 ?? it.menu_id2 ?? '').trim()
    const optionIdRaw = String(it.optionId1 ?? it.option_id1 ?? it.optionId2 ?? it.option_id2 ?? '').trim()
    const menuId = menuIdRaw && /^\d+$/.test(menuIdRaw) ? Number(menuIdRaw) : null
    const optionId = optionIdRaw && /^\d+$/.test(optionIdRaw) ? Number(optionIdRaw) : null
    return {
      orderItemId: String(it.id ?? `line-${idx + 1}`),
      rawName: String(it.name ?? '').trim(),
      menuId,
      optionId,
    }
  })
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(req.url)
    const orderId = Number(searchParams.get('orderId') ?? 0)
    if (!orderId || Number.isNaN(orderId)) {
      return NextResponse.json(
        { success: false, message: 'orderId_required', hasChecklist: false, groups: [], unresolvedMappings: [] },
        { status: 400, headers }
      )
    }

    const orderRows = (await supabaseSelectFilter(
      'pos_orders',
      `id=eq.${orderId}`,
      { limit: 1, select: 'id,order_type,items_json' }
    )) as PosOrderRow[] | null
    if (!orderRows?.length) {
      return NextResponse.json(
        { success: false, message: 'order_not_found', hasChecklist: false, groups: [], unresolvedMappings: [] },
        { status: 404, headers }
      )
    }

    const order = orderRows[0]
    const orderType = normalizeOrderType(order.order_type)
    if (!orderType) {
      return NextResponse.json(
        { success: true, hasChecklist: false, groups: [], unresolvedMappings: [], orderType: null },
        { headers }
      )
    }

    const parsedItems = parseItemsJson(String(order.items_json ?? '[]'))
    const unresolvedMappings = parsedItems
      .filter((it) => !it.menuId)
      .map((it) => ({ orderItemId: it.orderItemId, itemName: it.rawName }))
    const mappedItems = parsedItems.filter((it) => Boolean(it.menuId))
    if (mappedItems.length === 0) {
      return NextResponse.json(
        { success: true, hasChecklist: false, groups: [], unresolvedMappings, orderType },
        { headers }
      )
    }

    const menuIds = Array.from(new Set(mappedItems.map((it) => Number(it.menuId)).filter((n) => Number.isFinite(n) && n > 0)))
    const optionIds = Array.from(new Set(mappedItems.map((it) => Number(it.optionId)).filter((n) => Number.isFinite(n) && n > 0)))
    if (menuIds.length === 0) {
      return NextResponse.json(
        { success: true, hasChecklist: false, groups: [], unresolvedMappings, orderType },
        { headers }
      )
    }

    const rows = (await supabaseSelectFilter(
      'pos_menu_packaging_check_items',
      `menu_id=in.(${menuIds.join(',')})&is_active=eq.true`,
      {
        limit: 3000,
        order: 'sort_order.asc,id.asc',
        select: 'id,menu_id,option_id,order_type,item_name,is_required,sort_order,is_active',
      }
    )) as ChecklistRow[] | null

    const menuNameRows = (await supabaseSelectFilter(
      'pos_menus',
      `id=in.(${menuIds.join(',')})`,
      { limit: 1000, select: 'id,name' }
    )) as NameRow[] | null
    const optionNameRows = optionIds.length > 0
      ? (await supabaseSelectFilter(
        'pos_menu_options',
        `id=in.(${optionIds.join(',')})`,
        { limit: 1000, select: 'id,name' }
      )) as NameRow[] | null
      : []

    const menuNameMap = new Map<number, string>()
    for (const row of menuNameRows || []) {
      const id = Number(row.id ?? 0)
      if (id > 0) menuNameMap.set(id, String(row.name ?? '').trim())
    }
    const optionNameMap = new Map<number, string>()
    for (const row of optionNameRows || []) {
      const id = Number(row.id ?? 0)
      if (id > 0) optionNameMap.set(id, String(row.name ?? '').trim())
    }

    const activeRows = (rows || []).filter((r) => {
      const rowType = String(r.order_type ?? 'both').trim().toLowerCase()
      if (rowType === 'both') return true
      return rowType === orderType
    })
    const byMenuId = new Map<number, ChecklistRow[]>()
    for (const row of activeRows) {
      const menuId = Number(row.menu_id ?? 0)
      if (!menuId) continue
      const list = byMenuId.get(menuId) || []
      list.push(row)
      byMenuId.set(menuId, list)
    }

    const groups = mappedItems.map((it) => {
      const menuId = Number(it.menuId ?? 0)
      const optionId = Number(it.optionId ?? 0) || null
      const menuRows = byMenuId.get(menuId) || []
      const candidates = menuRows
        .filter((row) => {
          const rowOptionId = row.option_id != null ? Number(row.option_id) : null
          if (rowOptionId == null) return true
          return optionId != null && rowOptionId === optionId
        })
        .sort((a, b) => {
          const aExact = a.option_id != null && optionId != null && Number(a.option_id) === optionId ? 1 : 0
          const bExact = b.option_id != null && optionId != null && Number(b.option_id) === optionId ? 1 : 0
          if (aExact !== bExact) return bExact - aExact
          const so = (Number(a.sort_order ?? 0) || 0) - (Number(b.sort_order ?? 0) || 0)
          if (so !== 0) return so
          return (Number(a.id ?? 0) || 0) - (Number(b.id ?? 0) || 0)
        })

      const dedup = new Map<string, ChecklistRow>()
      for (const row of candidates) {
        const key = String(row.item_name ?? '').trim().toLowerCase()
        if (!key || dedup.has(key)) continue
        dedup.set(key, row)
      }
      const checks = Array.from(dedup.values()).map((row) => ({
        id: String(row.id ?? ''),
        itemName: String(row.item_name ?? '').trim(),
        isRequired: row.is_required !== false,
        sortOrder: Number(row.sort_order ?? 0) || 0,
        optionId: row.option_id != null ? String(row.option_id) : null,
      }))
      const menuName = canonicalEnglishChickenMenuLine(menuNameMap.get(menuId) || '')
      const optionNameRaw = optionId != null ? (optionNameMap.get(optionId) || '') : ''
      const optionName = optionNameRaw ? canonicalEnglishChickenMenuLine(optionNameRaw) : ''
      const itemNameRaw = it.rawName || menuNameMap.get(menuId) || `#${it.orderItemId}`
      const itemName = canonicalEnglishChickenMenuLine(String(itemNameRaw))
      return {
        orderItemId: it.orderItemId,
        itemName,
        menuId: String(menuId),
        menuName,
        optionId: optionId != null ? String(optionId) : null,
        optionName: optionName.trim() ? optionName.trim() : null,
        checks,
      }
    }).filter((g) => g.checks.length > 0)

    return NextResponse.json(
      {
        success: true,
        orderType,
        hasChecklist: groups.length > 0,
        groups,
        unresolvedMappings,
      },
      { headers }
    )
  } catch (e) {
    const msg = String(e ?? '')
    if (/pos_menu_packaging_check_items|relation .* does not exist|42P01/i.test(msg)) {
      return NextResponse.json(
        { success: true, schemaReady: false, hasChecklist: false, groups: [], unresolvedMappings: [] },
        { headers }
      )
    }
    return NextResponse.json(
      { success: false, message: msg.slice(0, 300), hasChecklist: false, groups: [], unresolvedMappings: [] },
      { status: 500, headers }
    )
  }
}
