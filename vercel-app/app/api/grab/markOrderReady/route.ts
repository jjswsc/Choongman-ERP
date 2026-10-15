import { NextRequest, NextResponse } from 'next/server'
import { grabMarkOrderReady } from '@/lib/grab-partner-api'
import { extractGrabOrderIdFromMemo } from '@/lib/grab-order-memo'
import { getGrabPackCompleteMarksReady } from '@/lib/pos-delivery-policy'
import { writePosOrderAuditTrail } from '@/lib/pos-order-audit'
import { authCanAccessPosStoreWrite } from '@/lib/pos-store-access-server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

type PosOrderRow = { id: number; order_no?: string; store_code?: string; memo?: string }

const POS_ORDER_SELECT = 'id,order_no,store_code,memo'

async function findPosOrder(posOrderId: number, grabOrderId: string): Promise<PosOrderRow | null> {
  if (posOrderId > 0) {
    const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${posOrderId}`, {
      limit: 1,
      select: POS_ORDER_SELECT,
    })) as PosOrderRow[] | null
    return rows?.[0] ?? null
  }
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const rows = (await supabaseSelectFilter(
    'pos_orders',
    `created_at=gte.${encodeURIComponent(since)}&memo=ilike.${encodeURIComponent(`*grab_order:${grabOrderId}*`)}`,
    { limit: 1, select: POS_ORDER_SELECT, order: 'id.desc' }
  )) as PosOrderRow[] | null
  return rows?.[0] ?? null
}

/**
 * Grab mark order ready.
 * trigger 'pack_complete'(기본 — 구버전 POS는 포장 완료에서만 호출): 매장 정책
 * `pos_delivery_app_policies.pack_complete_marks_grab_ready`가 false면 전송하지 않음.
 * trigger 'manual': 배달 패널 「Grab에 준비완료 알림」 버튼 — 항상 전송.
 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const authResult = await requireAuth(req, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth!

    const body = (await req.json()) as {
      orderID?: string
      markStatus?: number
      posOrderId?: number
      trigger?: string
    }
    const orderID = String(body?.orderID || '').trim()
    const markStatus = Number(body?.markStatus || 0)
    if (!orderID || ![1, 2].includes(markStatus)) {
      return NextResponse.json({ success: false, message: 'orderID_markStatus_required' }, { status: 400, headers })
    }
    const trigger = String(body?.trigger || '').trim() === 'manual' ? 'manual' : 'pack_complete'

    const posOrder = await findPosOrder(Math.floor(Number(body?.posOrderId || 0)), orderID)
    if (posOrder) {
      if (!(await authCanAccessPosStoreWrite(auth, String(posOrder.store_code ?? '')))) {
        return NextResponse.json(
          { success: false, message: '해당 매장에 대한 권한이 없습니다.' },
          { status: 403, headers }
        )
      }
      if (extractGrabOrderIdFromMemo(String(posOrder.memo ?? '')) !== orderID) {
        return NextResponse.json({ success: false, message: 'grab_order_mismatch' }, { status: 400, headers })
      }
    } else if (trigger === 'manual') {
      return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { status: 404, headers })
    }

    if (
      trigger === 'pack_complete' &&
      posOrder &&
      !(await getGrabPackCompleteMarksReady(String(posOrder.store_code ?? '')))
    ) {
      return NextResponse.json({ success: true, sent: false, skipped: 'store_policy' }, { headers })
    }

    await grabMarkOrderReady({ orderID, markStatus: markStatus as 1 | 2 })

    if (posOrder) {
      await writePosOrderAuditTrail({
        orderId: posOrder.id,
        orderNo: String(posOrder.order_no ?? '') || null,
        storeCode: String(posOrder.store_code ?? '').trim() || null,
        actionType: 'grab_mark_ready',
        source: 'api',
        actor: {
          name: String(auth.name || '').trim() || null,
          role: String(auth.role || '').trim() || null,
          store: String(auth.store || '').trim() || null,
          employeeCode: String(auth.employeeCode || '').trim() || null,
          employeeId:
            auth.employeeId != null && Number.isFinite(Number(auth.employeeId))
              ? Math.floor(Number(auth.employeeId))
              : null,
        },
        reason: `trigger:${trigger} grab_order:${orderID} markStatus:${markStatus}`,
      }).catch((e) => console.error('grab markOrderReady audit:', e))
    }

    return NextResponse.json({ success: true, sent: true }, { headers })
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
