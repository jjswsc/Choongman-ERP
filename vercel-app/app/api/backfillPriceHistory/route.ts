import { NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseInsert } from '@/lib/supabase-server'

/** 기존 메뉴·품목의 현재 가격을 price_history에 "초기"로 일괄 등록
 * POST로 호출. 이미 이력이 있는 entity는 스킵.
 */
export async function POST() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    let inserted = 0

    const existingHistory = (await supabaseSelectFilter('price_history', 'id=gte.0', { limit: 50000 })) as { entity_type: string; entity_id: string }[] | null
    const hasHistory = new Set((existingHistory || []).map((r) => `${r.entity_type}:${r.entity_id}`))

    const tryInsert = async (row: Record<string, unknown>) => {
      try {
        await supabaseInsert('price_history', row)
        inserted++
      } catch {
        // ignore
      }
    }

    const menus = (await supabaseSelect('pos_menus', { limit: 2000 })) as { id?: number; name?: string; code?: string; price?: number; price_delivery?: number | null; category_main?: string; category?: string }[] | null
    for (const m of menus || []) {
      const eid = String(m.id ?? '')
      const key = `pos_menu:${eid}`
      if (hasHistory.has(key)) continue
      const catMain = (m.category_main || '').trim()
      const cat = (m.category || '').trim()
      const price = Number(m.price) ?? 0
      const priceDelivery = m.price_delivery != null ? Number(m.price_delivery) : null
      await tryInsert({
        entity_type: 'pos_menu',
        entity_id: eid,
        entity_display_name: m.name ?? m.code ?? eid,
        field_name: 'price',
        old_value: null,
        new_value: price,
        category: cat || undefined,
        category_main: catMain || undefined,
      })
      if (priceDelivery != null) {
        await tryInsert({
          entity_type: 'pos_menu',
          entity_id: eid,
          entity_display_name: m.name ?? m.code ?? eid,
          field_name: 'price_delivery',
          old_value: null,
          new_value: priceDelivery,
          category: cat || undefined,
          category_main: catMain || undefined,
        })
      }
    }

    const options = (await supabaseSelect('pos_menu_options', { limit: 5000 })) as { id?: number; menu_id?: number; name?: string; price_modifier?: number; price_modifier_delivery?: number | null; price_modifier_packaging?: number | null }[] | null
    for (const o of options || []) {
      const eid = String(o.id ?? '')
      if (hasHistory.has(`pos_menu_option:${eid}`)) continue
      let menuCatMain = ''
      let menuCat = ''
      if (o.menu_id) {
        try {
          const ms = (await supabaseSelectFilter('pos_menus', `id=eq.${o.menu_id}`, { limit: 1 })) as { category_main?: string; category?: string }[] | null
          if (ms?.[0]) {
            menuCatMain = (ms[0].category_main || '').trim()
            menuCat = (ms[0].category || '').trim()
          }
        } catch { /* ignore */ }
      }
      const mod = Number(o.price_modifier) ?? 0
      const modD = o.price_modifier_delivery != null ? Number(o.price_modifier_delivery) : null
      const modP = o.price_modifier_packaging != null ? Number(o.price_modifier_packaging) : null
      await tryInsert({
        entity_type: 'pos_menu_option',
        entity_id: eid,
        entity_display_name: o.name ?? eid,
        field_name: 'price_modifier',
        old_value: null,
        new_value: mod,
        category: menuCat || undefined,
        category_main: menuCatMain || undefined,
        parent_entity_id: o.menu_id ? String(o.menu_id) : undefined,
      })
      if (modD != null) await tryInsert({ entity_type: 'pos_menu_option', entity_id: eid, entity_display_name: o.name ?? eid, field_name: 'price_modifier_delivery', old_value: null, new_value: modD, category: menuCat || undefined, category_main: menuCatMain || undefined, parent_entity_id: o.menu_id ? String(o.menu_id) : undefined })
      if (modP != null) await tryInsert({ entity_type: 'pos_menu_option', entity_id: eid, entity_display_name: o.name ?? eid, field_name: 'price_modifier_packaging', old_value: null, new_value: modP, category: menuCat || undefined, category_main: menuCatMain || undefined, parent_entity_id: o.menu_id ? String(o.menu_id) : undefined })
    }

    const items = (await supabaseSelect('items', { limit: 5000 })) as { code?: string; name?: string; price?: number; cost?: number; category?: string }[] | null
    for (const i of items || []) {
      const code = String(i.code ?? '')
      if (hasHistory.has(`item:${code}`)) continue
      const price = Number(i.price) ?? 0
      const cost = Number(i.cost) ?? 0
      await tryInsert({
        entity_type: 'item',
        entity_id: code,
        entity_display_name: i.name ?? code,
        field_name: 'price',
        old_value: null,
        new_value: price,
        category: (i.category || '').trim() || undefined,
      })
      await tryInsert({
        entity_type: 'item',
        entity_id: code,
        entity_display_name: i.name ?? code,
        field_name: 'cost',
        old_value: null,
        new_value: cost,
        category: (i.category || '').trim() || undefined,
      })
    }

    return NextResponse.json({ success: true, inserted }, { headers })
  } catch (e) {
    console.error('backfillPriceHistory:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '실패' },
      { status: 500, headers }
    )
  }
}
