import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { supabaseSelectFilterStrippingUnknownColumns } from '@/lib/supabase-pgrst204-retry'
import { processPosStockDeduction, reversePosStockDeduction } from '@/lib/pos-stock-deduction'
import {
  hasJournalForSource,
  postPosOrderJournal,
  postPosOrderReversalJournal,
} from '@/lib/accounting-posting'
import {
  isPosCompletionStatus,
  isPosPaidLikeStatus,
  isPosReversalStatus,
  resolveBangkokAccountingDate,
} from '@/lib/pos-order-policy'
import { upsertPosVatLedgerDraft } from '@/lib/pos-ledger-drafts'

const ALLOWED_STATUSES = ['pending', 'paid', 'cooking', 'ready', 'completed', 'cancelled', 'refunded']

/** POS 주문 상태 변경 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { headers })
    }
    const fromOfflineQueueSync =
      String(req.headers.get('x-cm-offline-queue-sync') ?? '').trim().toLowerCase() === '1'
    const id = body.id != null ? Number(body.id) : NaN
    const status = String(body.status ?? '').trim()

    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: '주문 ID가 필요합니다.' }, { headers })
    }
    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, message: '유효하지 않은 상태입니다.' }, { headers })
    }

    const existing = (await supabaseSelectFilterStrippingUnknownColumns(
      'pos_orders',
      `id=eq.${id}`,
      {
        limit: 1,
        select:
          'id,order_no,store_code,total,subtotal,vat,status,created_at,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app,created_by',
      },
      'updatePosOrderStatus'
    )) as {
      id?: number
      order_no?: string
      store_code?: string
      total?: number
      subtotal?: number
      vat?: number
      status?: string
      created_at?: string
      payment_cash?: number
      payment_card?: number
      payment_qr?: number
      payment_other?: number
      payment_delivery_app?: number
      created_by?: string
    }[] | null
    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { headers })
    }
    const prev = existing[0]
    const prevStatus = String(prev?.status ?? '').trim().toLowerCase()
    const nextStatus = String(status).trim().toLowerCase()

    if (prevStatus === nextStatus) {
      return NextResponse.json({ success: true, noop: true }, { headers })
    }

    if (isPosReversalStatus(prevStatus) && isPosCompletionStatus(nextStatus)) {
      return NextResponse.json(
        { success: false, message: '취소/환불된 주문은 완료 상태로 되돌릴 수 없습니다.' },
        { status: 409, headers }
      )
    }
    if (isPosCompletionStatus(prevStatus) && !isPosCompletionStatus(nextStatus) && !isPosReversalStatus(nextStatus)) {
      // 오프라인 큐 재전송: 서버는 이미 completed 인데 큐에 paid 등 예전 단계 갱신만 남은 경우 → 큐 제거용 성공
      if (fromOfflineQueueSync) {
        return NextResponse.json(
          { success: true, noop: true, message: 'skip_stale_status_replay' },
          { headers }
        )
      }
      return NextResponse.json(
        { success: false, message: '완료 주문은 취소/환불 상태로만 변경할 수 있습니다.' },
        { status: 409, headers }
      )
    }

    await supabaseUpdate('pos_orders', id, { status })

    const storeCode = String(prev?.store_code ?? '').trim()
    const salesDate = resolveBangkokAccountingDate(String(prev?.created_at ?? ''))
    if (isPosCompletionStatus(nextStatus)) {
      if (storeCode) {
        try {
          const settings = (await supabaseSelectFilter(
            'pos_printer_settings',
            `store_code=eq.${encodeURIComponent(storeCode)}`,
            { limit: 1, select: 'auto_stock_deduction' }
          )) as { auto_stock_deduction?: boolean }[] | null
          if (settings?.[0]?.auto_stock_deduction) {
            await processPosStockDeduction(id)
          }
        } catch (e) {
          console.error('processPosStockDeduction:', e)
        }
      }

      const total = Number(prev?.total || 0)
      const vat = Number(prev?.vat || 0)
      const subtotal = Number(prev?.subtotal || Math.max(0, total - vat))
      const orderNo = String(prev?.order_no || `POS-${id}`)
      try {
        const alreadyPosted = await hasJournalForSource('pos_order', id)
        if (!alreadyPosted) {
          await postPosOrderJournal({
            posOrderId: id,
            salesDate,
            total,
            vatAmount: vat,
            paymentCash: Number(prev?.payment_cash || 0),
            paymentCard: Number(prev?.payment_card || 0),
            paymentQr: Number(prev?.payment_qr || 0),
            paymentOther: Number(prev?.payment_other || 0),
            paymentDeliveryApp: Number(prev?.payment_delivery_app || 0),
            storeName: storeCode || undefined,
            memo: 'POS 주문 완료 자동분개',
          })
        }
      } catch (postingErr) {
        console.error('updatePosOrderStatus posting:', postingErr)
      }
      try {
        await upsertPosVatLedgerDraft({
          posOrderId: id,
          orderNo,
          storeCode,
          createdAtIso: String(prev?.created_at ?? ''),
          subtotal,
          total,
          vatAmount: vat,
          createdBy: String(prev?.created_by ?? ''),
        })
      } catch (vatErr) {
        console.error('updatePosOrderStatus vat draft:', vatErr)
      }
    } else if (isPosReversalStatus(nextStatus) && isPosPaidLikeStatus(prevStatus)) {
      try {
        await reversePosStockDeduction(id)
      } catch (e) {
        console.error('reversePosStockDeduction:', e)
      }
      try {
        await postPosOrderReversalJournal({
          posOrderId: id,
          salesDate,
          storeName: storeCode || undefined,
          memo: `POS 주문 ${nextStatus === 'refunded' ? '환불' : '취소'} 역분개`,
        })
      } catch (postingErr) {
        console.error('updatePosOrderStatus reversal posting:', postingErr)
      }
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('updatePosOrderStatus:', e)
    const msg = e instanceof Error ? e.message : String(e)
    /**
     * 예전에는 503을 썼지만, 브라우저·Vercel 로그에서 "서비스 불가"로 오인되고,
     * 오프라인 큐(sync.ts)는 JSON message 대신 raw 텍스트로만 남는 경우가 있었음.
     * HTTP 200 + success:false 로 통일해 실제 원인(Supabase 오류 등)이 message로 전달되게 함.
     */
    return NextResponse.json(
      {
        success: false,
        message: msg.slice(0, 500),
        /** 첫 요청(apiFetchWithOffline)에서 구 503처럼 큐 재적재 허용 */
        retryAfterQueue: true,
      },
      { headers }
    )
  }
}
