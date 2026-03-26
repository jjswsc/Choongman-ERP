import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 메뉴 재료(BOM) 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const menuId = searchParams.get('menuId')?.trim()

  if (!menuId) {
    return NextResponse.json([], { headers })
  }

  try {
    const optionId = searchParams.get('optionId')?.trim()
    const midEnc = encodeURIComponent(menuId)

    type IngredientRow = {
      id?: number
      menu_id?: number
      item_code?: string
      quantity?: number
      loss_rate?: number
      option_id?: number | null
      ingredient_type?: string
    }
    let rows: IngredientRow[] | null

    const fetchByFilter = (extra: string) =>
      supabaseSelectFilter('pos_menu_ingredients', `menu_id=eq.${midEnc}&${extra}`, {
        order: 'id.asc',
        limit: 200,
      }) as Promise<IngredientRow[] | null>

    try {
      if (!optionId || optionId === 'null') {
        /** null 행만 있으면 eq.0 폴백을 안 하던 틈으로 0 전용 행이 빠지지 않게 병합 */
        const nullRows = (await fetchByFilter('option_id=is.null')) || []
        const zeroRows = (await fetchByFilter('option_id=eq.0')) || []
        const merged = new Map<string, IngredientRow>()
        const rowKey = (r: IngredientRow) =>
          r.id != null ? `id:${r.id}` : `f:${r.menu_id}|${String(r.item_code)}|${String(r.option_id ?? '')}|${String(r.quantity)}`
        for (const r of [...nullRows, ...zeroRows]) merged.set(rowKey(r), r)
        rows = Array.from(merged.values())
      } else {
        rows = await fetchByFilter(`option_id=eq.${encodeURIComponent(optionId)}`)
      }
    } catch {
      rows = (await supabaseSelectFilter('pos_menu_ingredients', `menu_id=eq.${midEnc}`, { order: 'id.asc', limit: 200 })) as IngredientRow[] | null
    }

    /** 폴백으로 menu 전체를 가져온 경우: 요청한 옵션에 맞는 행만 (기본 = null/0/빈문자) */
    if (rows?.length && (!optionId || optionId === 'null')) {
      const isBaseOpt = (raw: unknown) => {
        if (raw == null) return true
        if (typeof raw === 'number' && raw === 0) return true
        const s = String(raw).trim()
        return s === '' || s === '0'
      }
      rows = rows.filter((r) => isBaseOpt(r.option_id))
    } else if (rows?.length && optionId && optionId !== 'null') {
      rows = rows.filter((r) => String(r.option_id ?? '') === String(optionId))
    }

    const list = (rows || []).map((r) => ({
      id: String(r.id ?? ''),
      menuId: String(r.menu_id ?? ''),
      itemCode: String(r.item_code ?? ''),
      quantity: Number(r.quantity) ?? 1,
      lossRate: Number(r.loss_rate) ?? 0,
      optionId: r.option_id != null ? String(r.option_id) : null,
      ingredientType: (r.ingredient_type ?? 'food') as 'food' | 'packaging',
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosMenuIngredients:', e)
    return NextResponse.json([], { headers })
  }
}
