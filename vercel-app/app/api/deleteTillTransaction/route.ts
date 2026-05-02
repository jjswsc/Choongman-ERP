import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'

type TillRow = {
  id: number
  store_code?: string
  trans_type?: string
}

/** 시재 매출 출금(sales_withdrawal) 한 건 삭제 — 중복 등록 정정용 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Content-Type', 'application/json')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = await request.json()
    const rawId = body.id ?? body.transactionId
    const id = Math.floor(Number(rawId))
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, message: '유효한 거래 번호가 아닙니다.' }, { status: 400, headers })
    }

    const userStore = String(auth.store || '').trim()
    const userRole = String(auth.role || '').toLowerCase()
    const allowedStores =
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(userStore)

    const rows = (await supabaseSelectFilter('pos_till_transactions', `id=eq.${id}`, {
      limit: 1,
      select: 'id,store_code,trans_type',
    })) as TillRow[] | null
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null
    if (!row) {
      return NextResponse.json({ success: false, message: '거래를 찾을 수 없습니다.' }, { status: 404, headers })
    }

    const transType = String(row.trans_type || '').trim().toLowerCase()
    if (transType !== 'sales_withdrawal') {
      return NextResponse.json(
        { success: false, message: '매출 출금 건만 삭제할 수 있습니다.' },
        { status: 400, headers }
      )
    }

    const storeCode = String(row.store_code || '').trim()
    if (!storeCode) {
      return NextResponse.json({ success: false, message: '매장 정보가 없습니다.' }, { status: 400, headers })
    }

    const isScopedRole =
      !isOfficeRole(userRole) &&
      !isAccountingRole(userRole) &&
      (userRole.includes('manager') || userRole.includes('franchisee'))
    if (isScopedRole) {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, storeCode))
      if (!allowed) {
        return NextResponse.json({ success: false, message: '해당 매장만 삭제할 수 있습니다.' }, { status: 403, headers })
      }
    }

    await supabaseDeleteByFilter('pos_till_transactions', `id=eq.${id}`)

    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteTillTransaction:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
