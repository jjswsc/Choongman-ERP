/**
 * 가격 이력(price_history)에서 이전 값(old_value)을 읽어
 * items / pos_menus의 가격·원가가 0 또는 비어 있는 경우 복구합니다.
 *
 * - 이미지·카테고리: 앱에는 백업 없음. Supabase 대시보드 백업/복원 또는 수동 재입력 필요.
 * - POST로 호출. dryRun=1 이면 실제 업데이트 없이 복구 대상만 반환.
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
  changed_at?: string
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const dryRun = searchParams.get('dryRun') === '1' || searchParams.get('dryRun') === 'true'

    // price_history 전체 조회 (entity_type=item 또는 pos_menu, 최신순)
    let historyRows: HistoryRow[] = []
    try {
      const itemHistory = (await supabaseSelectFilter(
        'price_history',
        'entity_type=eq.item',
        { order: 'changed_at.desc', limit: 50000, select: 'entity_id,field_name,old_value,changed_at' }
      )) as HistoryRow[] | null
      const menuHistory = (await supabaseSelectFilter(
        'price_history',
        'entity_type=eq.pos_menu',
        { order: 'changed_at.desc', limit: 50000, select: 'entity_id,field_name,old_value,changed_at' }
      )) as HistoryRow[] | null
      historyRows = [...(itemHistory || []), ...(menuHistory || [])]
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/does not exist|42P01/i.test(msg)) {
        return NextResponse.json(
          { success: false, message: 'price_history 테이블이 없습니다. 복구할 이력이 없습니다.', restored: { items: 0, menus: 0 } },
          { headers }
        )
      }
      throw e
    }

    // entity_id + field_name 별로 가장 최근 1건만 사용 (이미 changed_at.desc 순이므로 첫 번째가 최신)
    const itemRestore: Record<string, { price?: number; cost?: number }> = {}
    const menuRestore: Record<string, { price?: number; price_delivery?: number }> = {}
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

    const items = (await supabaseSelect('items', {
      limit: 10000,
      select: 'code,price,cost',
    })) as { code?: string; price?: number; cost?: number }[] | null
    const menus = (await supabaseSelect('pos_menus', {
      limit: 2000,
      select: 'id,price,price_delivery',
    })) as { id?: number; price?: number; price_delivery?: number | null }[] | null

    let itemsRestored = 0
    let menusRestored = 0
    const details: { items: string[]; menus: string[] } = { items: [], menus: [] }

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

    for (const row of menus || []) {
      const id = row.id != null ? String(row.id) : ''
      if (!id) continue
      const restore = menuRestore[id]
      if (!restore) continue
      const updates: Record<string, unknown> = {}
      if ((row.price == null || Number(row.price) === 0) && restore.price != null && restore.price > 0) updates.price = restore.price
      if ((row.price_delivery == null || Number(row.price_delivery) === 0) && restore.price_delivery != null && restore.price_delivery > 0) updates.price_delivery = restore.price_delivery
      if (Object.keys(updates).length === 0) continue
      const parts: string[] = []
      if (updates.price != null) parts.push(`price → ${updates.price}`)
      if (updates.price_delivery != null) parts.push(`price_delivery → ${updates.price_delivery}`)
      details.menus.push(`id=${id} ${parts.join(', ')}${dryRun ? ' (예정)' : ''}`)
      menusRestored++
      if (!dryRun) await supabaseUpdateByFilter('pos_menus', `id=eq.${id}`, updates)
    }

    return NextResponse.json(
      {
        success: true,
        message: dryRun
          ? `복구 예정: 품목 ${itemsRestored}건, 메뉴 ${menusRestored}건. 실제 적용하려면 dryRun 없이 POST 하세요.`
          : `품목 ${itemsRestored}건, POS 메뉴 ${menusRestored}건 가격/원가 복구 완료.`,
        restored: { items: itemsRestored, menus: menusRestored },
        dryRun,
        details,
        note: '이미지·카테고리는 가격 이력에 없어 복구되지 않습니다. Supabase 대시보드 백업/복원 또는 수동 재입력을 이용해 주세요.',
      },
      { headers }
    )
  } catch (e) {
    console.error('restoreFromPriceHistory:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { success: false, message: msg || '복구 실패', restored: { items: 0, menus: 0 } },
      { status: 500, headers }
    )
  }
}
