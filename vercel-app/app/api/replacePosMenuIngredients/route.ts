import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
} from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import {
  ingredientRowMatchesScope,
  posMenuIngredientScopeFilter,
} from '@/lib/pos-menu-ingredient-scope'

type IngredientInput = {
  itemCode: string
  quantity: number
  lossRate: number
  ingredientType: 'food' | 'packaging'
}

async function deleteIngredientsInScope(menuId: number, optionId: number | null): Promise<void> {
  const scopeFilter = posMenuIngredientScopeFilter(menuId, optionId)
  try {
    await supabaseDeleteByFilter('pos_menu_ingredients', scopeFilter)
    return
  } catch (scopeErr) {
    if (optionId != null) throw scopeErr
    const mid = encodeURIComponent(String(Math.floor(menuId)))
    await supabaseDeleteByFilter('pos_menu_ingredients', `menu_id=eq.${mid}&option_id=is.null`)
    await supabaseDeleteByFilter('pos_menu_ingredients', `menu_id=eq.${mid}&option_id=eq.0`)
  }
}

/** 원가 계산기: menuId + optionId 스코프 내 BOM 전량 교체 (다른 옵션·유사 코드 메뉴는 건드리지 않음) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(req, 'office')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth

    const body = await req.json()
    const menuId = Number(body?.menuId)
    const rawOptionId = body?.optionId
    const optionId =
      rawOptionId == null || rawOptionId === '' || rawOptionId === 'null'
        ? null
        : Number(rawOptionId)
    const items = Array.isArray(body?.items) ? (body.items as IngredientInput[]) : []

    if (!menuId || !Number.isFinite(menuId)) {
      return NextResponse.json({ success: false, message: 'menuId required' }, { headers })
    }
    if (optionId != null && (!Number.isFinite(optionId) || optionId <= 0)) {
      return NextResponse.json({ success: false, message: 'invalid optionId' }, { headers })
    }

    const normalizedItems: IngredientInput[] = []
    for (const row of items) {
      const itemCode = String(row?.itemCode ?? '').trim()
      const quantity = Math.max(0, Number(row?.quantity) ?? 0)
      if (!itemCode || quantity <= 0) continue
      normalizedItems.push({
        itemCode,
        quantity,
        lossRate: Math.max(0, Math.min(100, Number(row?.lossRate) ?? 0)),
        ingredientType: row?.ingredientType === 'packaging' ? 'packaging' : 'food',
      })
    }

    const menuRows = (await supabaseSelectFilter('pos_menus', `id=eq.${Math.floor(menuId)}`, {
      limit: 1,
      select: 'code',
    }).catch(() => [])) as { code?: string }[]
    const menuCode = String(menuRows?.[0]?.code ?? '').trim()

    const scopeFilter = posMenuIngredientScopeFilter(menuId, optionId)
    const beforeRows = (await supabaseSelectFilter('pos_menu_ingredients', scopeFilter, {
      order: 'id.asc',
      limit: 500,
    }).catch(() => [])) as Record<string, unknown>[]

    const scopedBefore = (beforeRows || []).filter((r) =>
      ingredientRowMatchesScope(r, menuId, optionId)
    )

    await deleteIngredientsInScope(menuId, optionId)

    const nowBkk = getBangkokDateTimeString()
    const actorName = String(auth.name || '').trim() || null
    const actorRole = String(auth.role || '').trim() || null
    const actorStore = String(auth.store || '').trim() || null
    const actorEmployeeCode = String(auth.employeeCode || '').trim() || null
    const actorEmployeeId =
      auth.employeeId != null && Number.isFinite(Number(auth.employeeId))
        ? Math.floor(Number(auth.employeeId))
        : null

    for (const beforeRow of scopedBefore) {
      try {
        await supabaseInsert('pos_menu_ingredients_audit', {
          action_type: 'delete',
          changed_at: nowBkk,
          actor_name: actorName,
          actor_role: actorRole,
          actor_store: actorStore,
          actor_employee_code: actorEmployeeCode,
          actor_employee_id: actorEmployeeId,
          menu_id: menuId,
          menu_code: menuCode || null,
          option_id: optionId,
          ingredient_id: beforeRow?.id != null ? String(beforeRow.id) : null,
          before_row: beforeRow,
          after_row: null,
        })
      } catch (auditErr) {
        console.warn('replacePosMenuIngredients audit delete failed:', auditErr)
      }
    }

    for (const row of normalizedItems) {
      const ingredientRow = {
        menu_id: menuId,
        item_code: row.itemCode,
        quantity: row.quantity,
        loss_rate: row.lossRate,
        ingredient_type: row.ingredientType,
        option_id: optionId,
        ...(menuCode ? { menu_code: menuCode } : {}),
      }
      let insertedId = ''
      try {
        const inserted = (await supabaseInsert('pos_menu_ingredients', ingredientRow)) as
          | { id?: number | string }[]
          | null
        insertedId = String(inserted?.[0]?.id ?? '').trim()
      } catch {
        const { menu_code: _ignored, ...legacyRow } = ingredientRow
        const inserted = (await supabaseInsert('pos_menu_ingredients', legacyRow)) as
          | { id?: number | string }[]
          | null
        insertedId = String(inserted?.[0]?.id ?? '').trim()
      }

      const afterRows = insertedId
        ? ((await supabaseSelectFilter(
            'pos_menu_ingredients',
            `id=eq.${encodeURIComponent(insertedId)}`,
            { limit: 1 }
          ).catch(() => [])) as Record<string, unknown>[])
        : []
      const afterRow = afterRows[0] ?? null

      try {
        await supabaseInsert('pos_menu_ingredients_audit', {
          action_type: 'insert',
          changed_at: nowBkk,
          actor_name: actorName,
          actor_role: actorRole,
          actor_store: actorStore,
          actor_employee_code: actorEmployeeCode,
          actor_employee_id: actorEmployeeId,
          menu_id: menuId,
          menu_code: menuCode || null,
          option_id: optionId,
          ingredient_id: insertedId || null,
          before_row: null,
          after_row: afterRow,
        })
      } catch (auditErr) {
        console.warn('replacePosMenuIngredients audit insert failed:', auditErr)
      }
    }

    return NextResponse.json({ success: true, deleted: scopedBefore.length, inserted: normalizedItems.length }, { headers })
  } catch (e) {
    console.error('replacePosMenuIngredients:', e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}
