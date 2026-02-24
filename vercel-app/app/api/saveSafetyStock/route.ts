import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

/** 적정재고 저장 - store_settings 테이블. 매니저는 자기 매장만 가능 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) return authResult.errorResponse
    const auth = authResult.auth!

    const body = await request.json() as { store?: string; code?: string; qty?: number }
    const store = String(body.store || '').trim()
    const userRole = (auth.role || '').toLowerCase()
    const isManager = userRole.includes('manager') || userRole.includes('franchisee')
    const userStore = (auth.store || '').trim()

    if (isManager && userStore && store) {
      const storeNorm = store.toLowerCase()
      const userNorm = userStore.toLowerCase()
      const matches = storeNorm === userNorm || userNorm.includes(storeNorm) || storeNorm.includes(userNorm)
      if (!matches) {
        return NextResponse.json(
          { success: false, message: '자기 매장만 적정재고를 수정할 수 있습니다.' },
          { headers }
        )
      }
    }
    const code = String(body.code || '').trim()
    const qty = Number(body.qty) || 0

    if (!store || !code) {
      return NextResponse.json(
        { success: false, message: '매장과 품목 코드가 필요합니다.' },
        { headers }
      )
    }

    const storeNorm = store.toLowerCase()
    const existing = (await supabaseSelectFilter(
      'store_settings',
      `store=ilike.${encodeURIComponent(storeNorm)}&code=eq.${encodeURIComponent(code)}`
    )) as { id?: number }[] | null

    const safeQty = Math.max(0, qty)
    if (existing && existing.length > 0 && existing[0]?.id != null) {
      await supabaseUpdate('store_settings', existing[0].id, { safe_qty: safeQty })
      return NextResponse.json({ success: true, message: '적정재고가 수정되었습니다.' }, { headers })
    }
    await supabaseInsert('store_settings', {
      store: storeNorm,
      code,
      safe_qty: safeQty,
    })
    return NextResponse.json({ success: true, message: '적정재고가 저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveSafetyStock:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}
