import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  ingredientRowMatchesScope,
  isBaseMenuIngredientOptionId,
  posMenuIngredientScopeFilter,
} from '@/lib/pos-menu-ingredient-scope'

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
    const optionIdRaw = searchParams.get('optionId')?.trim()
    const wantBase = !optionIdRaw || optionIdRaw === 'null'
    const optionIdNum = wantBase ? null : Number(optionIdRaw)
    const midNum = Number(menuId)
    const scopeMenuId = Number.isFinite(midNum) && midNum > 0 ? Math.floor(midNum) : null

    type IngredientRow = {
      id?: number
      menu_id?: number
      item_code?: string
      quantity?: number
      loss_rate?: number
      option_id?: number | null
      ingredient_type?: string
    }
    let rows: IngredientRow[] | null = null
    const scopeOptionId = wantBase ? null : Number.isFinite(optionIdNum) ? optionIdNum : null

    if (scopeMenuId != null) {
      const scopeFilter = posMenuIngredientScopeFilter(scopeMenuId, scopeOptionId)
      try {
        rows = (await supabaseSelectFilter('pos_menu_ingredients', scopeFilter, {
          order: 'id.asc',
          limit: 200,
        })) as IngredientRow[] | null
      } catch {
        rows = null
      }
    }

    /** 스코프 조회 성공·0건이면 빈 BOM — 폴백 금지(옵션 없을 때 기본 BOM이 섞여 보이는 버그 방지) */
    if (rows === null) {
      const midEnc = encodeURIComponent(menuId)
      try {
        if (wantBase) {
          const nullRows = (await supabaseSelectFilter('pos_menu_ingredients', `menu_id=eq.${midEnc}&option_id=is.null`, {
            order: 'id.asc',
            limit: 200,
          })) as IngredientRow[] | null
          const zeroRows = (await supabaseSelectFilter('pos_menu_ingredients', `menu_id=eq.${midEnc}&option_id=eq.0`, {
            order: 'id.asc',
            limit: 200,
          })) as IngredientRow[] | null
          const merged = new Map<string, IngredientRow>()
          const rowKey = (r: IngredientRow) =>
            r.id != null ? `id:${r.id}` : `f:${r.menu_id}|${String(r.item_code)}|${String(r.option_id ?? '')}|${String(r.quantity)}`
          for (const r of [...(nullRows || []), ...(zeroRows || [])]) merged.set(rowKey(r), r)
          rows = Array.from(merged.values())
        } else {
          rows = (await supabaseSelectFilter(
            'pos_menu_ingredients',
            `menu_id=eq.${midEnc}&option_id=eq.${encodeURIComponent(optionIdRaw!)}`,
            { order: 'id.asc', limit: 200 }
          )) as IngredientRow[] | null
        }
      } catch {
        rows = (await supabaseSelectFilter('pos_menu_ingredients', `menu_id=eq.${midEnc}`, {
          order: 'id.asc',
          limit: 200,
        })) as IngredientRow[] | null
      }
    }

    if (rows?.length && scopeMenuId != null) {
      rows = rows.filter((r) => ingredientRowMatchesScope(r, scopeMenuId, scopeOptionId))
    } else if (rows?.length) {
      if (wantBase) {
        rows = rows.filter((r) => isBaseMenuIngredientOptionId(r.option_id))
      } else if (optionIdRaw) {
        rows = rows.filter((r) => String(r.option_id ?? '') === String(optionIdRaw))
      }
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
