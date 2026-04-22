import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'
import { parseOr400, processOrderSchema } from '@/lib/api-validate'
import { sendNoticeToRecipients, getLogisticRecipients } from '@/lib/send-notice-util'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    // 모바일 발주: 로그인한 일반 직원도 본인 매장(스코프)에서 발주 가능. 매장 검증은 아래 isScopedRole 분기
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      authResult.errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = await request.json()
    const userRole = String(auth.role || '').trim()
    const userStore = String(auth.store || '').trim()
    const allowedStores = Array.from(
      new Set(
        [...(Array.isArray(auth.allowedStores) ? auth.allowedStores : []), userStore]
          .map((s) => String(s || '').trim())
          .filter(Boolean)
      )
    )
    const isScopedRole = !isOfficeRole(userRole) && !isAccountingRole(userRole)
    if (isScopedRole && allowedStores.length === 0) {
      return NextResponse.json({ success: false, message: '접근 가능한 매장 정보가 없습니다.' }, { status: 403, headers })
    }
    const requestedStore = String(body.storeName || body.store || '').trim()
    const effectiveStore = requestedStore || userStore
    if (
      isScopedRole &&
      (!effectiveStore || !allowedStores.some((s) => storesMatchForGradeLookup(s, effectiveStore)))
    ) {
      return NextResponse.json({ success: false, message: '허용되지 않은 매장입니다.' }, { status: 403, headers })
    }
    const bodyForValidation = {
      ...body,
      storeName: effectiveStore,
      userName: String(auth.name || body.userName || body.user || '').trim(),
    }
    const validated = parseOr400(processOrderSchema, bodyForValidation, headers)
    if (validated.errorResponse) return validated.errorResponse
    const { storeName, userName, cart } = validated.parsed

    let sub = 0
    let taxableSub = 0
    for (let i = 0; i < cart.length; i++) {
      const item = cart[i] as { price?: number; qty?: number; taxType?: string }
      const amt = Number(item.price || 0) * Number(item.qty || 0)
      sub += amt
      if (item.taxType !== '면세' && item.taxType !== '영세율') taxableSub += amt
    }
    const vat = Math.round(taxableSub * 0.07)
    const total = sub + vat

    await supabaseInsert('orders', {
      order_date: new Date().toISOString(),
      store_name: storeName,
      user_name: userName,
      cart_json: JSON.stringify(cart),
      subtotal: sub,
      vat,
      total,
      status: 'Pending',
    })

    try {
      const logisticRecipients = await getLogisticRecipients()
      if (logisticRecipients.length > 0) {
        await sendNoticeToRecipients({
          title: `매장 발주: ${storeName}`,
          content: `${storeName}에서 발주를 넣었습니다. 주문/승인 화면에서 확인해 주세요.`,
          recipients: logisticRecipients,
          sender: '시스템',
        })
      }
    } catch (noticeErr) {
      console.error('processOrder notice:', noticeErr)
    }

    return NextResponse.json({ success: true, message: '✅ 주문 완료' }, { headers })
  } catch (e) {
    console.error('processOrder:', e)
    return NextResponse.json(
      { success: false, message: '❌ 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
