import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

/** 재고 조정 - 오피스 직원 또는 매니저(자기 매장만) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) return authResult.errorResponse
    const auth = authResult.auth!

    const body = await request.json() as {
      store?: string
      itemCode?: string
      itemName?: string
      spec?: string
      diffQty?: number
      memo?: string
    }

    const userRole = String(auth.role || '').toLowerCase()
    const userStore = (auth.store || '').trim()
    const isOffice = ['director', 'secretary', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
    const isManager = userRole.includes('manager') || userRole.includes('franchisee')

    if (!isOffice && !isManager) {
      return NextResponse.json(
        { success: false, message: '재고 조정 권한이 없습니다.' },
        { headers }
      )
    }

    if (isManager && userStore) {
      const store = String(body.store || '').trim()
      const storeNorm = store.toLowerCase()
      const userNorm = userStore.toLowerCase()
      const matches = storeNorm === userNorm || userNorm.includes(storeNorm) || storeNorm.includes(userNorm)
      if (!matches) {
        return NextResponse.json(
          { success: false, message: '자기 매장만 재고 조정할 수 있습니다.' },
          { headers }
        )
      }
    }

    const store = String(body.store || '').trim()
    const itemCode = String(body.itemCode || '').trim()
    const diffQty = Number(body.diffQty)
    if (!store || !itemCode) {
      return NextResponse.json(
        { success: false, message: '매장과 품목 코드가 필요합니다.' },
        { headers }
      )
    }
    if (diffQty === 0 || isNaN(diffQty)) {
      return NextResponse.json(
        { success: false, message: '조정 수량을 입력해 주세요.' },
        { headers }
      )
    }

    const now = new Date().toISOString()
    await supabaseInsert('stock_logs', {
      location: store,
      item_code: itemCode,
      item_name: String(body.itemName || '').trim(),
      spec: String(body.spec || '').trim() || 'Adjustment',
      qty: diffQty,
      log_date: now,
      vendor_target: body.memo ? String(body.memo).trim() : '재고조정',
      log_type: 'Adjustment',
    })

    return NextResponse.json({ success: true, message: '재고가 조정되었습니다.' }, { headers })
  } catch (e) {
    console.error('adjustStock:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '재고 조정 실패' },
      { headers }
    )
  }
}
