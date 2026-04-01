import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'
import { isAccountingRole, isFranchiseeRole } from '@/lib/permissions'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
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
    const body = await req.json()
    const r = Number(body.r != null ? body.r : body.row)
    const userStore = String(body.userStore || '').trim()
    const userRole = String(body.userRole || '').toLowerCase()
    const jwt = await tryVerifyBearerFromRequest(req)
    const effectiveRole = String(jwt?.role || userRole).toLowerCase()
    const franchiseeJwtList =
      jwt && isFranchiseeRole(jwt.role || '') ? normalizedAllowedStoresFromJwt(jwt) : undefined

    if (!r) {
      return NextResponse.json({ success: false, message: '❌ 잘못된 행' }, { headers })
    }

    const rows = (await supabaseSelectFilter('employees', `id=eq.${r}`, { select: 'store', limit: 1 })) as { store?: string }[] | null
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, message: '❌ 해당 직원을 찾을 수 없습니다.' }, { headers })
    }

    const rowStore = String(rows[0].store || '').trim()
    const isTop = ['director', 'officer', 'ceo', 'hr'].some((role) => userRole.includes(role)) || isAccountingRole(userRole)
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

    await supabaseDeleteByFilter('employees', `id=eq.${r}`)
    return NextResponse.json({ success: true, message: '✅ 삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteAdminEmployee:', e)
    return NextResponse.json(
      { success: false, message: '❌ 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
