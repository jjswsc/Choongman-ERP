/**
 * 가격 이력(price_history)에서 복구
 *
 * 1) targetDate 없음: 가격·원가가 0/비어 있는 경우만, 이력의 이전 값(old_value)으로 복구
 * 2) targetDate=YYYY-MM-DD: 해당 날짜(방콕 기준 종료 시점) 시점 가격으로 메뉴/옵션 가격 일괄 복구
 *
 * - POST. dryRun=1 이면 실제 업데이트 없이 복구 대상만 반환.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

type HistoryRow = {
  entity_type: string
  entity_id: string
  field_name: string
  old_value: number | null
  new_value?: number | null
  changed_at?: string
}

/** 방콕 기준 해당 날짜 23:59:59.999 → UTC ISO 문자열 (DB changed_at 비교용) */
function endOfDayBangkokUtcIso(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return ''
  const endBangkok = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - 7 * 60 * 60 * 1000)
  return endBangkok.toISOString()
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const dryRun = searchParams.get('dryRun') === '1' || searchParams.get('dryRun') === 'true'
    const targetDate = (searchParams.get('targetDate') || '').trim() // YYYY-MM-DD

    // price_history 조회 (entity_type별, new_value 포함해 날짜 시점 계산용)
    let menuHistoryRows: (HistoryRow & { new_value?: number | null })[] = []
    let optionHistoryRows: (HistoryRow & { new_value?: number | null })[] = []
    try {
      const menuHistory = (await supabaseSelectFilter(
        'price_history',
        'entity_type=eq.pos_menu',
        { order: 'changed_at.asc', limit: 50000, select: 'entity_id,field_name,old_value,new_value,changed_at' }
      )) as (HistoryRow & { new_value?: number | null })[] | null
      const optionHistory = (await supabaseSelectFilter(
        'price_history',
        'entity_type=eq.pos_menu_option',
        { order: 'changed_at.asc', limit: 50000, select: 'entity_id,field_name,old_value,new_value,changed_at' }
      )) as (HistoryRow & { new_value?: number | null })[] | null
      menuHistoryRows = menuHistory || []
      optionHistoryRows = optionHistory || []
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/does not exist|42P01/i.test(msg)) {
        return NextResponse.json(
          { success: false, message: 'price_history 테이블이 없습니다. 복구할 이력이 없습니다.', restored: { items: 0, menus: 0, options: 0 } },
          { headers }
        )
      }
      throw e
    }

    const itemRestore: Record<string, { price?: number; cost?: number }> = {}
    const menuRestore: Record<string, { price?: number; price_delivery?: number }> = {}
    const optionRestore: Record<string, { price_modifier?: number; price_modifier_delivery?: number }> = {}

    if (targetDate) {
      // ----- 특정 날짜(3월 18일 등) 시점으로 메뉴/옵션 가격 복구 -----
      const cutoffIso = endOfDayBangkokUtcIso(targetDate)
      if (!cutoffIso) {
        return NextResponse.json(
          { success: false, message: 'targetDate는 YYYY-MM-DD 형식이어야 합니다. (예: targetDate=2025-03-18)', restored: { items: 0, menus: 0, options: 0 } },
          { headers }
        )
      }

      const valueAtDate = (
        rows: (HistoryRow & { new_value?: number | null })[],
        entityId: string,
        fieldName: string
      ): number | null => {
        const same = rows.filter((r) => r.entity_id === entityId && r.field_name === fieldName)
        const onOrBefore = same.filter((r) => (r.changed_at || '') <= cutoffIso)
        const after = same.filter((r) => (r.changed_at || '') > cutoffIso)
        const lastOnOrBefore = onOrBefore.length ? onOrBefore[onOrBefore.length - 1] : null
        const firstAfter = after.length ? after[0] : null
        if (lastOnOrBefore != null && lastOnOrBefore.new_value != null && Number(lastOnOrBefore.new_value) >= 0) return Number(lastOnOrBefore.new_value)
        if (firstAfter != null && firstAfter.old_value != null && Number(firstAfter.old_value) >= 0) return Number(firstAfter.old_value)
        return null
      }

      const menuKeys = new Set(menuHistoryRows.map((r) => r.entity_id))
      for (const id of menuKeys) {
        const price = valueAtDate(menuHistoryRows, id, 'price')
        const priceDelivery = valueAtDate(menuHistoryRows, id, 'price_delivery')
        if (price != null || priceDelivery != null) {
          if (!menuRestore[id]) menuRestore[id] = {}
          if (price != null) menuRestore[id].price = price
          if (priceDelivery != null) menuRestore[id].price_delivery = priceDelivery
        }
      }
      const optionKeys = new Set(optionHistoryRows.map((r) => r.entity_id))
      for (const id of optionKeys) {
        const priceModifier = valueAtDate(optionHistoryRows, id, 'price_modifier')
        const priceModifierDelivery = valueAtDate(optionHistoryRows, id, 'price_modifier_delivery')
        if (priceModifier != null || priceModifierDelivery != null) {
          if (!optionRestore[id]) optionRestore[id] = {}
          if (priceModifier != null) optionRestore[id].price_modifier = priceModifier
          if (priceModifierDelivery != null) optionRestore[id].price_modifier_delivery = priceModifierDelivery
        }
      }
    } else {
      // ----- 기존: 0/비어 있는 것만 이력의 최신 old_value로 복구 (item + pos_menu) -----
      const itemHistory = (await supabaseSelectFilter(
        'price_history',
        'entity_type=eq.item',
        { order: 'changed_at.desc', limit: 50000, select: 'entity_id,field_name,old_value,changed_at' }
      )) as HistoryRow[] | null
      const historyRows = [...(itemHistory || []), ...menuHistoryRows]
      const seenItem = new Set<string>()
      const seenMenu = new Set<string>()

      for (const r of historyRows) {
        const key = `${r.entity_id}:${r.field_name}`
        const oldVal = r.old_value != null ? Number(r.old_value) : null
        if (oldVal === null || oldVal < 0) continue

        if (r.entity_type === 'item') {
          if (seenItem.has(key)) continue
          seenItem.add(key)
          if (!itemRestore[r.entity_id]) itemRestore[r.entity_id] = {}
          if (r.field_name === 'price') itemRestore[r.entity_id].price = oldVal
          else if (r.field_name === 'cost') itemRestore[r.entity_id].cost = oldVal
        } else if (r.entity_type === 'pos_menu') {
          if (seenMenu.has(key)) continue
          seenMenu.add(key)
          if (!menuRestore[r.entity_id]) menuRestore[r.entity_id] = {}
          if (r.field_name === 'price') menuRestore[r.entity_id].price = oldVal
          else if (r.field_name === 'price_delivery') menuRestore[r.entity_id].price_delivery = oldVal
        }
      }
    }

    const items = (await supabaseSelect('items', {
      limit: 10000,
      select: 'code,price,cost',
    })) as { code?: string; price?: number; cost?: number }[] | null
    const menus = (await supabaseSelect('pos_menus', {
      limit: 2000,
      select: 'id,price,price_delivery',
    })) as { id?: number; price?: number; price_delivery?: number | null }[] | null
    const menuOptions = (await supabaseSelect('pos_menu_options', {
      limit: 10000,
      select: 'id,price_modifier,price_modifier_delivery',
    })) as { id?: number; price_modifier?: number; price_modifier_delivery?: number | null }[] | null

    let itemsRestored = 0
    let menusRestored = 0
    let optionsRestored = 0
    const details: { items: string[]; menus: string[]; options: string[] } = { items: [], menus: [], options: [] }

    if (!targetDate) {
      for (const row of items || []) {
        const code = String(row.code ?? '').trim()
        if (!code) continue
        const restore = itemRestore[code]
        if (!restore) continue
        const updates: Record<string, unknown> = {}
        if ((row.price == null || Number(row.price) === 0) && restore.price != null && restore.price > 0) updates.price = restore.price
        if ((row.cost == null || Number(row.cost) === 0) && restore.cost != null && restore.cost > 0) updates.cost = restore.cost
        if (Object.keys(updates).length === 0) continue
        const parts: string[] = []
        if (updates.price != null) parts.push(`price → ${updates.price}`)
        if (updates.cost != null) parts.push(`cost → ${updates.cost}`)
        details.items.push(`${code} ${parts.join(', ')}${dryRun ? ' (예정)' : ''}`)
        itemsRestored++
        if (!dryRun) await supabaseUpdateByFilter('items', `code=eq.${encodeURIComponent(code)}`, updates)
      }
    }

    const applyMenuUpdates = targetDate
      ? async (row: { id?: number; price?: number; price_delivery?: number | null }, id: string) => {
          const restore = menuRestore[id]
          if (!restore) return
          const updates: Record<string, unknown> = {}
          if (restore.price != null) updates.price = restore.price
          if (restore.price_delivery != null) updates.price_delivery = restore.price_delivery
          if (Object.keys(updates).length === 0) return
          const parts: string[] = []
          if (updates.price != null) parts.push(`price → ${updates.price}`)
          if (updates.price_delivery != null) parts.push(`price_delivery → ${updates.price_delivery}`)
          details.menus.push(`id=${id} ${parts.join(', ')}${dryRun ? ' (예정)' : ''}`)
          menusRestored++
          if (!dryRun) await supabaseUpdateByFilter('pos_menus', `id=eq.${id}`, updates)
        }
      : async (row: { id?: number; price?: number; price_delivery?: number | null }, id: string) => {
          const restore = menuRestore[id]
          if (!restore) return
          const updates: Record<string, unknown> = {}
          if ((row.price == null || Number(row.price) === 0) && restore.price != null && restore.price > 0) updates.price = restore.price
          if ((row.price_delivery == null || Number(row.price_delivery) === 0) && restore.price_delivery != null && restore.price_delivery > 0) updates.price_delivery = restore.price_delivery
          if (Object.keys(updates).length === 0) return
          const parts: string[] = []
          if (updates.price != null) parts.push(`price → ${updates.price}`)
          if (updates.price_delivery != null) parts.push(`price_delivery → ${updates.price_delivery}`)
          details.menus.push(`id=${id} ${parts.join(', ')}${dryRun ? ' (예정)' : ''}`)
          menusRestored++
          if (!dryRun) await supabaseUpdateByFilter('pos_menus', `id=eq.${id}`, updates)
        }

    for (const row of menus || []) {
      const id = row.id != null ? String(row.id) : ''
      if (!id) continue
      await applyMenuUpdates(row, id)
    }

    for (const row of menuOptions || []) {
      const id = row.id != null ? String(row.id) : ''
      if (!id) continue
      const restore = optionRestore[id]
      if (!restore) continue
      const updates: Record<string, unknown> = {}
      if (targetDate) {
        if (restore.price_modifier != null) updates.price_modifier = restore.price_modifier
        if (restore.price_modifier_delivery != null) updates.price_modifier_delivery = restore.price_modifier_delivery
      } else {
        if ((row.price_modifier == null || Number(row.price_modifier) === 0) && restore.price_modifier != null && restore.price_modifier > 0) updates.price_modifier = restore.price_modifier
        if ((row.price_modifier_delivery == null || Number(row.price_modifier_delivery) === 0) && restore.price_modifier_delivery != null && restore.price_modifier_delivery > 0) updates.price_modifier_delivery = restore.price_modifier_delivery
      }
      if (Object.keys(updates).length === 0) continue
      const parts: string[] = []
      if (updates.price_modifier != null) parts.push(`price_modifier → ${updates.price_modifier}`)
      if (updates.price_modifier_delivery != null) parts.push(`price_modifier_delivery → ${updates.price_modifier_delivery}`)
      details.options.push(`id=${id} ${parts.join(', ')}${dryRun ? ' (예정)' : ''}`)
      optionsRestored++
      if (!dryRun) await supabaseUpdateByFilter('pos_menu_options', `id=eq.${id}`, updates)
    }

    const message = targetDate
      ? dryRun
        ? `복구 예정: ${targetDate} 시점 메뉴 ${menusRestored}건, 옵션 ${optionsRestored}건. 실제 적용하려면 dryRun 없이 POST 하세요.`
        : `${targetDate} 시점으로 메뉴 ${menusRestored}건, 옵션 ${optionsRestored}건 가격 복구 완료.`
      : dryRun
        ? `복구 예정: 품목 ${itemsRestored}건, 메뉴 ${menusRestored}건. 실제 적용하려면 dryRun 없이 POST 하세요.`
        : `품목 ${itemsRestored}건, POS 메뉴 ${menusRestored}건 가격/원가 복구 완료.`

    return NextResponse.json(
      {
        success: true,
        message,
        restored: { items: itemsRestored, menus: menusRestored, options: optionsRestored },
        dryRun,
        targetDate: targetDate || undefined,
        details,
        note: targetDate
          ? '가격 이력에 기록된 해당 날짜(방콕 기준) 시점 값으로 복구했습니다. 품목(item)은 targetDate 미지원으로 복구되지 않습니다.'
          : '이미지·카테고리는 가격 이력에 없어 복구되지 않습니다. Supabase 대시보드 백업/복원 또는 수동 재입력을 이용해 주세요.',
      },
      { headers }
    )
  } catch (e) {
    console.error('restoreFromPriceHistory:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { success: false, message: msg || '복구 실패', restored: { items: 0, menus: 0, options: 0 } },
      { status: 500, headers }
    )
  }
}
