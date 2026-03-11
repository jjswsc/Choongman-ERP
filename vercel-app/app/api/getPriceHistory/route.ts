import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export interface PriceHistoryRow {
  id: number
  entity_type: string
  entity_id: string
  entity_display_name: string | null
  field_name: string
  old_value: number | null
  new_value: number | null
  changed_at: string
  changed_by: string | null
}

/** 가격 이력 조회
 * ?entityType=pos_menu|pos_menu_option|item
 * &entityId=... (선택, 특정 엔티티만)
 * &menuId=... (선택, 메뉴별: pos_menu=entity_id, pos_menu_option=parent_entity_id)
 * &categoryMain=... (선택, 대분류 필터: Chicken, Korean 등)
 * &category=... (선택, 소분류/카테고리 필터)
 * &from=YYYY-MM-DD
 * &to=YYYY-MM-DD
 * &search=... (entity_display_name 검색)
 * &limit=200
 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const entityType = searchParams.get('entityType') || ''
    const entityId = searchParams.get('entityId') || ''
    const menuId = searchParams.get('menuId') || ''
    const categoryMain = searchParams.get('categoryMain') || ''
    const category = searchParams.get('category') || ''
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const search = searchParams.get('search') || ''
    const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit')) || 200))

    const conditions: string[] = []
    if (entityType) conditions.push(`entity_type=eq.${encodeURIComponent(entityType)}`)
    if (entityId) conditions.push(`entity_id=eq.${encodeURIComponent(entityId)}`)
    if (menuId) {
      if (entityType === 'pos_menu') conditions.push(`entity_id=eq.${encodeURIComponent(menuId)}`)
      else if (entityType === 'pos_menu_option') conditions.push(`parent_entity_id=eq.${encodeURIComponent(menuId)}`)
    }
    if (categoryMain.trim()) conditions.push(`category_main=eq.${encodeURIComponent(categoryMain.trim())}`)
    if (category.trim()) conditions.push(`category=eq.${encodeURIComponent(category.trim())}`)
    if (from) conditions.push(`changed_at=gte.${encodeURIComponent(from + 'T00:00:00Z')}`)
    if (to) conditions.push(`changed_at=lte.${encodeURIComponent(to + 'T23:59:59.999Z')}`)
    if (search.trim()) {
      const term = encodeURIComponent(`*${search.trim()}*`)
      conditions.push(`entity_display_name=ilike.${term}`)
    }

    const filterFull = conditions.length > 0 ? conditions.join('&') : 'id=gte.0'
    const options: { order?: string; limit?: number } = {
      order: 'changed_at.desc',
      limit,
    }

    const isColumnError = (e: unknown) => {
      const s = String(e)
      return /does not exist|42P01|42703|column|parent_entity_id|category_main/i.test(s)
    }

    let rows: PriceHistoryRow[] = []
    try {
      const result = await supabaseSelectFilter('price_history', filterFull, options)
      rows = Array.isArray(result) ? (result as PriceHistoryRow[]) : []
    } catch (tblErr: unknown) {
      if (String(tblErr).includes('does not exist') || String(tblErr).includes('42P01')) {
        return NextResponse.json([], { headers })
      }
      if (isColumnError(tblErr)) {
        const conditionsBasic: string[] = []
        if (entityType) conditionsBasic.push(`entity_type=eq.${encodeURIComponent(entityType)}`)
        if (entityId) conditionsBasic.push(`entity_id=eq.${encodeURIComponent(entityId)}`)
        if (menuId && entityType === 'pos_menu') conditionsBasic.push(`entity_id=eq.${encodeURIComponent(menuId)}`)
        if (from) conditionsBasic.push(`changed_at=gte.${encodeURIComponent(from + 'T00:00:00Z')}`)
        if (to) conditionsBasic.push(`changed_at=lte.${encodeURIComponent(to + 'T23:59:59.999Z')}`)
        if (search.trim()) {
          const term = encodeURIComponent(`*${search.trim()}*`)
          conditionsBasic.push(`entity_display_name=ilike.${term}`)
        }
        const filterBasic = conditionsBasic.length > 0 ? conditionsBasic.join('&') : 'id=gte.0'
        try {
          const result = await supabaseSelectFilter('price_history', filterBasic, options)
          rows = Array.isArray(result) ? (result as PriceHistoryRow[]) : []
        } catch {
          return NextResponse.json([], { headers })
        }
      } else {
        throw tblErr
      }
    }

    return NextResponse.json(rows, { headers })
  } catch (e) {
    console.error('getPriceHistory:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 실패' },
      { status: 500, headers }
    )
  }
}
