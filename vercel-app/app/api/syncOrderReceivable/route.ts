/**
 * 이미 수령 완료된 주문의 Order 미수금을 현재 직접정산(지두방) 규칙에 맞게 재동기화
 * - 분개(postStorePurchaseJournal)는 건드리지 않음 (수령 시점 1회만)
 */
import { NextRequest, NextResponse } from 'next/server'
import { reconcileOrderReceivableById } from '@/lib/reconcile-order-receivable'
import { canSyncOrderReceivable } from '@/lib/permissions'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const body = await request.json()
    const orderId = Number(body.orderId ?? body.orderRowId ?? body.row)
    const userRole = String(body.userRole ?? body.user_role ?? '').toLowerCase()

    if (!orderId || Number.isNaN(orderId)) {
      return NextResponse.json({ success: false, message: 'orderId가 필요합니다.' }, { headers })
    }
    if (!canSyncOrderReceivable(userRole)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
    }

    const r = await reconcileOrderReceivableById(orderId)

    if (!r.ok) {
      const msg =
        r.skipReason === 'order_not_found'
          ? '주문을 찾을 수 없습니다.'
          : r.error || r.skipReason || '처리 실패'
      return NextResponse.json({ success: false, message: msg }, { headers })
    }

    if (r.kind === 'skipped' && r.skipReason === 'not_delivered') {
      return NextResponse.json(
        { success: false, message: '수령 완료된 주문만 동기화할 수 있습니다.' },
        { headers }
      )
    }

    if (r.kind === 'skipped' && r.skipReason === 'no_store_name') {
      return NextResponse.json(
        { success: false, message: '매장명이 없어 미수금을 반영할 수 없습니다.' },
        { headers }
      )
    }

    const removed = r.kind === 'removed' || r.kind === 'orphan_removed'
    const totalHQ = r.totalHQ ?? 0

    return NextResponse.json(
      {
        success: true,
        orderId,
        subtotalHQ: r.subtotalHQ,
        totalHQ,
        removed,
        message:
          r.kind === 'orphan_removed'
            ? '삭제된 주문의 미수금 행을 제거했습니다.'
            : removed
              ? '본사 정산분이 없어 Order 미수금을 제거했습니다.'
              : '미수금을 재계산해 반영했습니다.',
      },
      { headers }
    )
  } catch (e) {
    console.error('syncOrderReceivable:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
