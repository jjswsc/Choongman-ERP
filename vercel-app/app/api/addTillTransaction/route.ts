import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

/** 시재(카운터 현금) 입출금 등록 - pos_till_transactions */
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
    const storeCode = String(body.storeCode || body.store || '').trim()
    const transDate = String(body.transDate || body.trans_date || '').slice(0, 10)
    const transType = String(body.transType || body.trans_type || 'deposit').toLowerCase()
    const amount = Math.abs(Number(body.amount) || 0)
    const memo = String(body.memo || '').trim()
    const userName = String(auth.name || body.userName || body.user_name || '').trim()
    const userStore = String(auth.store || '').trim()
    const userRole = String(auth.role || '').toLowerCase()
    const allowedStores =
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(userStore)
    const salesDate = String(body.salesDate || body.sales_date || '').trim().slice(0, 10) || null

    if (!storeCode) {
      return NextResponse.json({ success: false, message: '매장을 선택하세요.' }, { status: 400, headers })
    }
    if (!transDate) {
      return NextResponse.json({ success: false, message: '날짜를 선택하세요.' }, { status: 400, headers })
    }
    if (amount === 0) {
      return NextResponse.json({ success: false, message: '금액을 입력하세요.' }, { status: 400, headers })
    }
    const allowedTypes = ['deposit', 'withdrawal', 'sales_withdrawal']
    if (!allowedTypes.includes(transType)) {
      return NextResponse.json({ success: false, message: '유형이 올바르지 않습니다.' }, { status: 400, headers })
    }

    const isScopedRole =
      !isOfficeRole(userRole) && !isAccountingRole(userRole) &&
      (userRole.includes('manager') || userRole.includes('franchisee'))
    if (isScopedRole) {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, storeCode))
      if (!allowed) {
        return NextResponse.json({ success: false, message: '해당 매장만 등록할 수 있습니다.' }, { status: 403, headers })
      }
    }

    const amt = transType === 'withdrawal' || transType === 'sales_withdrawal' ? -amount : amount

    await supabaseInsert('pos_till_transactions', {
      store_code: storeCode,
      trans_date: transDate,
      trans_type: transType,
      amount: amt,
      memo: memo || null,
      user_name: userName || null,
      ...(salesDate && transType === 'sales_withdrawal' ? { sales_date: salesDate } : {}),
    })

    return NextResponse.json({ success: true, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('addTillTransaction:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
