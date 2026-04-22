/**
 * 주문 승인/반려/보류 API
 *
 * [로직 요약]
 * - decision: Approved | Rejected | Hold
 * - Approved 시 delivery_date, approved_indices(일부 승인), approved_original_qty_json 저장
 * - updatedCart: 프론트에서 수정한 수량. checked=true인 행만 승인. cart_json 덮어씀
 * - manager 권한은 승인 불가 (userRole 검사)
 * - 미수금은 주문 승인이 아닌 출고 수령 시점(processOrderReceive)에 생성
 * - 처리 완료 시 발주 직원 + 해당 매장 매니저에게 앱 내 공지 자동 발송
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { sendNoticeToRecipients, getManagersByStore } from '@/lib/send-notice-util'
import { requireAuth } from '@/lib/verify-auth'

const ALLOWED_DECISIONS = ['Approved', 'Rejected', 'Hold']

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      authResult.errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = await request.json()
    const orderId = Number(body.orderId ?? body.row ?? body.orderRowId)
    const decision = String(body.decision ?? '').trim()
    let deliveryDate = body.deliveryDate ? String(body.deliveryDate).trim() : ''
    const deliveryDatesByOutbound = body.deliveryDatesByOutbound && typeof body.deliveryDatesByOutbound === 'object'
      ? body.deliveryDatesByOutbound as Record<string, string>
      : null
    if (deliveryDatesByOutbound && Object.keys(deliveryDatesByOutbound).length > 0) {
      const firstDate = Object.values(deliveryDatesByOutbound).find((v) => v && String(v).trim())
      if (firstDate) deliveryDate = String(firstDate).trim()
    }
    const rejectReason = body.rejectReason != null ? String(body.rejectReason).trim() : ''
    const userRole = String(auth.role || '').toLowerCase()
    const processorName = String(auth.name || body.processorName || body.userName || '본사').trim()
    const updatedCart = Array.isArray(body.updatedCart) ? body.updatedCart : null

    if (userRole.includes('manager')) {
      return NextResponse.json(
        { success: false, message: '매장 매니저는 주문 승인/반려 권한이 없습니다.' },
        { headers }
      )
    }

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json(
        { success: false, message: '잘못된 주문 번호입니다.' },
        { headers }
      )
    }
    if (!ALLOWED_DECISIONS.includes(decision)) {
      return NextResponse.json(
        { success: false, message: '유효하지 않은 결정입니다.' },
        { headers }
      )
    }
    if (decision === 'Rejected' && !rejectReason) {
      return NextResponse.json(
        { success: false, message: '거절 사유를 입력해 주세요.' },
        { headers }
      )
    }

    const orders = (await supabaseSelectFilter('orders', 'id=eq.' + orderId, {
      limit: 1,
      select: 'cart_json,store_name,user_name',
    })) as unknown[]
    if (!orders?.length) {
      return NextResponse.json({ success: false, message: '해당 주문이 없습니다.' }, { headers })
    }

    const patch: Record<string, unknown> = { status: decision }
    if (deliveryDate) patch.delivery_date = deliveryDate
    if (deliveryDatesByOutbound && Object.keys(deliveryDatesByOutbound).length > 0) {
      patch.delivery_dates_by_outbound = JSON.stringify(deliveryDatesByOutbound)
    }
    if (decision === 'Approved') patch.delivery_status = '배송중'
    if (decision === 'Rejected') patch.reject_reason = rejectReason || ''

    if (decision === 'Approved' && updatedCart && updatedCart.length > 0) {
      type CartItem = { code?: string; name?: string; price?: number; qty?: number; spec?: string; checked?: boolean; originalQty?: number }
      const existingOrder = orders[0] as { cart_json?: string }
      let origCart: { qty?: number }[] = []
      try { origCart = JSON.parse(existingOrder.cart_json || '[]') } catch {}
      const fullCart = updatedCart
        .filter((i: CartItem) => i && (i.code || i.name))
        .map((i: CartItem, idx: number) => {
          const qty = Math.max(0, Math.floor(Number(i.qty ?? 0) || 0))
          const origQty = Number(origCart[idx]?.qty ?? i.originalQty ?? i.qty ?? 0)
          return {
            code: String(i.code ?? ''),
            name: String(i.name ?? ''),
            price: Number(i.price ?? 0),
            qty,
            spec: String(i.spec ?? ''),
            _origQty: origQty,
          }
        })
      const approvedIndices: number[] = []
      updatedCart.forEach((i: CartItem, idx: number) => {
        if (i && (i.code || i.name) && i.checked && (Number(i.qty ?? 0) || 0) > 0) {
          approvedIndices.push(idx)
        }
      })
      const isPartialApproval = approvedIndices.length > 0 && approvedIndices.length < fullCart.length
      if (fullCart.length > 0) {
        let subtotal = 0
        approvedIndices.forEach((idx) => {
          const it = fullCart[idx]
          if (it) subtotal += it.price * it.qty
        })
        const vat = Math.round(subtotal * 0.07)
        type FullCartItem = { code: string; name: string; price: number; qty: number; spec: string }
        const cartForStorage = fullCart.map((it: FullCartItem) => ({
          code: it.code,
          name: it.name,
          price: it.price,
          qty: it.qty,
          spec: it.spec,
        }))
        patch.cart_json = JSON.stringify(cartForStorage)
        patch.subtotal = subtotal
        patch.vat = vat
        patch.total = subtotal + vat
        if (isPartialApproval) {
          patch.delivery_status = '일부배송완료'
          patch.approved_indices = JSON.stringify(approvedIndices.sort((a, b) => a - b))
        }
        const originalQtyMap: Record<string, number> = {}
        fullCart.forEach((it: { _origQty?: number; qty?: number }, idx: number) => {
          if (it._origQty !== undefined && it._origQty !== it.qty) {
            originalQtyMap[String(idx)] = it._origQty
          }
        })
        if (Object.keys(originalQtyMap).length > 0) {
          patch.approved_original_qty_json = JSON.stringify(originalQtyMap)
        }
      }
    }

    await supabaseUpdate('orders', orderId, patch)

    // 앱 내 공지: 발주 직원 + 해당 매장 매니저에게 알림
    try {
      const storeName = String((orders[0] as { store_name?: string }).store_name || '').trim()
      const orderUserName = String((orders[0] as { user_name?: string }).user_name || '').trim()
      const recipients: { store: string; name: string }[] = []
      if (storeName && orderUserName) {
        recipients.push({ store: storeName, name: orderUserName })
      }
      const managers = await getManagersByStore(storeName)
      for (const m of managers) {
        if (!recipients.some((r) => r.store === m.store && r.name === m.name)) {
          recipients.push(m)
        }
      }
      if (recipients.length > 0) {
        const titleMap: Record<string, string> = {
          Approved: `주문 #${orderId} 승인되었습니다`,
          Rejected: `주문 #${orderId} 반려되었습니다`,
          Hold: `주문 #${orderId} 보류되었습니다`,
        }
        const contentMap: Record<string, string> = {
          Approved: `${storeName} 발주가 승인되었습니다. 배송 예정일을 확인해 주세요.`,
          Rejected: rejectReason ? `사유: ${rejectReason}` : '본사에서 반려 처리했습니다.',
          Hold: '추가 확인 후 진행 예정입니다.',
        }
        await sendNoticeToRecipients({
          title: titleMap[decision] || `주문 #${orderId} ${decision}`,
          content: contentMap[decision] || '',
          recipients,
          sender: processorName || '본사',
        })
      }
    } catch (noticeErr) {
      console.error('processOrderDecision notice:', noticeErr)
    }

    return NextResponse.json({ success: true, message: '처리되었습니다.' }, { headers })
  } catch (e) {
    console.error('processOrderDecision:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { headers }
    )
  }
}
