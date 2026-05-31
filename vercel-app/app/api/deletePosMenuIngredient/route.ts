import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'

/** POS 메뉴 재료(BOM) 삭제 */
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

    if (!id) {
      return NextResponse.json({ success: false, message: 'id required' }, { headers })
    }

    const beforeRows = (await supabaseSelectFilter(
      'pos_menu_ingredients',
      `id=eq.${encodeURIComponent(String(id))}`,
      { limit: 1 }
    ).catch(() => [])) as Record<string, unknown>[]
    const beforeRow = beforeRows[0] ?? null

    await supabaseDeleteByFilter('pos_menu_ingredients', `id=eq.${id}`)

    const nowBkk = getBangkokDateTimeString()
    const actorName = String(auth.name || '').trim() || null
    const actorRole = String(auth.role || '').trim() || null
    const actorStore = String(auth.store || '').trim() || null
    const actorEmployeeCode = String(auth.employeeCode || '').trim() || null
    const actorEmployeeId =
      auth.employeeId != null && Number.isFinite(Number(auth.employeeId))
        ? Math.floor(Number(auth.employeeId))
        : null

    try {
      await supabaseInsert('pos_menu_ingredients_audit', {
        action_type: 'delete',
        changed_at: nowBkk,
        actor_name: actorName,
        actor_role: actorRole,
        actor_store: actorStore,
        actor_employee_code: actorEmployeeCode,
        actor_employee_id: actorEmployeeId,
        menu_id: Number(beforeRow?.menu_id ?? 0) || null,
        menu_code: String(beforeRow?.menu_code ?? '').trim() || null,
        option_id:
          beforeRow?.option_id != null && String(beforeRow.option_id).trim() !== ''
            ? Number(beforeRow.option_id)
            : null,
        ingredient_id: String(id),
        before_row: beforeRow,
        after_row: null,
      })
    } catch (auditErr) {
      console.warn('deletePosMenuIngredient audit insert failed:', auditErr)
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('deletePosMenuIngredient:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
