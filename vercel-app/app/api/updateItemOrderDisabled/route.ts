import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdateByFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { canToggleItemOrderDisabled } from '@/lib/permissions'

const MSG_ORDER_PAUSE_DENIED = '발주 일시중지 설정은 본사·물류 권한이 필요합니다.'

/** 품목의 order_disabled 토글. 매장 발주 품목 검색에서 제외/포함 — 본사(Office) 또는 물류 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      const res = authResult.errorResponse
      res.headers.set('Access-Control-Allow-Origin', '*')
      return res
    }
    const { auth } = authResult
    if (!canToggleItemOrderDisabled(auth.role || '')) {
      return NextResponse.json(
        { success: false, message: MSG_ORDER_PAUSE_DENIED, msg: MSG_ORDER_PAUSE_DENIED },
        { status: 403, headers }
      )
    }

    const body = (await request.json()) as { code: string; disabled: boolean }
    const code = String(body.code || '').trim()
    if (!code) {
      return NextResponse.json({ success: false, message: '품목 코드가 필요합니다.' }, { headers })
    }
    const disabled = body.disabled === true
    await supabaseUpdateByFilter('items', `code=eq.${encodeURIComponent(code)}`, {
      order_disabled: disabled,
    })
    return NextResponse.json({ success: true, disabled }, { headers })
  } catch (e) {
    console.error('updateItemOrderDisabled:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { headers }
    )
  }
}
