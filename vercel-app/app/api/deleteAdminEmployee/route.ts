import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { isAccountingRole, isFranchiseeRole } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'
import { userCanAccessEmployeeStore } from '@/lib/admin-employee-store-access'
import {
  franchiseeQueryStoreAllowed,
  normalizedAllowedStoresFromJwt,
} from '@/lib/franchisee-multi-store'

/** 직원 삭제 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(req, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = await req.json()
    const r = Number(body.r != null ? body.r : body.row)
    const reason = String(body.reason ?? '').trim()
    const userStore = String(auth.store || '').trim()
    const userRole = String(auth.role || '').toLowerCase()
    const userName = String(auth.name || body.userName || body.user_name || '').trim()
    const jwt = auth
    const effectiveRole = String(jwt?.role || userRole).toLowerCase()
    const franchiseeJwtList =
      jwt && isFranchiseeRole(jwt.role || '') ? normalizedAllowedStoresFromJwt(jwt) : undefined

    if (!r) {
      return NextResponse.json({ success: false, message: '❌ 잘못된 행' }, { headers })
    }

    const rows = (await supabaseSelectFilter('employees', `id=eq.${r}`, {
      select: 'store,resign_date',
      limit: 1,
    })) as { store?: string; resign_date?: string | null }[] | null
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, message: '❌ 해당 직원을 찾을 수 없습니다.' }, { headers })
    }

    const rowStore = String(rows[0].store || '').trim()
    const isTop = ['director', 'officer', 'ceo', 'hr'].some((role) => effectiveRole.includes(role)) || isAccountingRole(effectiveRole)
    if (!isTop) {
      if (jwt && isFranchiseeRole(effectiveRole) && !franchiseeQueryStoreAllowed(jwt, userStore)) {
        return NextResponse.json(
          { success: false, message: '❌ 선택한 매장에 대한 권한이 없습니다.' },
          { status: 403, headers }
        )
      }
      if (
        !userCanAccessEmployeeStore(effectiveRole, userStore, rowStore, {
          allowedStores: franchiseeJwtList && franchiseeJwtList.length > 0 ? franchiseeJwtList : undefined,
        })
      ) {
        return NextResponse.json({ success: false, message: '❌ 해당 매장 직원만 삭제할 수 있습니다.' }, { headers })
      }
    }

    const today = new Date().toISOString().slice(0, 10)
    const patch: Record<string, unknown> = {
      employment_status: 'resigned',
      deleted_at: new Date().toISOString(),
      deleted_by: userName || null,
      delete_reason: reason || null,
      resign_date: rows[0].resign_date ? String(rows[0].resign_date).slice(0, 10) : today,
    }
    try {
      await supabaseUpdateByFilter('employees', `id=eq.${r}`, patch)
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (!/employment_status|deleted_at|deleted_by|delete_reason|42703|column/i.test(em)) throw e
      await supabaseUpdateByFilter('employees', `id=eq.${r}`, { resign_date: patch.resign_date })
    }
    return NextResponse.json({ success: true, message: '✅ 퇴사/비활성 처리되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteAdminEmployee:', e)
    return NextResponse.json(
      { success: false, message: '❌ 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
