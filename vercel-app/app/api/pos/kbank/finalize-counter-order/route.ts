import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { authCanAccessPosStoreWrite } from '@/lib/pos-store-access-server'
import { finalizeCounterPosKbankQrOrder } from '@/lib/pos-kbank-counter-qr-finalize'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function withCorsHeaders(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

export async function OPTIONS() {
  return withCorsHeaders(new NextResponse(null, { status: 204 }))
}

/**
 * 카운터 KBank QR 승인 후 pending finalize 가 없을 때 서버에서 status 마감.
 * 웹훅과 동일 헬퍼(finalizeCounterPosKbankQrOrder) 사용.
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req, 'any')
  if (authResult.errorResponse) return withCorsHeaders(authResult.errorResponse)
  const auth = authResult.auth

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const orderId = Math.floor(Number(body.orderId || 0))
    const paymentQrAmount = Math.max(0, Number(body.paymentQrAmount || body.amount || 0) || 0)
    const storeCodeHint = String(body.storeCode || '').trim()

    if (!(orderId > 0)) {
      return withCorsHeaders(
        NextResponse.json({ success: false, message: 'orderId is required' }, { status: 400 })
      )
    }

    let storeCode = storeCodeHint
    if (!storeCode) {
      const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
        limit: 1,
        select: 'store_code',
      })) as Array<{ store_code?: string | null }>
      storeCode = String(rows?.[0]?.store_code || '').trim()
    }

    if (storeCode) {
      const allowed = await authCanAccessPosStoreWrite(auth, storeCode)
      if (!allowed) {
        return withCorsHeaders(
          NextResponse.json({ success: false, message: 'forbidden' }, { status: 403 })
        )
      }
    }

    const result = await finalizeCounterPosKbankQrOrder({
      orderId,
      paymentQrAmount,
    })

    if (!result.ok) {
      return withCorsHeaders(
        NextResponse.json(
          { success: false, message: result.message || 'finalize_failed', orderId },
          { status: result.message === 'order_not_found' ? 404 : 400 }
        )
      )
    }

    return withCorsHeaders(
      NextResponse.json({
        success: true,
        alreadyPaid: Boolean(result.alreadyPaid),
        orderId: result.orderId ?? orderId,
        status: result.status ?? null,
        tableName: result.tableName ?? null,
        storeCode: result.storeCode || storeCode || null,
        orderType: result.orderType ?? null,
      })
    )
  } catch (e) {
    console.error('pos/kbank/finalize-counter-order:', e)
    return withCorsHeaders(
      NextResponse.json(
        { success: false, message: e instanceof Error ? e.message : String(e) },
        { status: 500 }
      )
    )
  }
}
