import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'

/** POS 메뉴 재료(BOM) 저장 */
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
    const id = body?.id
    const menuId = Number(body?.menuId)
    const itemCode = String(body?.itemCode ?? '').trim()
    const quantity = Math.max(0, Number(body?.quantity) ?? 1)
    if (quantity <= 0) {
      return NextResponse.json({ success: false, message: 'quantity must be greater than 0' }, { headers })
    }
    const lossRate = Math.max(0, Math.min(100, Number(body?.lossRate) ?? 0))
    const optionId = body?.optionId != null ? Number(body.optionId) : null
    const ingredientType = (body?.ingredientType ?? 'food') === 'packaging' ? 'packaging' : 'food'

    if (!menuId || !itemCode) {
      return NextResponse.json({ success: false, message: 'menuId and itemCode required' }, { headers })
    }
    const menuCode = String(
      (
        (
          (await supabaseSelectFilter('pos_menus', `id=eq.${menuId}`, {
            limit: 1,
            select: 'code',
          }).catch(() => [])) as { code?: string }[]
        )?.[0]?.code ?? ''
      )
    ).trim()

    const ingredientRow = {
      item_code: itemCode,
      quantity,
      loss_rate: lossRate,
      ingredient_type: ingredientType,
      option_id: optionId,
      ...(menuCode ? { menu_code: menuCode } : {}),
    }
    const nowBkk = getBangkokDateTimeString()
    const actorName = String(auth.name || '').trim() || null
    const actorRole = String(auth.role || '').trim() || null
    const actorStore = String(auth.store || '').trim() || null
    const actorEmployeeCode = String(auth.employeeCode || '').trim() || null
    const actorEmployeeId =
      auth.employeeId != null && Number.isFinite(Number(auth.employeeId))
        ? Math.floor(Number(auth.employeeId))
        : null

    let beforeRow: Record<string, unknown> | null = null
    let insertedId = ''

    if (id) {
      const beforeRows = (await supabaseSelectFilter(
        'pos_menu_ingredients',
        `id=eq.${encodeURIComponent(String(id))}`,
        { limit: 1 }
      ).catch(() => [])) as Record<string, unknown>[]
      beforeRow = beforeRows[0] ?? null
      try {
        await supabaseUpdateByFilter('pos_menu_ingredients', `id=eq.${id}`, ingredientRow)
      } catch {
        // 구 스키마(= menu_code 컬럼 없음) 호환
        const { menu_code: _ignored, ...legacyRow } = ingredientRow as typeof ingredientRow & { menu_code?: string }
        await supabaseUpdateByFilter('pos_menu_ingredients', `id=eq.${id}`, legacyRow)
      }
    } else {
      try {
        const inserted = (await supabaseInsert('pos_menu_ingredients', {
          menu_id: menuId,
          ...ingredientRow,
        })) as { id?: number | string }[] | null
        insertedId = String(inserted?.[0]?.id ?? '').trim()
      } catch {
        // 구 스키마(= menu_code 컬럼 없음) 호환
        const { menu_code: _ignored, ...legacyRow } = ingredientRow as typeof ingredientRow & { menu_code?: string }
        const inserted = (await supabaseInsert('pos_menu_ingredients', {
          menu_id: menuId,
          ...legacyRow,
        })) as { id?: number | string }[] | null
        insertedId = String(inserted?.[0]?.id ?? '').trim()
      }
    }

    const resolvedId = id ? String(id) : insertedId
    const afterRows = resolvedId
      ? ((await supabaseSelectFilter(
          'pos_menu_ingredients',
          `id=eq.${encodeURIComponent(resolvedId)}`,
          { limit: 1 }
        ).catch(() => [])) as Record<string, unknown>[])
      : []
    const afterRow = afterRows[0] ?? null

    try {
      await supabaseInsert('pos_menu_ingredients_audit', {
        action_type: id ? 'update' : 'insert',
        changed_at: nowBkk,
        actor_name: actorName,
        actor_role: actorRole,
        actor_store: actorStore,
        actor_employee_code: actorEmployeeCode,
        actor_employee_id: actorEmployeeId,
        menu_id: menuId,
        menu_code: menuCode || null,
        option_id: optionId,
        ingredient_id: resolvedId || null,
        before_row: beforeRow,
        after_row: afterRow,
      })
    } catch (auditErr) {
      console.warn('savePosMenuIngredient audit insert failed:', auditErr)
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosMenuIngredient:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
